# Deuda Técnica — Validia

Registro de decisiones técnicas aplazadas intencionalmente. Cada ítem incluye qué es, por qué se aplazó y cuándo abordarlo.

---

## DT-001 · Automated testing (pytest) + CI/CD with GitHub Actions

**Qué es:**
- Crear `backend/tests/` con archivos pytest por spec (T01–Tn de cada SPEC-04x).
- Configurar `.github/workflows/test.yml` — corre pytest en cada PR (CI).
- Configurar `.github/workflows/deploy.yml` — deploy automático a EC2 al mergear a main (CD):
  1. SSH al EC2
  2. `git pull`
  3. `docker compose build && docker compose up -d`
  4. `alembic upgrade head`
- Guardar credenciales del EC2 (IP, usuario, clave `.pem`) como GitHub Secrets — nunca en el código.

**Por qué se aplazó:**
Implementar tests retroactivos para los specs históricos (01–04B) consume tiempo que el deadline de Demo Day no permite. Se prioriza cerrar la funcionalidad primero.

**Cuándo abordarlo:**
Un sprint dedicado después de cerrar los specs de los 4 tipos de actividad (04C Sorteo, 04D Incentivo Fuerza de Venta, 04E Compras Consumidor, 04F Rotación). Un solo ciclo de Claude Code entrega tests + CI + CD para todo el proyecto.

**Notas:**
- GitHub Actions free tier: 2,000 min/mes para repos privados. Estimado Validia: ~140 min/mes (CI ~2 min/PR + CD ~5 min/merge). Sin costo adicional.
- Los casos de prueba (T01–Tn) ya están documentados en cada spec — solo hay que traducirlos a funciones pytest.

---

## DT-002 · Wizard frontend — reglas de participación en el wizard ✅ ABSORBIDO

**Qué era:**
El wizard no guardaba las reglas de Sorteo dentro de `Campaign.rules`, por lo que el motor nunca recibía la configuración de elegibilidad.

**Estado:** Absorbido por el rediseño de reglas de Sorteo (D-007, 2026-08-05). El wizard ahora escribe `Campaign.rules` con la mecánica y los umbrales/topes por premio como parte de SPEC-04C v0.3 — deja de ser deuda técnica y pasa a ser trabajo planificado.

---

## DT-004 · Servicio CUFE — no discrimina ítems de producto

**Qué es:**
`cufe_service.extract_invoice_fields` solo devuelve `amount`, `invoice_date` y `pos_nit`. No extrae el detalle de líneas de la factura (productos, marcas, cantidades, valor por ítem). Mientras siga así, no es posible construir reglas de elegibilidad "por producto" o "por marca" (p. ej. "una boleta por cada 3 unidades de la marca X").

**Impacto:**
El modelo de reglas de Sorteo v0.3 (D-007) funciona por **monto acumulado** y no necesita el detalle de producto todavía. La extensión "boletas por producto/marca" queda bloqueada por este ítem.

**Acción requerida (cuando se priorice):**
1. Revisar si el scraper de la DIAN ya trae los ítems en el `raw_data` de la factura (aunque no se persistan estructurados).
2. Si están: mapear las líneas a una tabla `invoice_items` (o JSONB estructurado) con producto/marca/cantidad/valor.
3. Si no están: evaluar una fuente alterna (parseo del PDF/XML de la factura) antes de comprometer la funcionalidad.
4. Extender el modelo de `rules.eligibility` con un tipo adicional basado en producto/marca.

**Cuándo abordarlo:**
Fase posterior al MVP, cuando un cliente requiera reglas por producto/marca. No bloquea el sorteo por monto.

---

## DT-005 · Consulta de estado del participante (contador de boletas) — flujo H9

**Qué es:**
SPEC-04C §6.3 define el dato y la forma de respuesta para que un participante consulte cuántas boletas lleva en un sorteo (`GET /campaigns/{id}/participants/status?cedula=...`). El contador se deriva de `accumulated_amount`, así que el dato ya existe. Falta:
1. Implementar el endpoint read-only (`public_router`) que calcula el desglose por premio.
2. Cablear el disparo desde el bot de WhatsApp (el participante pregunta "¿cuántas boletas tengo?") — parte del flujo del participante (H9).

**Por qué se aplazó:**
El flujo del participante (H9: bot de WhatsApp, portal del participante) es un frente propio, fuera del alcance de los specs de tipo de actividad. El motor de sorteo (04C) solo necesita persistir `accumulated_amount`; la consulta se monta encima cuando se aborde H9.

**Cuándo abordarlo:**
Al abrir el spec del flujo del participante (H9). El endpoint read-only es de bajo esfuerzo y puede adelantarse si se quiere probar el contador antes del bot.

---

## DT-003 · Token de GitHub embebido en la URL del remote (seguridad)

**Qué es:**
El remote `origin` tiene el Personal Access Token embebido en la URL (`https://usuario:ghp_...@github.com/...`), por lo que el token aparece en texto plano en la salida de comandos de git. Un token quedó expuesto de esa forma el 2026-07-31.

**Acción requerida:**
1. Revocar el token expuesto en GitHub → Settings → Developer settings → Personal access tokens.
2. Generar un token nuevo.
3. Limpiar el remote: `git remote set-url origin https://github.com/vktoriaTech/ValidiaApp.git` (sin `usuario:token@`) y dejar que el credential helper del sistema guarde el token aparte.

**Por qué se aplazó:**
Decisión de Bryan (2026-07-31) — se atiende cuando se revise todo el registro de deuda técnica.

**Prioridad:**
Alta (seguridad). Es una credencial de escritura al repo; conviene rotarla antes que los ítems de tooling. Mientras el token siga embebido, seguirá apareciendo en cada salida de git.

---
