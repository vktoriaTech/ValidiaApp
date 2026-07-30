# SPEC-04B: Motor de Participación — Base Compartida
**Proyecto:** Validia MVP
**Versión:** 0.1 (skeleton — sin detallar)
**Estado:** Borrador
**Última actualización:** 2026-07-29
**Depende de:** SPEC-04A (Campañas/Actividades), Addendum de TyC (versionado + aceptación)
**Precede a:** SPEC-04C (Sorteo), SPEC-04D (Incentivo Fuerza de Venta), SPEC-04E (Compras Consumidor), SPEC-04F (Rotación)

---

## 0. Alcance de este documento

Este spec cubre **solo lo que es 100% común** a los 4 tipos de actividad: cómo una factura validada (CUFE) se convierte en una `Participation` ligada a una actividad, y la plomería de endpoints/servicios compartida. Las reglas de negocio específicas de cada tipo (elegibilidad, cálculo de puntos/tickets, selección de ganador) se detallan en su spec individual (04C–04F), no aquí.

---

## 1. Conceptos y vocabulario

Antes de entrar en reglas concretas, dos términos que se usan en toda esta familia de specs (04B–04F) y que **no significan lo mismo**, aunque se presten a confundirse:

### 1.1 Mecánica de participación

El **proceso**: los pasos concretos que sigue una persona para entrar a la actividad. Por qué canal, qué acción dispara la participación, quién la registra. Es operativo/UX — no es una condición de validación. Hoy vive (como texto libre, sin estructura) en `Campaign.participation_method`.

Ejemplos concretos:
- **Sorteo:** el consumidor escanea el QR en el POS → se abre WhatsApp → sube foto de la factura → el bot extrae el CUFE y lo valida.
- **Rotación:** el mercaderista —no el consumidor— es quien registra la entrega y toma la foto de evidencia.
- **Incentivo Fuerza de Venta:** el vendedor reporta su propia venta desde un link/portal; el consumidor final no interactúa con Validia en absoluto.

### 1.2 Reglas

Las **condiciones** que se evalúan una vez ya ocurrió esa participación: montos mínimos, rangos de fecha, qué POS cuentan, cuántos tickets/puntos otorga, cómo se calcula el ganador. Viven estructuradas en `Campaign.rules` (JSONB).

### 1.3 La diferencia en una frase

La mecánica responde **"¿cómo entra alguien?"**. Las reglas responden **"¿esa entrada cuenta, y cuánto vale?"**. Son independientes entre sí: se puede rediseñar la mecánica (ej. pasar de "sube tu factura" a "el mercaderista escanea") sin tocar una sola regla de elegibilidad, y viceversa.

### 1.4 Por qué esto se partió en documentos distintos

- **SPEC-04B** (este documento): la plomería 100% común — cómo una factura validada (CUFE) se convierte en una `Participation` ligada a una actividad, sin importar el tipo.
- **SPEC-04C a 04F**: mecánica + reglas específicas de cada tipo — Sorteo, Incentivo Fuerza de Venta, Compras Consumidor y Rotación, respectivamente. Cada uno de esos documentos debe, como mínimo, dejar explícita su mecánica de participación y sus reglas por separado (no mezcladas en un solo párrafo), siguiendo esta misma distinción.

---

## 2. Descripción general y objetivo

Toda actividad en Validia, sin importar su tipo, responde a una misma pregunta de negocio: **¿quién está participando, a través de qué acción, bajo qué condiciones, y por qué premio?** El Motor de Participación es la pieza que le da respuesta estructurada a esa pregunta, y es el corazón que los cuatro tipos de actividad comparten.

Este spec define las tres relaciones que hoy no existen en el sistema:

1. **Participante ↔ Actividad**: una persona (identificada por cédula, y en el canal WhatsApp por su teléfono) queda inscrita en una actividad concreta. Hoy `Participant` existe como entidad suelta a nivel de tenant, pero nada dice "Ana está participando en el Sorteo Día de la Madre". Esa inscripción implica además haber aceptado los TyC vigentes de esa actividad (addendum de TyC ya implementado).
2. **Participación ↔ Evidencia**: cada participación se sustenta en un hecho verificable — en el MVP, una factura electrónica validada contra la DIAN vía CUFE (`Invoice`). Es la prueba de que la acción que la actividad premia (comprar, vender, rotar producto) realmente ocurrió. Una participación sin evidencia válida no compite.
3. **Participación ↔ Resultado**: cada participación acumula valor dentro de la actividad (tickets para un sorteo, puntos/ventas para un incentivo, derecho a premio inmediato en rotación) y al cierre puede convertirse en ganadora de un premio específico. El motor registra ese valor y su trazabilidad (`rules_applied`), pero **cómo se calcula** es decisión de cada tipo.

