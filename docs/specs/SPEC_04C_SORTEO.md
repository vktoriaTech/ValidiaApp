# SPEC-04C: Actividad tipo Sorteo
**Proyecto:** Validia MVP
**Versión:** 0.3
**Estado:** Borrador
**Última actualización:** 2026-08-05
**Depende de:** SPEC-04A (Campañas/Actividades), SPEC-04B (Motor de Participación)
**Precede a:** implementación de `backend/app/services/rules/sorteo.py`

> **Estado de decisiones:** todas las preguntas de negocio de este spec están resueltas (D-001, D-002, D-003, D-004, D-007 — ver `docs/DECISIONES_PENDIENTES.md`). Este spec no tiene asunciones temporales abiertas. Listo para implementación.

> **⚠️ v0.3 — cambio de modelo (D-007, autoritativo).** Esta versión reemplaza el modelo de **umbral único** (`min_amount` global + `ticket_mode`) por un modelo de **umbral por premio**. La sección **§3.2** es autoritativa y prevalece sobre cualquier referencia a `min_amount` global, `ticket_mode` o "remanente" que aparezca más abajo en sus formas originales (§1.2, §1.3, §5.2 y §7 fueron actualizadas; el resto del texto se conserva como contexto histórico). Cambios de fondo:
> 1. **Mecánica ≠ reglas.** Mecánica = `"acumulacion"` (única del MVP), en `participation_method`. Reglas de elegibilidad en `rules` (JSONB).
> 2. **Elegibilidad por premio.** Cada premio tiene `min_amount` (umbral) y `max_participations` (tope de boletas por participante).
> 3. **Acumulado total, no remanente.** `accumulated_amount` guarda el total válido acumulado; las boletas por premio se calculan al sortear.
> 4. Se elimina `ticket_mode`. Se corrige el schema `rules: list` → `rules: dict`.

---

## 1. Conceptos y vocabulario

### 1.1 ¿Qué es un Sorteo en Validia?

Un Sorteo es una actividad promocional en la que los consumidores acumulan **boletas** a cambio de compras verificadas (facturas electrónicas), y al cierre de la actividad el sistema selecciona aleatoriamente qué boletas son ganadoras de cada premio.

El consumidor no sabe de antemano si ganó — ese es el diferenciador frente a Rotación (donde el premio es inmediato) y frente a Incentivo (donde se premia el volumen de ventas de un vendedor). En Sorteo, participar es necesario pero no suficiente: ganar depende del azar.

### 1.2 Boleta

La unidad de participación en un Sorteo. Cada boleta representa un derecho a ser seleccionada. **[v0.3]** Las boletas se calculan **por premio** a partir del monto total acumulado: para el premio *p*, `boletas_p = min(floor(acumulado_total / umbral_p), tope_p)` — ver §3.2. Un participante puede tener distinta cantidad de boletas en cada premio, o cero si no alcanza el umbral de ese premio.

Ejemplo: premio con umbral $100.000 y tope 5. Ana acumula $250.000 → 2 boletas para ese premio.

### 1.3 Acumulación de factura (mecánica única del MVP)

**[v0.3]** La mecánica del MVP es siempre **acumulación**: las facturas válidas (POS + fecha correctos) suman al **acumulado total** del participante durante toda la vigencia. Ese total es la única base para calcular boletas al momento del sorteo. Se elimina la distinción `ticket_mode` "single/accumulated" de la v0.2 y el concepto de "remanente": ya no se guarda saldo residual sino el total. Ver §3.2.5.

### 1.4 Mecánica vs. reglas (recordatorio de SPEC-04B §1)

- **Mecánica** (cómo entra alguien): consumidor escanea QR → WhatsApp → sube foto de factura → bot extrae CUFE → se valida contra DIAN.
- **Reglas** (si esa entrada cuenta y cuánto vale): ¿la factura supera el monto mínimo? ¿es de un POS válido? ¿cae dentro del período de la actividad? ¿cuántas boletas genera?

Ambas se configuran por actividad en el wizard y no se mezclan en el código.

### 1.5 Cierre por sistema vs. cierre externo

- **Sistema (`closure_type = "system"`):** el algoritmo de Validia selecciona los ganadores al ejecutar `/draw`. El acta queda trazable y reproducible (se guarda la semilla del sorteo).
- **Externo (`closure_type = "external"`):** el sorteo lo conduce un notario u otra entidad externa. El admin ingresa manualmente los ganadores en Validia. En ese caso `/draw` no corre el algoritmo — solo recibe y registra los resultados.

---

## 2. Descripción general y objetivo

**Pregunta de negocio que responde:** ¿cómo configura un cliente (tenant) una actividad donde los consumidores finales participan subiendo sus facturas de compra y al cierre se realiza un sorteo aleatorio entre boletas válidas para entregar premios?

**Lo que este spec crea en el sistema:**

