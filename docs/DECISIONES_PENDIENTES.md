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
