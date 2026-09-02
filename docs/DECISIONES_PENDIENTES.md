# Decisiones de negocio pendientes
**Propósito:** preguntas que surgen durante el desarrollo y que no puede resolver el equipo técnico solo — requieren definición de los socios. Se revisan en reunión y se registra la decisión con fecha. Una vez decididas, la respuesta se traslada al spec correspondiente y aquí se marca como resuelta.

---

## Abiertas

_(ninguna decisión de negocio bloqueada hoy)_

## En radar — direcciones futuras conocidas (aún sin especificar)

Cosas que ya sabemos que van a generar spec o ajuste, según el plan de trabajo y
la reunión de socios del jueves. Se listan para no perderlas; se convierten en
decisión/spec cuando se aborden.

- **Participación por producto (no solo por establecimiento).** Hoy el sorteo
  hace match por **NIT del POS** (compra en el establecimiento). La reunión pidió
  también poder participar por **compra de un producto específico**: exige que el
  cliente registre el **código/SKU** del producto (el mismo que sale en su
  factura) y cruzarlo contra los ítems del CUFE. Depende de **DT-004** (el
  servicio CUFE debe devolver el detalle de líneas) y toca **SPEC-05A** (catálogo
  de marcas/productos/SKUs) y **SPEC-04C**. Para centros comerciales, las "marcas"
  son los locales y los "productos" sus SKUs.
- **Módulo de participante / bot de WhatsApp (H9).** El endpoint
  `participate-by-image` ya es el backend reutilizable; falta el bot de WhatsApp
  como front alterno (mismo backend) y la consulta de estado del participante
  (DT-005). El sitio web de participación es hoy el canal de prueba y plan B.
- **DT-007 — data de factura como activo.** Estructurar en BD toda la info de la
  factura (ya persistida en `raw_data` + PDF en S3) asociada a la cédula, para
  explotación de negocio (perfilamiento de consumo, insights para marcas/CC).
- **Retención y borrado (Ley 1581 / Habeas Data).** Al guardar facturas con datos
  personales en S3 + BD, definir política de retención y flujo de borrado
  (`Participant.data_deletion_req`).
- **Cierre externo (notarial)** en la UI: el backend ya soporta `DrawRequest.winners`; falta la interfaz para cargar ganadores manualmente.

---

## Resueltas

### D-008b · ¿Se pueden editar actividades activas/pausadas?
**Origen:** operación real (corregir T&C, fechas, sumar comercios sin borrar/recrear) · **Fecha:** 2026-09-01 · **Resuelta:** 2026-09-01

**Contexto:** el backend solo permitía editar actividades en `draft` (`_require_draft`), obligando a hacer ajustes por SQL o a borrar/recrear. En producción es inviable: hay casos legítimos de ajustar T&C, extender fechas o incluir comercios con la actividad ya activa.

**Decisión:** **abierto con aviso.** Se permite editar actividades en `draft`, `active` y `paused` (se bloquea solo `closed`/`archived`, donde el sorteo ya corrió o la actividad es final). Al editar una activa/pausada, el frontend muestra una advertencia de que los cambios pueden afectar a los participantes ya registrados, y el cambio queda auditado (`campaign.updated`). Los candados finos por campo (p. ej. impedir bajar un umbral que ya generó boletas) quedan como mejora futura.

**Impacto:** `_require_draft` → `_require_editable` (permite draft/active/paused). Frontend: botón "Editar" visible en activas/pausadas con modal de confirmación. Match de POS por `nit_emisor` (no del cliente) queda confirmado como el comportamiento correcto (ya implementado).

---

### D-008 · Captura de la factura — ¿QR, OCR o librería? ¿cuántos datos pide al usuario? ¿flujo web vs WhatsApp?
**Origen:** construcción del flujo del participante (demo Cosmocentro) · **Fecha:** 2026-08-31 · **Resuelta:** 2026-08-31

**Contexto:** el deber ser del producto es un **agente de WhatsApp** que recibe la foto de la factura y participa al usuario sin intervención humana. Para el demo se hace por un **sitio web**, pero se exigió que solo cambie el front — el backend debe ser el mismo y reutilizable. Surgieron tres preguntas.

**Decisiones:**

1. **Extracción por OCR, no por QR.** El QR impreso en la factura física no expone el CUFE de forma pública/útil; el único QR con datos estructurados (CUFE + NIT) vive *dentro del PDF que genera el portal DIAN*, que solo se obtiene **después** de validar — es circular. Por eso el CUFE y el NIT del emisor se extraen por **OCR del texto plano** de una o dos fotos de la factura. Se usa **AWS Textract** (`DetectDocumentText`, ~$0.0015/foto) por precisión sobre fotos reales; alternativas self-hosted (Tesseract/PaddleOCR) se reevaluarán solo si el volumen lo justifica. El OCR es un paso *delgado*: solo saca CUFE + NIT; el resto (monto, fecha, ítems) lo trae el scraper de la DIAN.

2. **Flujo automático, un solo endpoint reutilizable.** `POST /campaigns/{id}/participate-by-image` recibe `foto(s) + cédula` y hace internamente OCR → validar DIAN → participar → devuelve el resultado. Web (hoy) y el bot de WhatsApp (después) llaman el **mismo** endpoint; el front es una cáscara delgada. **No hay corrección manual de campos**: si el OCR no logra leer un CUFE de 96 caracteres o el NIT, se responde "reenvía una foto más nítida" (comportamiento idéntico en web y WhatsApp).

3. **Solo se pide la cédula.** El nombre y el celular no vienen confiables en la factura (compras de consumidor suelen decir "consumidor final", y el teléfono no está); en WhatsApp el celular es el canal y el nombre sale del perfil. Por eso el front mínimo pide **solo la cédula**; nombre/celular quedan opcionales. La aceptación de T&C se registra una vez con un check junto a la cédula (en WhatsApp, un "acepto" por texto) llamando a `POST /campaigns/{id}/terms/accept`.

**Cambios externos de la DIAN detectados y resueltos (2026-08-31):** el portal DIAN ahora (a) **exige el NIT del emisor** en el formulario de búsqueda (`input#SearchDocumentNit`) además del CUFE, y (b) **entrega el PDF encriptado** con el NIT del emisor como contraseña de apertura. El microservicio CUFE (repo Web-Scraping) se adaptó para ambos; el backend de Validia propaga el `nit_emisor` de punta a punta. Detalle en SPEC-04B-A.

**Impacto en specs:** nuevo SPEC-04B-A (captura de CUFE por OCR). SPEC-04B §6.1 gana el endpoint `participate-by-image` como capa de captura sobre `create_participation`. Pendientes de negocio derivados registrados como DT-006 y DT-007.

---

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