1. La lógica de evaluación de participación específica de Sorteo: validar que la factura cumpla las reglas, calcular cuántas boletas genera (acumulando saldo si aplica), y devolver ese resultado al motor base (SPEC-04B).
2. El algoritmo de selección de ganadores (`select_winners`) que corre cuando el admin ejecuta el cierre por sistema.
3. La persistencia del saldo acumulado entre participaciones (para el modo `ticket_mode = "accumulated"`).
4. El soporte para cierre externo (ingreso manual de ganadores).

**Lo que NO define este spec:**

- La mecánica de WhatsApp/bot (fuera de alcance de los specs de tipo — eso es H9).
- Cómo se valida el CUFE contra la DIAN (ya existe, SPEC-04B lo reutiliza).
- La configuración del wizard (ya existe en SPEC-04A).

**Alcance:** este documento decide todo lo que va en `rules/sorteo.py` y las columnas/campos adicionales que el Sorteo necesita que el motor base no cubre.

---

## 3. Punto de partida (qué ya existe vs. qué falta)

| Elemento | Estado |
|---|---|
| `Campaign.rules` (JSONB) | Existe. El wizard ya guarda `min_amount`, fechas, POS. Falta leerlo. |
| `Campaign.activity_type` (enum) | Existe. El valor `"sorteo"` ya está en el enum. |
| `Campaign.closure_type` | Existe (`"system"` \| `"external"`). |
| `Participation` (tickets, points, is_winner, winner_prize, rules_applied) | Existe. Ningún endpoint la escribe todavía. |
| `Invoice` (CUFE validado) | Existe y funcional. Sin vínculo a campaña — correcto (vínculo vive en `Participation`). |
| `Participant.accumulated_amount` | **No existe.** Se necesita para el modo `ticket_mode = "accumulated"` — el saldo entre facturas no tiene dónde vivir hoy. Ver sección 5. |
| `rules/sorteo.py` | **No existe.** Este spec lo define. |
| `participation_service.py` | **No existe.** Lo define SPEC-04B. Este spec se monta sobre él. |

### 3.1 Reconciliación de campos con el modelo real (autoritativo)

Los nombres de campo usados en el resto de este spec eran ilustrativos. Estos son los campos **reales** en el código; **prevalecen sobre cualquier nombre distinto que aparezca más abajo**:

| Referencia en el spec | Campo real en el modelo | Notas |
|---|---|---|
| `invoice.total_amount` | `Invoice.amount` — `Numeric(14,2)`, **nullable** | Guardar contra `None` antes de comparar/sumar. |
| `invoice.issue_date` / `Invoice.date` | `Invoice.invoice_date` — `DateTime(tz)`, **nullable** | Guardar contra `None` antes de comparar con el rango. |
| `invoice.pos_id` | **No existe.** La factura trae `Invoice.pos_nit` — `String(20)` | El vínculo factura↔POS es por NIT, no por UUID. |

**Implicación para R02 (POS elegible).** `rules.pos_ids` contiene UUIDs de `POS`, pero la factura no tiene `pos_id`. La validación es:
1. Cargar los `POS` cuyo `id` esté en `rules.pos_ids`, dentro del tenant de la actividad.
2. Tomar su campo `nit_emisor` (`String(20)`, el NIT del emisor).
3. La factura es elegible por POS si `invoice.pos_nit` coincide con el `nit_emisor` de alguno de esos POS.

Si `rules.pos_ids` está vacío, se aceptan todos los POS del tenant (no se filtra por NIT).

---

## 3.2 Modelo de reglas por premio (v0.3 — AUTORITATIVO)

Esta sección define el modelo vigente de mecánica y reglas. Prevalece sobre toda referencia previa a `min_amount` global, `ticket_mode` o "saldo remanente".

### 3.2.1 Mecánica vs. reglas (separadas)

- **Mecánica** — cómo cuenta la evidencia. MVP: única opción `"acumulacion"` (acumulación de factura). Se persiste en `Campaign.participation_method` (`String(50)`) con el valor `"acumulacion"`. El wizard la presenta como un selector con una sola opción habilitada ("Acumulación de factura").
- **Reglas** — qué condiciones hacen elegible al participante. Viven en `Campaign.rules` (JSONB) y se definen **por premio**.

### 3.2.2 Umbral y tope por premio

Cada premio creado en el Step 2 del wizard recibe dos valores que llena el cliente:

| Campo | Significado |
|---|---|
| `min_amount` (umbral) | Monto mínimo **acumulado** en facturas válidas para que el participante sea elegible a ese premio. |
| `max_participations` (tope) | Número máximo de boletas que un mismo participante puede tener en el sorteo de ese premio. |

**Boletas de un participante para el premio *p*:**

```
si acumulado_total >= min_amount_p:
    boletas_p = min( floor(acumulado_total / min_amount_p), max_participations_p )
si no:
    boletas_p = 0
```

- `max_participations_p = 1` → el premio se comporta como *gate*: una sola oportunidad al superar el umbral, sin importar cuánto más compre.
- `max_participations_p` alto → *proporcional*: más compra = más boletas, con techo en el tope.

### 3.2.3 Un premio vs. varios premios (UI)