El rol de este documento es definir el camino único de evaluación que toda participación recorre — recibir el intento, verificar la evidencia, consultar las reglas del tipo, registrar el resultado — y los puntos exactos donde ese camino delega en la lógica específica de cada tipo (specs 04C–04F). La analogía: 04B construye la pista y los peajes; cada spec de tipo define quién puede correr en ella y cómo se gana la carrera.

---

## 3. Punto de partida (qué ya existe en el código vs. qué falta)

Revisado contra el código real antes de escribir esto:

| Elemento | Estado |
|---|---|
| `Participation` (tenant_id, campaign_id, participant_id, invoice_id, points, tickets, is_winner, winner_prize, rules_applied) | Existe desde SPEC-04A. **Ningún endpoint la escribe todavía.** |
| `Invoice` (validada vía CUFE) | Existe y funciona (`POST /api/v1/cufe/validar`), pero **no tiene relación con ninguna actividad** — queda suelta a nivel de tenant. |
| `Campaign.rules` (JSONB) | Existe, se guarda desde el wizard, pero **nada la lee**. |
| `Campaign.participation_method` | Existe como texto libre, sin estructura ni validación. |
| `Participant` | Existe desde SPEC-04A. Ya tiene `terms_accepted_at`, y desde el addendum de TyC existe `CampaignTermsAcceptance` para trazabilidad por versión/actividad. |
| `CampaignVendor`, `CampaignMercaderista` | Existen (roster cargado por el admin en el wizard), pero nada los conecta todavía con una `Participation` real. |

En resumen: el modelo de datos ya está prácticamente listo desde SPEC-04A. Lo que falta es la capa de servicio que lo pone a funcionar — ese es el alcance completo de 04B.

---

## 4. Flujo end-to-end

```
Ocurre el hecho que la actividad premia (compra, venta, entrega)
        ↓
Se obtiene evidencia verificable → factura con CUFE
        ↓
POST /campaigns/{campaign_id}/participations   (este spec, sección 6.1)
        ↓
   1. Confirma que la actividad existe y está "active"
   2. Resuelve/crea el Participante (por cédula, dentro del tenant de la actividad)
   3. Valida la evidencia (CUFE) — reutiliza o crea el Invoice
   4. Delega al motor de reglas del TIPO correspondiente (contrato en sección 7,
      implementado en 04C/04D/04E/04F) → responde: ¿elegible?, ¿por qué no si aplica?,
      ¿cuántos puntos/tickets?
   5. Crea o actualiza la Participation con ese resultado, guardando el detalle
      de la evaluación en rules_applied
        ↓
   ... la actividad sigue recibiendo participaciones hasta que se cierra ...
        ↓
Admin cambia estado de la actividad a "closed"     (endpoint ya existe, SPEC-04A)
        ↓
POST /campaigns/{campaign_id}/draw   (este spec, sección 6.3 — dispatcher genérico)
        ↓
   Delega al algoritmo de selección de ganador del tipo correspondiente
   (definido en su spec individual) y marca Participation.is_winner + winner_prize
        ↓
Admin cambia estado a "archived"   (endpoint ya existe, ya exige ≥1 ganador)
```

Nota: en Rotación el premio es inmediato (ver SPEC-04F) — para ese tipo, el paso 4 puede resultar directamente en `is_winner=True` dentro del mismo `POST .../participations`, sin pasar por `/draw`.

---

## 5. Modelo de datos

No se requieren tablas nuevas — se reutiliza lo que ya existe de SPEC-04A y del addendum de TyC. Ajustes a confirmar:

- **`Invoice` no tiene `campaign_id`, y así se queda.** El vínculo factura↔actividad vive en `Participation`, no en `Invoice`. Esto es intencional: la misma factura podría, en teoría, aplicar a más de una actividad activa en el mismo POS. **Decisión pendiente de confirmar contigo:** ¿un mismo CUFE puede generar `Participation` en más de una actividad, o debe restringirse a una sola? Este documento asume que sí puede repetirse (una fila de `Participation` por cada actividad en la que participa), salvo que me digas lo contrario.
- **`Participation` no necesita columnas nuevas** — `rules_applied` (JSONB) ya existe para guardar la trazabilidad de la evaluación.
- **Relación con TyC:** antes de crear una `Participation`, el participante debe tener una `CampaignTermsAcceptance` vigente para esa actividad (o el endpoint la crea en el mismo paso, si el flujo de aceptación aún no se ha dado — a definir con H9, que es quien construye el flujo conversacional completo).

---

## 6. Endpoints base

Todos delegan la parte específica de tipo a la interfaz definida en la sección 7.

### 6.1 Registrar participación
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/participations
```
Recibe la evidencia (CUFE) y la identificación del participante, resuelve/crea el `Participant`, corre el motor de reglas del tipo, y crea la `Participation`. Devuelve elegibilidad, puntos/tickets y motivo de rechazo si aplica (una participación no elegible **se guarda igual**, con `eligible=false` y su razón — no se descarta en silencio).

### 6.2 Listar participaciones
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/participations
```

### 6.3 Cerrar y calcular ganadores (dispatcher)
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/draw
```
Requiere `status == closed`. Este endpoint no implementa ningún algoritmo de selección — solo valida el estado y delega al módulo de cierre del `activity_type` correspondiente (sección 7). Idempotente: correrlo dos veces no debe duplicar ganadores.

### 6.4 Listar ganadores
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/winners
```

---

## 7. Interfaz del motor de reglas (contrato común)

Cada spec de tipo (04C–04F) implementa estas dos funciones con su propia lógica; 04B solo define la forma:

```python
def evaluate_participation(
    campaign: Campaign,
    invoice: Invoice,
    participant: Participant,
    pos: POS | None,
    extra: dict,          # ej. cédula de vendedor/mercaderista, foto, etc. — varía por tipo
) -> ParticipationResult:
    """eligible: bool, reason: str | None, points: int, tickets: int,
    immediate_winner: bool, rules_applied: dict"""


def select_winners(campaign: Campaign, eligible_participations: list[Participation]) -> list[WinnerAssignment]:
    """Solo se invoca desde /draw. No aplica a tipos con premio inmediato (Rotación)."""
```

Cada spec de tipo debe documentar exactamente qué hace su propia implementación de estas dos funciones — ese es su contenido central.

---

## 8. Auditoría

Eventos comunes a los 4 tipos (cada spec de tipo puede agregar los suyos):
- `campaign.participation_registered`
- `campaign.participation_rejected`
- `campaign.draw_completed`

---

## 9. Archivos a crear/modificar

```
backend/app/services/
├── participation_service.py   # orquesta: resuelve participante, valida evidencia,
│                               # invoca al motor de reglas del tipo, crea Participation
└── rules/
    ├── __init__.py             # despacha por activity_type a cada implementación
    ├── base.py                 # contrato común (sección 7) — ParticipationResult, WinnerAssignment
    ├── sorteo.py                # implementado en SPEC-04C
    ├── incentivo_fuerza_venta.py  # implementado en SPEC-04D
    ├── compras_consumidor.py    # implementado en SPEC-04E
    └── rotacion.py               # implementado en SPEC-04F

backend/app/schemas/
└── participation.py            # ParticipationCreate, ParticipationResponse, WinnerResponse

backend/app/api/v1/
└── participations.py           # nuevo router: registrar, listar, draw, ganadores
```

---

## 10. Migración de BD

Ninguna — toda la tabla `participations` y sus relaciones ya existen desde SPEC-04A.

---

## 11. Casos de prueba

Solo los genéricos (cada spec de tipo agrega los suyos):

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | Registrar participación en actividad que no está `active` | 400 |
| T02 | Registrar participación con CUFE inválido ante la DIAN | 422, no se crea `Participation` |
| T03 | Registrar participación válida | 201, `Participation` creada con `rules_applied` guardado |
| T04 | Registrar participación sin aceptación de TyC vigente | 400 (o dispara el flujo de aceptación, según se defina con H9) |
| T05 | `/draw` en actividad no cerrada | 400 |
| T06 | `/draw` corrido dos veces sobre la misma actividad | No duplica ganadores |
| T07 | Listar participaciones filtrando por `eligible=false` | 200, solo las rechazadas, cada una con su `reason` |
