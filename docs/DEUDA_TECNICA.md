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

## DT-002 · Wizard frontend — ticket_mode y prizes en Step de mecánica

**Qué es:**
El wizard del frontend no guarda todavía `ticket_mode` ("single" | "accumulated") ni el arreglo `prizes` dentro de `Campaign.rules` (JSONB). El backend los espera al evaluar una participación de Sorteo.

**Por qué se aplazó:**
El backend de 04B+04C se implementa primero para validar la lógica end-to-end. El ajuste del wizard es frontend puro y no bloquea el motor.

**Cuándo abordarlo:**
Inmediatamente después de que 04B+04C pasen QA — antes de la primera demo con cliente real.

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