- **Un solo premio:** la UI muestra un único par de campos (umbral + tope), sin selector de premio.
- **Varios premios:** cada premio (identificado por su jerarquía/`order`) tiene su propio par de campos. Un participante puede quedar elegible a unos premios y a otros no, según su acumulado.

Ambos casos se persisten con la misma estructura (`eligibility.prizes` con una o varias entradas).

### 3.2.4 Jerarquía de premios (`Prize.order`)

Los premios se ordenan **explícitamente** de mayor a menor con el campo `Prize.order` (ya existe en el modelo y el schema; hoy el wizard lo asigna por índice de creación). El Step 2 debe permitir al cliente fijar el orden (input numérico o reordenamiento), de modo que la jerarquía no dependa del orden de creación.

`order` (jerarquía/etiqueta) y `min_amount` (umbral) son **independientes**: el sistema no obliga a que el premio de mayor jerarquía tenga el mayor umbral. El anidamiento natural ocurre solo si el cliente así lo configura (umbral del mayor ≥ umbral del secundario ⇒ quien califica al mayor entra también al pool del secundario).

### 3.2.5 Acumulado total (no remanente)

`CampaignParticipantAccumulation.accumulated_amount` guarda el **monto total válido acumulado** por participante durante toda la vigencia (suma de todas las facturas que pasaron POS + fecha), **no** el saldo remanente. Es perpetuo, sin reinicios (D-002). Las boletas por premio se calculan a partir de este total en el momento del sorteo — nunca por factura, porque con umbrales distintos por premio el remanente no es representable.

### 3.2.6 Estructura de `rules` (autoritativa)

```json
{
  "mechanic": "acumulacion",
  "date_start": "2026-08-01",
  "date_end": "2026-10-31",
  "pos_ids": ["uuid1", "uuid2"],
  "eligibility": {
    "type": "threshold_per_prize",
    "prizes": [
      { "prize_order": 1, "min_amount": 500000, "max_participations": 3 },
      { "prize_order": 2, "min_amount": 200000, "max_participations": 5 }
    ]
  }
}
```

- `eligibility.prizes[i].prize_order` referencia `Prize.order`. La identidad del premio (nombre, tipo, cantidad de unidades a entregar) vive en la tabla `prizes`; `rules` solo agrega los números de la regla.
- `date_start`/`date_end` y `pos_ids` los escribe el wizard reflejando `starts_at`/`ends_at` y los POS seleccionados. (La duplicación de fechas con las columnas `Campaign.starts_at/ends_at` se acepta como deuda menor; unificar a futuro.)
- El wizard **debe** escribir este objeto en `Campaign.rules` al crear/editar la actividad. Que no lo escribiera era la causa de que el motor recibiera `rules = null` y no generara boletas.

### 3.2.7 Fix de schema

`CampaignCreate.rules` y `CampaignUpdate.rules` en `backend/app/schemas/campaign.py` están tipados como `list | None` y deben ser **`dict | None`** (el modelo ORM `Campaign.rules` ya es `dict`). `CampaignDetailResponse.rules` igual: `dict | None`.

---

## 4. Flujo end-to-end (Sorteo)

> **[v0.3]** El diagrama de abajo conserva la narrativa general, pero los pasos 7–10 (cálculo de boletas con `min_amount` único y remanente) quedan **reemplazados** por el modelo por premio de §3.2 y §7.1: se suma la factura al acumulado total y las boletas se calculan por premio al sortear. Ante diferencias, mandan §3.2 / §7.

```
Consumidor compra en POS participante
        ↓
Escanea QR del Sorteo → abre WhatsApp con el bot de Validia   [H9]
        ↓
Bot solicita foto de factura → extrae CUFE                     [H9]
        ↓
POST /api/v1/campaigns/{campaign_id}/participations
  Body: { cufe, cedula, phone_wa, full_name }
        ↓
  [Motor base — SPEC-04B]
  1. Verifica actividad active + activity_type == "sorteo"
  2. Resuelve/crea Participant (por cédula, dentro del tenant)
  3. Verifica aceptación de TyC vigente (CampaignTermsAcceptance)
  4. Valida CUFE → crea o reutiliza Invoice
        ↓
  [Motor Sorteo — este spec, evaluate_participation()]
  5. Verifica que Invoice.invoice_date esté dentro del periodo de la actividad
     → Si falla: rechaza con reason="invoice_date_out_of_range". El monto NO acumula.
  6. Verifica que Invoice.pos_nit coincida con el nit_emisor de algún POS de rules.pos_ids (si está configurado)
     → Si falla: rechaza con reason="pos_not_eligible". El monto NO acumula.
  7. Verifica monto:
     · ticket_mode == "single":      invoice.total >= min_amount → elegible
     · ticket_mode == "accumulated": (saldo_anterior + invoice.total) >= min_amount → elegible
  8. Calcula boletas generadas = floor(monto_efectivo / min_amount)
  9. Calcula nuevo saldo acumulado = monto_efectivo % min_amount
  10. Actualiza CampaignParticipantAccumulation.accumulated_amount = nuevo_saldo (saldo perpetuo durante toda la vigencia)
     → Si tickets == 0: eligible=false, pero el saldo acumula igual — la factura es válida, solo aún no alcanza el mínimo.
        ↓
  [Motor base — SPEC-04B]
  11. Crea Participation con tickets=boletas_generadas, rules_applied={detalle de evaluación}
        ↓
Respuesta al bot: boletas recibidas, total acumulado, saldo remanente  [H9 consume esto]

...la actividad sigue abierta hasta la fecha de cierre...

Admin cierra la actividad (status → "closed")

Si closure_type == "system":
        ↓
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/draw
        ↓
  [Motor base valida status == closed]
  [Sorteo — select_winners()]
  Construye lista de boletas: por cada Participation elegible, expande tickets (1 Participation
  con tickets=3 aparece 3 veces en el pool)
        ↓
  Para cada premio (en orden de valor descendente):
    · random.choice(pool) → ganador
    · marca Participation.is_winner=True, winner_prize={nombre_premio}
    · las boletas del ganador permanecen en el pool (puede ganar otros premios)
    · guarda semilla del sorteo en draw_result (trazabilidad)
        ↓
  Devuelve lista de ganadores por premio

Si closure_type == "external":
        ↓
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/draw
  Body: { winners: [{participation_id, prize_name}] }
        ↓
  Motor registra ganadores tal como los recibe (sin correr algoritmo)
        ↓
Admin archiva actividad (status → "archived")
```

