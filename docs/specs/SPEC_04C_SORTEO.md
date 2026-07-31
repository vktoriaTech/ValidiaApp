# SPEC-04C: Actividad tipo Sorteo
**Proyecto:** Validia MVP
**Versión:** 0.2
**Estado:** Borrador
**Última actualización:** 2026-07-30
**Depende de:** SPEC-04A (Campañas/Actividades), SPEC-04B (Motor de Participación)
**Precede a:** implementación de `backend/app/services/rules/sorteo.py`

> **Estado de decisiones:** todas las preguntas de negocio de este spec están resueltas (D-001, D-002, D-003, D-004 — ver `docs/DECISIONES_PENDIENTES.md`). Este spec no tiene asunciones temporales abiertas. Listo para implementación.

---

## 1. Conceptos y vocabulario

### 1.1 ¿Qué es un Sorteo en Validia?

Un Sorteo es una actividad promocional en la que los consumidores acumulan **boletas** a cambio de compras verificadas (facturas electrónicas), y al cierre de la actividad el sistema selecciona aleatoriamente qué boletas son ganadoras de cada premio.

El consumidor no sabe de antemano si ganó — ese es el diferenciador frente a Rotación (donde el premio es inmediato) y frente a Incentivo (donde se premia el volumen de ventas de un vendedor). En Sorteo, participar es necesario pero no suficiente: ganar depende del azar.

### 1.2 Boleta

La unidad de participación en un Sorteo. Cada boleta representa un derecho a ser seleccionada en el sorteo. Un participante puede acumular múltiples boletas durante la vigencia de la actividad. Las boletas se generan por monto de compra: una boleta por cada `min_amount` pesos acumulados en facturas válidas.

Ejemplo: `min_amount = $100.000`. Ana compra $250.000 en una sola factura → recibe 2 boletas (le sobran $50.000 que siguen acumulando hacia la siguiente).

### 1.3 Factura acumulada vs. factura única

- **Factura única:** cada factura individual debe superar el `min_amount` por sí sola para generar boleta(s). Una factura de $60.000 con `min_amount = $100.000` no genera boleta y el monto no se lleva al siguiente registro.
- **Factura acumulada:** las facturas se suman hasta alcanzar el `min_amount`. El remanente se acumula para la siguiente(s) factura(s).

El wizard permite configurar cuál de los dos modos aplica (`ticket_mode`). Este spec soporta ambos.

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

---

## 4. Flujo end-to-end (Sorteo)

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
  5. Verifica que Invoice.date esté dentro del periodo de la actividad
     → Si falla: rechaza con reason="invoice_date_out_of_range". El monto NO acumula.
  6. Verifica que Invoice.pos_id esté en la lista de POS de la actividad (si está configurado)
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

> Si `ticket_mode = "single"` esta tabla no se usa — pero existe sin problema.

### 5.2 Columnas nuevas en `Campaign.rules` (JSONB — no requiere migración de columna)

El JSONB `rules` ya existe. El Sorteo espera encontrar estas claves dentro de él al evaluar una participación:

```json
{
  "ticket_mode":   "single" | "accumulated",
  "min_amount":    100000,
  "date_start":    "2026-08-01",
  "date_end":      "2026-10-31",
  "pos_ids":       ["uuid1", "uuid2"],          // vacío = todos los POS del tenant
  "prizes": [
    { "name": "Carro",        "quantity": 1 },
    { "name": "Remodelación", "quantity": 1 },
    { "name": "MasterClass",  "quantity": 3 }
  ]
}
```

> El wizard ya guarda `min_amount`, fechas y POS. Falta agregar `ticket_mode` y `prizes` al paso del wizard (cambio de frontend, fuera del alcance de este spec — se documenta como deuda técnica del wizard).

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

---

## 7. Contratos e interfaces (implementación de SPEC-04B §7)

### 7.1 `evaluate_participation` — implementación Sorteo

```python
# backend/app/services/rules/sorteo.py

def evaluate_participation(
    campaign: Campaign,
    invoice: Invoice,
    participant: Participant,
    pos: POS | None,
    extra: dict,   # no usado en Sorteo
) -> ParticipationResult:
    """
    1. Verifica que invoice.issue_date esté en [rules.date_start, rules.date_end].
    2. Verifica que invoice.pos_id esté en rules.pos_ids (si la lista no está vacía).
    3. Según ticket_mode:
       - "single":      monto_efectivo = invoice.total_amount
       - "accumulated": monto_efectivo = accumulated_amount_anterior + invoice.total_amount
    4. tickets = floor(monto_efectivo / rules.min_amount)
    5. nuevo_saldo = monto_efectivo % rules.min_amount
    6. Actualiza CampaignParticipantAccumulation.accumulated_amount = nuevo_saldo (perpetuo, toda la vigencia)
    7. eligible = tickets > 0
    8. Devuelve ParticipationResult con:
       - eligible, tickets, points=0, immediate_winner=False
       - rules_applied = {ticket_mode, min_amount, invoice_total, accumulated_before,
                          accumulated_after, tickets_earned, rejection_reason}
    """
```

