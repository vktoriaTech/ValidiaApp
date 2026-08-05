# Decisiones de negocio pendientes
**Propósito:** preguntas que surgen durante el desarrollo y que no puede resolver el equipo técnico solo — requieren definición de los socios. Se revisan en reunión y se registra la decisión con fecha. Una vez decididas, la respuesta se traslada al spec correspondiente y aquí se marca como resuelta.

---

## Abiertas

_(ninguna)_

---

## Resueltas

### D-007 · Modelo de reglas del Sorteo — ¿mecánica y reglas separadas? ¿umbral único o por premio?
**Origen:** revisión del wizard de Sorteo (el motor nunca recibía `rules`) · **Fecha:** 2026-08-05 · **Resuelta:** 2026-08-05

**Contexto:** el wizard nunca escribía `Campaign.rules`, por lo que `evaluate_participation` leía `min_amount = 0` y no generaba boletas: el Sorteo estaba desconectado end-to-end desde la UI. Al revisar el motor real se confirmó, además, que el modelo de "remanente" (`accumulated_amount` guardaba el saldo no convertido en boleta) **solo funciona con un `min_amount` único** — no soporta umbrales distintos por premio.

**Decisión:**

1. **Mecánica y reglas son campos separados.** La *mecánica* describe cómo entra la evidencia; para el MVP la única opción es `"acumulacion"` (acumulación de factura). Se guarda en `Campaign.participation_method`. Las *reglas* describen la elegibilidad y viven en `Campaign.rules` (JSONB).

2. **Umbral por premio.** La elegibilidad se define **por premio**, no global. Cada premio (definido en el Step 2 del wizard) recibe dos valores que llena el cliente:
   - `min_amount` (umbral): monto mínimo acumulado en facturas válidas para ser elegible a ese premio.
   - `max_participations` (tope): número máximo de boletas que un mismo participante puede tener en el sorteo de ese premio.

   Boletas de un participante para el premio *p*: `boletas_p = min( floor(acumulado_total / min_amount_p), max_participations_p )` si `acumulado_total >= min_amount_p`, de lo contrario `0`.

   Con `max_participations = 1` el premio se comporta como *gate* (una sola oportunidad); con un tope alto se comporta como *proporcional* (más compra = más boletas, hasta el tope). Un solo campo cubre ambos extremos.

3. **Caso de un solo premio:** la UI muestra un único par de campos (umbral + tope) sin selector de premio. Con más de un premio, cada uno tiene su par de campos asociado. Estructuralmente es el mismo arreglo `eligibility.prizes` con una o varias entradas.

4. **Acumulado total, no remanente.** `CampaignParticipantAccumulation.accumulated_amount` pasa a guardar el **monto total válido acumulado** por participante (suma de todas las facturas que pasaron POS + fecha), no el saldo remanente. Las boletas de cada premio se calculan en el momento del sorteo a partir de ese total. Sin este cambio, umbrales distintos por premio son irrepresentables.

5. **Jerarquía de premios.** Los premios se ordenan explícitamente (campo `Prize.order`, ya existente) de mayor a menor. El `order` define jerarquía/etiqueta; el umbral define elegibilidad — son independientes (no se fuerza "mayor jerarquía = mayor umbral"). El anidamiento sale gratis: si el umbral del premio mayor ≥ el del secundario, quien califica al mayor entra automáticamente al pool del secundario.

**Impacto en specs:**
- SPEC-04C sube a v0.3. Se redefine `rules` (§5.2), `evaluate_participation` (§7.1) y `select_winners` (§7.2) al modelo por premio.
- **D-002** (acumulado perpetuo) sigue vigente; solo se refina la semántica: `accumulated_amount` es el total, no el remanente. Sin reinicios.
- **D-003 / D-006** (sorteo con reposición, multipremio) siguen vigentes, ahora aplicados **por pool de premio**: quien califica a varios premios entra a varios pools; dentro de cada pool, 1 boleta = 1 chance con reposición.
- Se elimina `ticket_mode` ("single" | "accumulated") del modelo: la mecánica del MVP es siempre acumulación.
- Bug de schema a corregir: `CampaignCreate.rules` / `CampaignUpdate.rules` están tipados como `list | None` y deben ser `dict | None` (el modelo ORM ya usa `dict`).
- "Boletas por producto/marca" queda fuera de este alcance: depende de que el CUFE extraiga ítems de producto (ver DT-004).

---

### D-001 · ¿Un mismo CUFE puede participar en más de una actividad?
**Origen:** SPEC-04B §5 · **Fecha:** 2026-07-29 · **Resuelta:** 2026-07-30

**Decisión:** Un mismo CUFE **no puede** participar dos veces en la **misma** actividad, pero **sí puede** participar en múltiples actividades distintas que corran simultáneamente. El constraint de unicidad es por `(campaign_id, cufe)`, no global.

**Impacto en specs:** SPEC-04B §5 confirmado (el vínculo factura↔actividad vive en `Participation`, no en `Invoice`). R03 de SPEC-04C §8 confirmado (409 por CUFE duplicado dentro de la misma actividad).