---

## 5. Modelo de datos

### 5.1 Tabla nueva: `campaign_participant_accumulations`

Necesaria para el modo `ticket_mode = "accumulated"`. Guarda el saldo de monto no convertido en boleta todavía, por participante por actividad.

```sql
CREATE TABLE campaign_participant_accumulations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    accumulated_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, participant_id)
);
CREATE INDEX idx_camp_part_accum_campaign ON campaign_participant_accumulations(campaign_id);
```

> **[v0.3]** Esta tabla es siempre necesaria: la mecánica única (acumulación) requiere el acumulado total por participante. `accumulated_amount` guarda el **total válido acumulado** (no el remanente).

### 5.2 Contenido de `Campaign.rules` (JSONB — no requiere migración de columna)

> **v0.3:** la estructura autoritativa está en **§3.2.6**. El bloque de abajo queda como referencia rápida; ante cualquier diferencia, manda §3.2.6.

```json
{
  "mechanic": "acumulacion",
  "date_start": "2026-08-01",
  "date_end":   "2026-10-31",
  "pos_ids":    ["uuid1", "uuid2"],            // vacío = todos los POS del tenant
  "eligibility": {
    "type": "threshold_per_prize",
    "prizes": [
      { "prize_order": 1, "min_amount": 500000, "max_participations": 3 },
      { "prize_order": 2, "min_amount": 200000, "max_participations": 5 }
    ]
  }
}
```

> El wizard **debe** escribir este objeto en `Campaign.rules`. La identidad de cada premio (nombre, tipo, unidades) sigue en la tabla `prizes`; `rules.eligibility.prizes` referencia por `prize_order` = `Prize.order`.

### 5.3 Campo `draw_seed` en `Campaign`

Para auditoría del sorteo por sistema, se guarda la semilla aleatoria usada. **Opción recomendada:** guardar en `Campaign.rules` (JSONB) bajo la clave `draw_result` al momento del cierre — no requiere columna nueva.

```json
"draw_result": {
  "seed": "abc123...",
  "drawn_at": "2026-10-31T20:00:00Z",
  "winners": [...]
}
```

### 5.4 Resumen de migraciones

| Cambio | Tipo |
|---|---|
| Crear `campaign_participant_accumulations` | Migración de Alembic nueva |
| `Campaign.rules` — nuevas claves JSON | Sin migración (JSONB ya existe) |
| `draw_result` dentro de `Campaign.rules` | Sin migración |

---

## 6. Endpoints específicos de Sorteo

Además de los endpoints base de SPEC-04B (registrar participación, listar, draw, ganadores), el Sorteo no requiere endpoints adicionales propios. Los específicos de tipo quedan cubiertos por los parámetros de body que difieren por tipo:

### 6.1 Registrar participación (extensión del body base)

> **Ruta (participante/bot — `public_router`).** Este endpoint lo dispara el consumidor/bot, por eso vive en el `public_router` con prefix `/campaigns` (mismo patrón que `POST /campaigns/{id}/terms/accept`), sin auth de admin. Ver la convención de rutas por actor en SPEC-04B §6.

```
POST /api/v1/campaigns/{campaign_id}/participations
```

**Request body:**
```json
{
  "cufe":       "abc123...",
  "cedula":     "1234567890",
  "phone_wa":   "573001234567",
  "full_name":  "Ana García",
  "channel":    "whatsapp"
}
```

**Response 201:**
```json
{
  "participation_id": "uuid",
  "eligible":         true,
  "tickets_earned":   2,
  "tickets_total":    5,
  "accumulated_remaining": 50000,
  "reason":           null
}
```