### 7.2 `select_winners` — implementación Sorteo

```python
def select_winners(
    campaign: Campaign,
    eligible_participations: list[Participation],
) -> list[WinnerAssignment]:
    """
    [ASUNCIÓN D-003] Algoritmo: aleatorio simple, sin repetición de participante.

    1. Construir pool: por cada Participation, añadir su participation_id
       tantas veces como tickets tenga.
    2. Cargar lista de premios desde campaign.rules["prizes"] en orden
       (de mayor a menor valor, si se especifica; si no, en el orden del JSON).
    3. Generar semilla reproducible: seed = secrets.token_hex(16); guardarla en
       campaign.rules["draw_result"]["seed"].
    4. random.seed(seed); random.shuffle(pool)
    5. Para cada premio y cada unidad del premio:
       a. Seleccionar pool[0] → ganador
       b. Las entradas del ganador permanecen en el pool (puede ganar premios posteriores)
       c. Registrar WinnerAssignment(participation_id, prize_name)
    6. Devolver lista de WinnerAssignment.
    Nota: si el cliente quiere restricción "un ganador, un premio", debe declararlo en sus T&C.
    La herramienta no lo hace cumplir automáticamente.
    """
```

---

## 8. Reglas de negocio

Las condiciones que este spec decide (las abiertas están marcadas):

| # | Regla | Estado |
|---|---|---|
| R01 | La factura debe tener fecha dentro del periodo `[date_start, date_end]` de la actividad | Definido |
| R02 | Si `rules.pos_ids` no está vacío, la factura debe pertenecer a uno de esos POS | Definido |
| R03 | El mismo CUFE no puede registrarse dos veces en la misma actividad (409) | Definido |
| R04 | Una participación no elegible se guarda igual, con `eligible=false` y `reason` — no se descarta | Definido (heredado de 04B) |
| R05 | `ticket_mode = "single"`: cada factura se evalúa individualmente; sin acumulado entre facturas | Definido |
| R06 | `ticket_mode = "accumulated"`: el saldo se lleva de una factura a la siguiente durante toda la vigencia de la actividad. No hay ventanas ni reinicios. | ✅ Confirmado (D-002, 2026-07-30) |
| R06b | El saldo **sí acumula** si la factura pasa validación de POS y fecha, aunque no alcance el mínimo (`eligible=false`, pero `accumulated_amount` sube). Si la factura falla POS o fecha, el monto **no acumula** en ningún caso. | ✅ Confirmado (2026-07-30) |
| R07 | El sorteo por sistema usa aleatorio simple: 1 boleta = 1 chance, sin ponderación adicional | ✅ Confirmado (D-003, 2026-07-30) |
| R08 | Un participante puede ganar más de un premio en el mismo sorteo. Sus boletas permanecen en el pool tras cada ganador. La restricción "un ganador, un premio" es responsabilidad de los T&C de cada cliente. | ✅ Confirmado (D-003, 2026-07-30) |
| R09 | `ticket_mode = "by_points"` (boletas por puntos/marcas de producto) no está en alcance del MVP | Definido — fuera de alcance |
| R10 | Mecánicas Formulario y Asistencia devuelven 501 en `/participations`; solo Factura es funcional en MVP. Las demás mecánicas se abordan en fases futuras. | ✅ Confirmado (D-004, 2026-07-30) |
| R11 | El cierre externo no corre ningún algoritmo; el admin es responsable de la validez de los ganadores que ingresa | Definido |
| R12 | `/draw` es idempotente: si ya tiene ganadores registrados, devuelve el resultado anterior sin re-sortear | Definido |

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
| T05 | `ticket_mode=single`, factura $80K, `min_amount=$100K` | `eligible=false`, `tickets_earned=0` |
| T06 | `ticket_mode=single`, factura $250K, `min_amount=$100K` | `eligible=true`, `tickets_earned=2` |
| T07 | `ticket_mode=accumulated`, 1ra factura $60K (`min=$100K`) | `eligible=false`, `accumulated=60000` |
| T08 | `ticket_mode=accumulated`, 2da factura $70K (saldo $60K) | `eligible=true`, `tickets_earned=1`, `accumulated=30000` |
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
