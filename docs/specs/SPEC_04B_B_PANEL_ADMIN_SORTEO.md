# SPEC-04B-B: Panel de administración — participantes, cierre y sorteo

**Proyecto:** Validia MVP
**Versión:** 0.1
**Estado:** En implementación
**Última actualización:** 2026-09-01
**Depende de:** SPEC-04B (Motor de Participación §6.2–6.4), SPEC-04C (Sorteo), SPEC-04B-A (Captura)

---

## 0. Alcance

Vista de administración para operar el ciclo de una actividad desde la UI: ver
quién ha participado, cerrar la actividad y ejecutar el sorteo para obtener el/
los ganador(es). **El backend ya existe y está probado** (SPEC-04B §6.2–6.4 + 12
tests). Este spec cubre solo el frontend que consume esos endpoints.

## 1. Endpoints consumidos (ya existentes, no se modifican)

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/tenants/{tid}/campaigns/{cid}/participations` | Lista de participaciones (cédula, nombre, CUFE, boletas, elegible, ganador). |
| `PATCH` | `/tenants/{tid}/campaigns/{cid}/status` | Cerrar actividad (`active`/`paused` → `closed`). |
| `POST` | `/tenants/{tid}/campaigns/{cid}/draw` | Ejecuta el sorteo (cierre `system`) o registra ganadores (cierre `external`). Idempotente (R12). |
| `GET` | `/tenants/{tid}/campaigns/{cid}/winners` | Lista de ganadores tras el sorteo. |

Transiciones válidas (backend `_VALID_TRANSITIONS`): `active→paused/closed`,
`paused→active/closed`, `closed→archived`. El sorteo (`draw`) exige estado
`closed`.

## 2. UI — dentro del modal "Detalle de actividad"

Se agrega, según el estado de la actividad:

1. **Sección "Participantes"** (visible en `active`, `paused`, `closed`):
   tabla con cédula, nombre, boletas, elegible y si es ganador. Contador total.
2. **Link de participación** (visible en `active`): `…/participar/{campaignId}`
   con botón "copiar", para compartir con los participantes (el bot de WhatsApp
   usará el mismo endpoint más adelante).
3. **Botón "Cerrar actividad"** (en `active`/`paused`): confirma y hace
   `PATCH status=closed`. Requiere confirmación (acción no trivial).
4. **Botón "Ejecutar sorteo"** (en `closed`, sin ganadores aún): llama `draw`,
   muestra el/los ganador(es). Como `draw` es idempotente, si ya se ejecutó se
   muestran los ganadores guardados.
5. **Sección "Ganadores"** (cuando existen): nombre, cédula, premio, boletas.

## 3. Frontend — archivos

- `services/participacionAdminService.js` (nuevo): `getParticipations`,
  `runDraw`, `getWinners` (usan el `api` autenticado). El cierre reutiliza
  `updateCampaignStatus` de `campaignService`.
- `pages/campaigns/CampaignsPage.jsx`: estado y JSX de las secciones anteriores
  dentro del modal de detalle; carga de participantes/ganadores al abrir el
  detalle de una actividad no borrador.

## 3.1 Vista dedicada de participantes (absorbe Fase 5)

Con miles/millones de participantes, la lista no cabe en el modal. Se agrega:

- Botón **"Participantes"** en el footer del detalle → navega a la ruta
  `/campaigns/:campaignId/participants` (dentro del Shell autenticado), pasando
  `tenantId` y `campaignName` por estado de navegación.
- **Vista `ParticipantsPage`** en modo tabla con toda la info del participante +
  su factura: cédula, nombre, celular, CUFE, monto factura, fecha factura, NIT
  POS, boletas, acumulado, elegible, ganador, fecha de participación.
- **Paginación** server-side: 50 por página (`page`/`limit`, tope 200).
- **Búsqueda** server-side por cédula, nombre, celular, CUFE o NIT POS.
- **Export a Excel** (`GET …/participations/export`, openpyxl) con las mismas
  columnas, respetando el filtro de búsqueda activo. Botón arriba de la tabla.

El endpoint `GET …/participations` pasa a devolver `PaginatedParticipations`
(`items`, `total`, `page`, `pages`); el modal de detalle solo muestra el
contador total y delega el listado a la vista dedicada.

## 4. Fuera de alcance

- Cierre externo (notarial) con carga manual de ganadores: el backend lo soporta
  (`DrawRequest.winners`), pero la UI de este spec cubre solo el cierre
  `system` (sorteo automático). El externo se documenta cuando se construya.
- Filtros avanzados por columna (solo elegibles, solo ganadores): se evalúan
  después; hoy se muestra todo con búsqueda por texto.

## 5. Casos de prueba (manuales para el demo; automatizar en DT-001)

- Actividad activa con participaciones → la sección Participantes las lista.
- Cerrar actividad activa → pasa a `closed`, aparece "Ejecutar sorteo".
- Ejecutar sorteo con ≥1 participante elegible → muestra ganador.
- Reejecutar sorteo → devuelve el mismo ganador (idempotente).
- Ejecutar sorteo sin elegibles → error `no_eligible_participations` (400).