**Response 200 (no elegible — se guarda pero no genera boletas):**
```json
{
  "participation_id": "uuid",
  "eligible":         false,
  "tickets_earned":   0,
  "tickets_total":    3,
  "accumulated_remaining": 60000,
  "reason":           "invoice_amount_below_minimum"
}
```

**Errores:**
| Código | Condición |
|---|---|
| 400 | Actividad no está `active` |
| 400 | TyC no aceptados y flujo de aceptación no disponible |
| 404 | `campaign_id` no existe en el tenant |
| 422 | CUFE inválido o no encontrado en DIAN |
| 422 | Factura fuera del período de la actividad |
| 422 | POS de la factura no está en la lista de POS de la actividad |
| 409 | CUFE ya registrado en esta actividad (duplicado) |

### 6.2 Ejecutar sorteo / registrar ganadores externos (admin — `router`)

> **Ruta (admin — `router`).** El sorteo lo corre el admin, por eso este endpoint es tenant-scoped y autenticado (prefix `/tenants`). Ver convención en SPEC-04B §6.

```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/draw
```

**Si `closure_type == "system"`** — body vacío `{}`, el sistema corre el algoritmo.

**Si `closure_type == "external"`** — body con ganadores:
```json
{
  "winners": [
    { "participation_id": "uuid1", "prize_name": "Carro" },
    { "participation_id": "uuid2", "prize_name": "Remodelación" }
  ]
}
```

**Response 200:**
```json
{
  "drawn_at": "2026-10-31T20:05:00Z",
  "closure_type": "system",
  "winners": [
    {
      "participation_id": "uuid",
      "participant_name": "Ana García",
      "cedula": "1234567890",
      "tickets": 5,
      "prize": "Carro"
    }
  ]
}
```

**Errores:**
| Código | Condición |
|---|---|
| 400 | Actividad no está `closed` |
| 400 | Sorteo ya ejecutado (idempotencia — devuelve resultado anterior) |
| 422 | `closure_type == "external"` y body vacío o `participation_id` no existe |

### 6.3 Consulta de estado del participante — contador de boletas (v0.3)

Un participante puede consultar en cualquier momento cuántas boletas (oportunidades) lleva en el sorteo — el equivalente digital a preguntar "¿cuántas tirillas he depositado en el buzón?".

**Principio de diseño: el contador es DERIVADO, no persistido.** La única fuente de verdad es `CampaignParticipantAccumulation.accumulated_amount` (monto total válido acumulado). No se guarda un contador de boletas por separado — se calcula al vuelo, evitando cualquier desincronización entre "acumulado" y "boletas". Como las reglas quedan congeladas al activar la actividad, la derivación es estable y reproducible.

Para cada premio *p*:
```
boletas_p           = min( floor(total / umbral_p), tope_p )   si total >= umbral_p, si no 0
remanente_p         = total mod umbral_p                        # monto ya avanzado hacia la próxima boleta
falta_siguiente_p   = umbral_p - remanente_p                    # cuánto más comprar para otra boleta (si no topó)
```

- **Un solo premio** → un único número (analogía exacta del buzón del supermercado).
- **Varios premios** → un desglose por premio (un "buzón" por premio, cada uno con su propio precio-por-boleta).

**Endpoint (participante/bot — `public_router`). Estado: contemplado, implementación futura (H9).**

```
GET /api/v1/campaigns/{campaign_id}/participants/status?cedula={cedula}
```

**Response 200:**
```json
{
  "accumulated_total": 250000,
  "prizes": [
    { "prize_order": 1, "prize_name": "Carro",   "min_amount": 500000, "max_participations": 3, "boletas": 0, "falta_para_siguiente": 250000 },
    { "prize_order": 2, "prize_name": "Mercado",  "min_amount": 200000, "max_participations": 5, "boletas": 1, "falta_para_siguiente": 150000 }
  ]
}
```

> Este spec deja definido **el dato y la forma de la respuesta**. El disparo desde WhatsApp (el participante le pregunta al bot "¿cuántas boletas tengo?") es parte del flujo del participante (H9) y se cablea cuando se aborde ese spec. Ver DT-005.

---

## 7. Contratos e interfaces (implementación de SPEC-04B §7)

> **v0.3 — autoritativo.** Las firmas y la lógica de abajo reemplazan a las de la v0.2. Modelo por premio, acumulado total, boletas calculadas al sortear.

### 7.1 `evaluate_participation` — implementación Sorteo (v0.3)

