# Decisiones de negocio pendientes
**Propósito:** preguntas que surgen durante el desarrollo y que no puede resolver el equipo técnico solo — requieren definición de los socios. Se revisan en reunión y se registra la decisión con fecha. Una vez decididas, la respuesta se traslada al spec correspondiente y aquí se marca como resuelta.

---

## Abiertas

_(ninguna)_

---

## Resueltas

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