---

### D-002 · Factura acumulada — ¿el acumulado corre sobre toda la actividad o por ventanas de tiempo?
**Origen:** SPEC-04C §8 · **Fecha:** 2026-07-30 · **Resuelta:** 2026-07-30

**Decisión:** Opción A — acumulado perpetuo. El remanente de monto no convertido en boleta se mantiene durante toda la vigencia de la actividad, sin reinicios por ventana de tiempo.

**Impacto en specs:** R06 de SPEC-04C §8 confirmado. `evaluate_participation()` en §7.1 actualiza `CampaignParticipantAccumulation.accumulated_amount` con el saldo remanente en cada participación.

---

### D-003 · Algoritmo del sorteo — ¿aleatorio simple o ponderado? ¿Un mismo participante puede ganar más de un premio?
**Origen:** SPEC-04C §4 · **Fecha:** 2026-07-30 · **Resuelta:** 2026-07-30

**Decisión:**
- **Algoritmo:** aleatorio simple — 1 boleta = 1 chance. Sin ponderación adicional.
- **Multi-premio:** el sistema **no excluye** a un participante tras ganar un premio. Sus boletas permanecen en el pool para todos los premios del sorteo — puede ganar más de uno. La restricción de "un ganador, un premio" es responsabilidad de los T&C que cada cliente defina para su actividad, no de la herramienta.

**Impacto en specs:** R07 y R08 de SPEC-04C §8 actualizados. `select_winners()` en §7.2 no filtra por participante entre premios.

---

### D-004 · Mecánicas de Formulario y Asistencia a evento — ¿en alcance del MVP o solo declaradas?
**Origen:** SPEC-04C §1, SPEC-04B §1 · **Fecha:** 2026-07-30 · **Resuelta:** 2026-07-30

**Decisión:** MVP sale solo con Factura (CUFE). Formulario, Asistencia a evento y Otro quedan fuera del MVP — se abordan en fases futuras.

**Impacto en specs:** R10 de SPEC-04C §8 queda confirmada como decisión definitiva (no asunción). No se requieren SPEC-04G ni SPEC-04H en el sprint actual.

---

### D-005 · Rechazo por POS/fecha inválidos — ¿se guarda la participación o solo se rechaza?
**Origen:** SPEC-04C §6 (tabla de errores T03/T04) vs SPEC-04B R04 · **Fecha:** 2026-07-31 · **Resuelta:** 2026-07-31

**Contexto:** el spec distingue dos niveles de rechazo que entraban en tensión con R04 ("toda participación no elegible se guarda igual"). Se aclara que no todo rechazo es una "participación no elegible":
- **Rechazo duro** (la factura no pertenece a la actividad): POS no elegible o fecha fuera de rango. La evidencia no aplica a esta actividad.
- **No elegible blando** (pertenece pero aún no alcanza): monto bajo el mínimo. Se guarda con `eligible=false` y acumula (R04/R06b).

**Decisión:** Los rechazos duros (POS/fecha) devuelven **422 y NO crean `Participation`** — mantienen el pool limpio. Pero **sí deben registrar un evento en `audit_log`** (`campaign.participation_rejected` con el `reason`) **antes** de lanzar la excepción, para trazabilidad y antifraude. El monto no acumula (R06b). El rechazo por monto bajo el mínimo sigue guardando `Participation` con `eligible=false`.

**Impacto en specs:** SPEC-04C §6 (tabla de errores) y §8 R04 se mantienen; se agrega la obligación de auditar el rechazo duro. Implementación: `evaluate_participation()` debe emitir el `audit_log` de rechazo antes del `raise HTTPException(422)`, o el orquestador debe capturar y auditar antes de propagar.

---

### D-006 · Modelo del sorteo multipremio — ¿con o sin reposición de boletas?
**Origen:** SPEC-04C §7.2 (implementación de `select_winners`) · **Fecha:** 2026-07-31 · **Resuelta:** 2026-07-31

**Contexto:** al implementar `select_winners` surgieron dos modelos posibles para el multipremio confirmado en D-003:
- **Con reposición (spec §4/§7.2):** cada premio es un `random.choice` independiente sobre el pool completo; las boletas del ganador **permanecen** en el pool. Una sola boleta puede ganar varios premios.
- **Sin reposición:** shuffle único y consumo secuencial; cada boleta gana máximo un premio; el multipremio solo ocurre si el participante tiene varias boletas.

**Decisión:** Se adopta el modelo **con reposición**, tal como está escrito en el spec §4 y §7.2. Coincide con D-003 ("puede ganar en todos los premios"): un participante con una sola boleta puede resultar ganador de más de un premio. La semilla se guarda igual para reproducibilidad; con reposición, reproducir el sorteo requiere fijar la semilla y el orden de premios.

**Impacto en specs:** SPEC-04C §7.2 confirmado (no modificar). Implementación: `select_winners()` debe hacer `random.choice` (o equivalente sembrado) sobre el pool completo por cada unidad de premio, sin remover las entradas del ganador entre premios.