```python
# backend/app/services/rules/sorteo.py

def evaluate_participation(
    db: Session,
    campaign: Campaign,
    invoice: Invoice,
    participant: Participant,
    pos: POS | None,
    extra: dict,   # no usado en Sorteo
) -> ParticipationResult:
    """
    1. Rechazo duro por fecha: si invoice.invoice_date no está en [rules.date_start, rules.date_end]
       → HTTPException 422 reason="invoice_date_out_of_range". No acumula. (D-005: auditar antes de propagar.)
    2. Rechazo duro por POS: invoice.pos_nit debe coincidir con el nit_emisor de algún POS de rules.pos_ids
       (si la lista no está vacía; ver §3.1) → HTTPException 422 reason="pos_not_eligible". No acumula. (D-005.)
    3. Acumulación (mecánica única = acumulacion):
       accum = get_or_create_accumulation(...)
       accum.accumulated_amount = (accum.accumulated_amount or 0) + (invoice.amount or 0)   # TOTAL, no remanente
       total = accum.accumulated_amount
    4. Calcular boletas por premio a partir de rules.eligibility.prizes:
       for p in prizes:
           umbral = p["min_amount"]; tope = p["max_participations"]
           boletas_p = min(floor(total / umbral), tope) if (umbral > 0 and total >= umbral) else 0
    5. eligible = any(boletas_p > 0)   # elegible a al menos un premio
       reason = None if eligible else "invoice_amount_below_minimum"
    6. Devuelve ParticipationResult con:
       - eligible, points=0, immediate_winner=False
       - tickets = suma informativa de boletas del premio de menor umbral (headline para el bot);
         el sorteo NO usa este número — recomputa por premio desde el acumulado (§7.2).
       - rules_applied = {
             "mechanic": "acumulacion",
             "accumulated_total": float(total),
             "invoice_amount": float(invoice.amount or 0),
             "per_prize": [ {"prize_order": .., "min_amount": .., "max_participations": .., "boletas": ..}, ... ],
             "rejection_reason": reason,
         }
    """
```

> **Nota de contrato.** La factura sigue registrándose como `Participation` (dedup por CUFE R03, trazabilidad, `eligible`/`reason`). La fuente de verdad para el sorteo es `CampaignParticipantAccumulation.accumulated_amount`, no `Participation.tickets`.

### 7.2 `select_winners` — implementación Sorteo (v0.3)

```python
def select_winners(
    db: Session,
    campaign: Campaign,
    seed: str,
) -> list[WinnerAssignment]:
    """
    [D-003 / D-006] Aleatorio simple con reposición, POR POOL DE PREMIO.

    1. Cargar premios de la tabla `prizes` (campaign_id) ordenados por `order` (mayor→menor).
    2. Cargar rules.eligibility.prizes indexado por prize_order → (min_amount, max_participations).
    3. Cargar todas las CampaignParticipantAccumulation de la actividad (una por participante).
    4. rng = random.Random(seed)   # semilla guardada en rules["draw_result"]["seed"] para reproducibilidad
    5. Para cada premio p (en orden):
         umbral, tope = regla por p.order
         pool_p = []
         for accum in accumulations:
             total = accum.accumulated_amount or 0
             boletas = min(floor(total / umbral), tope) if (umbral > 0 and total >= umbral) else 0
             pool_p.extend([accum.participant_id] * boletas)
         if not pool_p:            # nadie califica a este premio
             continue              # premio queda desierto (registrar en draw_result)
         for _ in range(p.quantity):        # unidades del premio
             winner = rng.choice(pool_p)    # CON reposición: las boletas del ganador permanecen
             assignments.append(WinnerAssignment(participant_id=winner, prize_name=p.name))
    6. Devolver assignments.

    Nota: cada premio se sortea sobre SU propio pool. Un participante que califica a varios
    premios entra a varios pools (puede ganar más de uno; R08). La restricción "un ganador,
    un premio" es responsabilidad de los T&C del cliente, no de la herramienta.
    """
```

> **Cambios de contrato respecto a v0.2:**
> - `WinnerAssignment` pasa a llevar `participant_id` (el ganador es un participante, no una factura). El endpoint de ganadores resuelve nombre/cédula desde `Participant`. Ajustar `base.py`.
> - `select_winners` recibe `db` y `seed` (ya no `eligible_participations`); construye los pools desde las acumulaciones. El orquestador de SPEC-04B debe adaptarse a la nueva firma.

---

## 8. Reglas de negocio

Las condiciones que este spec decide (las abiertas están marcadas):

| # | Regla | Estado |
|---|---|---|
| R01 | La factura debe tener fecha dentro del periodo `[date_start, date_end]` de la actividad | Definido |
| R02 | Si `rules.pos_ids` no está vacío, la factura debe pertenecer a uno de esos POS | Definido |
| R03 | El mismo CUFE no puede registrarse dos veces en la misma actividad (409) | Definido |
| R04 | Una participación no elegible se guarda igual, con `eligible=false` y `reason` — no se descarta | Definido (heredado de 04B) |
| R05 | **[v0.3]** Mecánica única del MVP = acumulación. Se elimina `ticket_mode`. La elegibilidad se evalúa **por premio** con `min_amount` (umbral) y `max_participations` (tope) — ver §3.2. | ✅ Confirmado (D-007, 2026-08-05) |
| R06 | **[v0.3]** El **acumulado total** por participante es perpetuo durante toda la vigencia (`accumulated_amount` = total válido, no remanente). Sin ventanas ni reinicios. Las boletas por premio se calculan al sortear. | ✅ Confirmado (D-002 refinado + D-007) |
| R06b | El monto **sí acumula** si la factura pasa validación de POS y fecha, aunque el total aún no alcance ningún umbral (`eligible=false`, pero `accumulated_amount` sube). Si la factura falla POS o fecha, el monto **no acumula** en ningún caso (rechazo duro, 422, auditado — D-005). | ✅ Confirmado (D-005) |
| R07 | **[v0.3]** Dentro del pool de cada premio, el sorteo es aleatorio simple: 1 boleta = 1 chance. Boletas de un participante para el premio *p* = `min(floor(total / umbral_p), tope_p)`. | ✅ Confirmado (D-003 + D-007) |
| R08 | Un participante puede ganar más de un premio: si califica a varios premios, entra a varios pools; dentro de cada pool sus boletas permanecen tras cada ganador (con reposición, D-006). La restricción "un ganador, un premio" es responsabilidad de los T&C del cliente. | ✅ Confirmado (D-003 / D-006) |
| R09 | Reglas "por producto/marca" no están en alcance del MVP — dependen de que el CUFE extraiga ítems de producto (DT-004). | Definido — fuera de alcance |
| R10 | Mecánicas Formulario y Asistencia devuelven 501 en `/participations`; solo Factura es funcional en MVP. Las demás mecánicas se abordan en fases futuras. | ✅ Confirmado (D-004, 2026-07-30) |
| R11 | El cierre externo no corre ningún algoritmo; el admin es responsable de la validez de los ganadores que ingresa | Definido |
| R12 | `/draw` es idempotente: si ya tiene ganadores registrados, devuelve el resultado anterior sin re-sortear | Definido |
| R13 | **[v0.3]** El contador de boletas del participante es **derivado** de `accumulated_amount` (no se persiste por separado). Con un premio es un número; con varios, un desglose por premio (§6.3). | ✅ Confirmado (D-007) |

---

## 9. Auditoría

Eventos específicos de Sorteo (además de los comunes de SPEC-04B §8):

| Evento | Cuándo |
|---|---|
| `sorteo.tickets_generated` | `evaluate_participation()` registra ≥1 boleta |
| `sorteo.participation_ineligible` | `evaluate_participation()` devuelve `eligible=false` |
| `sorteo.accumulation_updated` | Se actualiza el saldo en `campaign_participant_accumulations` |
| `sorteo.draw_executed` | `/draw` corre el algoritmo de selección por sistema |
| `sorteo.winners_registered_external` | `/draw` registra ganadores de cierre externo |
| `sorteo.draw_seed_stored` | Se guarda la semilla del sorteo en `campaign.rules["draw_result"]` |

Todos los eventos van a `audit_log` con `entity_type="campaign"`, `entity_id=campaign_id`, `actor_id` (admin o sistema según corresponda) y `details` con el payload relevante.

---

## 10. Archivos a crear/modificar

```
backend/app/
├── models/
│   └── campaign_participant_accumulation.py   [NUEVO]
│       · CampaignParticipantAccumulation(tenant_id, campaign_id, participant_id,
│         accumulated_amount, updated_at)
│
├── models/__init__.py                          [MODIFICAR]
│   · Agregar import + __all__ para CampaignParticipantAccumulation
│
├── schemas/
│   └── participation.py                        [NUEVO — definido por SPEC-04B]
│       · ParticipationCreate, ParticipationResponse (con tickets_earned, accumulated_remaining)
│       · WinnerResponse
│       · DrawRequest (para cierre externo)
│       · DrawResponse
│
├── services/
│   ├── participation_service.py               [NUEVO — orquestador, definido por SPEC-04B]
│   └── rules/
│       ├── __init__.py                        [NUEVO — dispatcher por activity_type]
│       ├── base.py                            [NUEVO — ParticipationResult, WinnerAssignment]
│       └── sorteo.py                          [NUEVO — este spec]
│           · evaluate_participation()
│           · select_winners()
│           · _get_or_create_accumulation()    [helper interno]
│
├── api/v1/
│   └── participations.py                      [NUEVO — definido por SPEC-04B; dos routers según actor]
│       · public_router (prefix /campaigns):
│           - POST /campaigns/{id}/participations          (participante/bot)
│       · router (prefix /tenants, autenticado):
│           - GET  /tenants/{tenant_id}/campaigns/{id}/participations
│           - POST /tenants/{tenant_id}/campaigns/{id}/draw
│           - GET  /tenants/{tenant_id}/campaigns/{id}/winners
│
└── main.py                                    [MODIFICAR]
    · include_router(participations_router)         (admin, prefix /tenants)
    · include_router(participations_public_router)  (participante/bot, prefix /campaigns)

alembic/versions/
└── XXXX_create_campaign_participant_accumulations.py  [NUEVA MIGRACIÓN]
```

### 10.1 Archivos adicionales del rediseño v0.3 (D-007)

```
backend/app/
├── schemas/campaign.py                         [MODIFICAR]
│   · CampaignCreate.rules:  list | None  →  dict | None
│   · CampaignUpdate.rules:  list | None  →  dict | None
│   · CampaignDetailResponse.rules: list | None → dict | None
│   · PrizeCreate: mantener `order` (ya existe) — el wizard debe enviarlo explícito
│
├── services/rules/base.py                      [MODIFICAR]
│   · WinnerAssignment: participation_id → participant_id
│
├── services/rules/sorteo.py                    [MODIFICAR]
│   · evaluate_participation(): acumulado TOTAL + boletas por premio (§7.1 v0.3)
│   · select_winners(db, campaign, seed): pools por premio desde acumulaciones (§7.2 v0.3)
│
└── services/participation_service.py           [MODIFICAR]
    · Adaptar la llamada a select_winners a la nueva firma (db, campaign, seed)
    · Resolver ganadores por participant_id (nombre/cédula desde Participant)

frontend/src/pages/campaigns/CampaignsPage.jsx  [MODIFICAR]
   · Step 2 (Premios): input de jerarquía/`order` por premio (mayor→menor); enviar `order` explícito.
   · Step "POS y mecánica" → separar en:
       - Mecánica: <select> con única opción "Acumulación de factura" (value "acumulacion").
       - Tipo de cierre (`closure_type`): <select> con dos opciones —
         "Sistema (automático)" (value "system", por defecto) y
         "Externo / notarial (manual)" (value "external"). Ver §1.5.
       - Reglas de participación: por cada premio del Step 2, un par de campos
         (umbral = monto mínimo, tope = cantidad de participaciones). 1 premio = sin selector.
   · handleSubmit(): construir y enviar `rules` (§3.2.6) con mechanic, date_start/date_end
     (de starts_at/ends_at), pos_ids y eligibility.prizes[{prize_order, min_amount, max_participations}].
   · Enviar participation_method = "acumulacion" y closure_type (default "system").
   · Detalle/edición: mostrar y permitir editar mecánica + tipo de cierre + reglas por premio.
```

> **Orden de implementación sugerido:** (1) schema fix, (2) `base.py` + `sorteo.py` + orquestador, (3) tests del motor, (4) wizard frontend. El motor es la fuente de verdad; el wizard solo debe producir un `rules` válido.

---

## 11. Migración de BD

Una migración nueva:

```bash
# Desde el contenedor backend:
docker exec -it validia-backend alembic revision --autogenerate \
  -m "create_campaign_participant_accumulations"
# Revisar el archivo generado, luego:
docker exec -it validia-backend alembic upgrade head
```

La migración debe crear la tabla `campaign_participant_accumulations` tal como se define en §5.1. Verificar que `autogenerate` la detecte correctamente (requiere que el modelo esté importado en `models/__init__.py` antes de correr).

---

## 12. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | Participación en actividad `draft` | 400 |
| T02 | CUFE inválido (DIAN rechaza) | 422, sin `Participation` |
| T03 | Factura con fecha fuera del periodo | 422 con `reason = "invoice_date_out_of_range"` |
| T04 | Factura de POS que no está en la lista | 422 con `reason = "pos_not_eligible"` |
| T05 | 1 premio (umbral $100K, tope 5), 1ra factura $80K | `eligible=false`, `accumulated_total=80000`, boletas premio=0 |
| T06 | 1 premio (umbral $100K, tope 5), factura acumula a $250K | `eligible=true`, `accumulated_total=250000`, boletas premio=2 |
| T05b | Premio con tope=1 (gate), acumulado $500K, umbral $100K | boletas premio = 1 (topado, no 5) |
| T07 | 1 premio (umbral $100K), 1ra factura $60K | `eligible=false`, `accumulated_total=60000` |
| T08 | 1 premio (umbral $100K), 2da factura $70K (total $130K) | `eligible=true`, `accumulated_total=130000`, boletas premio=1 |
| T08b | 2 premios: P1(umbral $500K, tope 3), P2(umbral $200K, tope 5); acumulado $300K | elegible solo a P2; boletas P1=0, P2=1 |
| T08c | Rechazo duro por POS/fecha | 422 + audit_log `participation_rejected`; `accumulated_total` NO cambia (D-005) |
| T09 | CUFE duplicado en la misma actividad | 409 |
| T10 | TyC no aceptados | 400 con `reason = "terms_not_accepted"` |
| T11 | `/draw` con actividad en estado `active` (no cerrada) | 400 |
| T12 | `/draw` por sistema con 0 participaciones elegibles | 400 con `reason = "no_eligible_participations"` |
| T13 | `/draw` por sistema con 10 boletas distribuidas en 4 participantes, 2 premios | 200; 2 ganadores distintos; semilla guardada en `rules["draw_result"]` |
| T14 | `/draw` corrido dos veces (idempotencia) | 2do call devuelve mismo resultado, sin re-sortear |
| T15 | `/draw` externo con `participation_id` inexistente | 422 |
| T16 | `/draw` externo con winners válidos | 200; `is_winner=true` en cada `Participation` indicada |
| T17 | Listar participaciones filtrando `eligible=false` | Solo las no elegibles, cada una con su `reason` |
| T18 | Listar ganadores después del draw | Lista correcta con nombre, cédula, boletas y premio |
