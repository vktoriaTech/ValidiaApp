# SPEC-04A: Módulo de Campañas / Actividades — Estructura Base
**Proyecto:** Validia MVP  
**Versión:** 1.0  
**Estado:** Aprobado  
**Última actualización:** 2026-07

---

## 1. Descripción general

Las campañas (también llamadas actividades) son el core del producto. Este SPEC cubre la creación, gestión y ciclo de vida de los 4 tipos de actividad. El motor de reglas y el cierre se cubren en SPEC-04B.

### Tipos de actividad
| Tipo | Descripción |
|---|---|
| `sorteo` | Participantes inscriben facturas; al cierre se sortean ganadores |
| `incentivo_fuerza_venta` | Vendedores compiten por metas de venta |
| `compras_consumidor` | Consumidores ganan por meta o sorteo |
| `rotacion` | Consumidor recibe artículo inmediato verificado por mercaderista |

---

## 2. Reglas de acceso por rol

| Acción | super_admin | tenant_admin | tenant_viewer | vendor | mercaderista |
|---|---|---|---|---|---|
| Crear campaña | ✅ | ✅ | ❌ | ❌ | ❌ |
| Listar campañas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver campaña | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar campaña (solo draft) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Activar campaña | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pausar / cerrar campaña | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gestionar vendedores/mercaderistas | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gestionar inventario | ✅ | ✅ | ❌ | ❌ | ❌ |
| Registrar gastos/resultados | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 3. Estados de una campaña

```
draft → active → paused → closed → archived
         ↑          |
         └──────────┘ (reactivar desde paused)
```

| Estado | Descripción |
|---|---|
| `draft` | En construcción — editable, no recibe participaciones |
| `active` | Recibiendo participaciones |
| `paused` | Temporalmente detenida — no recibe participaciones |
| `closed` | Periodo de participación cerrado — en proceso de cierre |
| `archived` | Cerrada definitivamente con ganadores y exportación |

**Reglas de transición:**
- Solo se puede editar en estado `draft`
- Para pasar a `active` debe tener: nombre, tipo, fechas, al menos 1 POS asociado y al menos 1 premio
- Para pasar a `archived` debe tener: ganador(es) registrado(s)

---

## 4. Endpoints — CRUD de campañas

### 4.1 Crear campaña (Paso 1 del wizard)
```
POST /api/v1/tenants/{tenant_id}/campaigns
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "name": "Sorteo Día de la Madre 2026",
  "description": "Gana increíbles premios comprando en nuestras tiendas",
  "activity_type": "sorteo",
  "objective_type": "venta",
  "objective_value": 50000000,
  "budget": 5000000,
  "category": "Todas",
  "brand": null,
  "starts_at": "2026-05-01T00:00:00Z",
  "ends_at": "2026-05-31T23:59:59Z",
  "start_time": "08:00:00",
  "end_time": "21:00:00",
  "raffle_at": "2026-06-05T15:00:00Z",
  "participation_method": "factura",
  "closure_type": "system_random",
  "terms_text": "Términos y condiciones de la campaña...",
  "pos_ids": ["uuid1", "uuid2"],
  "prizes": [
    {
      "name": "Carro 0km",
      "description": "Toyota Corolla 2026",
      "prize_type": "articulo",
      "quantity": 1,
      "order": 1
    },
    {
      "name": "Viaje a Cartagena",
      "description": "Para 2 personas, 3 noches",
      "prize_type": "articulo",
      "quantity": 2,
      "order": 2
    }
  ]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Sorteo Día de la Madre 2026",
  "activity_type": "sorteo",
  "status": "draft",
  "qr_code": null,
  "qr_slug": null,
  "created_at": "2026-07-03T10:00:00Z"
}
```

---

### 4.2 Listar campañas del tenant
```
GET /api/v1/tenants/{tenant_id}/campaigns?page=1&limit=20&status=active&activity_type=sorteo&search=madre
Authorization: Bearer {token}
```

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Sorteo Día de la Madre 2026",
      "activity_type": "sorteo",
      "status": "active",
      "starts_at": "2026-05-01T00:00:00Z",
      "ends_at": "2026-05-31T23:59:59Z",
      "total_participations": 1284,
      "total_invoices_accepted": 947
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

---

### 4.3 Obtener campaña por ID (detalle completo)
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}
Authorization: Bearer {token}
```

**Response 200:** retorna todos los campos incluyendo:
- Datos generales
- POS asociados
- Premios
- Reglas configuradas
- Vendedores (si aplica)
- Mercaderistas (si aplica)
- Contadores: participaciones, facturas aceptadas/rechazadas

---

### 4.4 Actualizar campaña (solo en estado draft)
```
PUT /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:** mismos campos del POST (todos opcionales)

**Errores:**
| Código | Condición |
|---|---|
| 400 | Campaña no está en estado draft |
| 403 | Sin permisos o tenant incorrecto |

---

### 4.5 Cambiar estado de campaña
```
PATCH /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/status
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "status": "active",
  "reason": null
}
```

**Validaciones por transición:**
- `draft → active`: requiere nombre, tipo, fechas válidas, al menos 1 POS, al menos 1 premio
- `active → paused`: sin restricciones
- `paused → active`: sin restricciones
- `active/paused → closed`: sin restricciones
- `closed → archived`: requiere al menos 1 ganador registrado

---

### 4.6 Generar / Regenerar QR de campaña
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/qr
Authorization: Bearer {token} [super_admin | tenant_admin]
```

> Se genera automáticamente al activar la campaña. Este endpoint permite regenerarlo manualmente.

**Response 200:**
```json
{
  "qr_code": "data:image/png;base64,...",
  "qr_slug": "sorteo-dia-madre-2026",
  "qr_url": "https://app.validia.co/c/sorteo-dia-madre-2026"
}
```

---

## 5. Endpoints — POS de la campaña

### 5.1 Actualizar POS asociados
```
PUT /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/pos
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "pos_ids": ["uuid1", "uuid2", "uuid3"],
  "all_pos": false
}
```

> Si `all_pos = true`, se asocian todos los POS activos del tenant automáticamente.

---

## 6. Endpoints — Premios

### 6.1 Listar premios de campaña
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/prizes
Authorization: Bearer {token}
```

### 6.2 Crear premio
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/prizes
Authorization: Bearer {token} [super_admin | tenant_admin]
```

### 6.3 Actualizar premio
```
PUT /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/prizes/{prize_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

### 6.4 Eliminar premio (solo en draft)
```
DELETE /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/prizes/{prize_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

---

## 7. Endpoints — Vendedores (incentivo_fuerza_venta)

### 7.1 Cargar vendedores masivamente
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/vendors/bulk
Authorization: Bearer {token} [super_admin | tenant_admin]
Content-Type: multipart/form-data
```

**Form data:** archivo CSV con columnas:
`full_name, cedula, address, city, email, phone, client_key, client_name`

**Response 200:**
```json
{
  "created": 45,
  "updated": 3,
  "errors": []
}
```

### 7.2 Listar vendedores
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/vendors
Authorization: Bearer {token}
```

### 7.3 Agregar vendedor individual
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/vendors
Authorization: Bearer {token} [super_admin | tenant_admin]
```

### 7.4 Actualizar vendedor
```
PUT /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/vendors/{vendor_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

---

## 8. Endpoints — Mercaderistas (rotacion)

### 8.1 Agregar mercaderista
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/mercaderistas
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "full_name": "Ana García",
  "cedula": "1234567890",
  "email": "ana@empresa.com",
  "phone": "+573001234567"
}
```

### 8.2 Listar mercaderistas
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/mercaderistas
Authorization: Bearer {token}
```

---

## 9. Endpoints — Inventario (rotacion)

### 9.1 Cargar inventario
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/inventory
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "article_name": "Termo Stanley 1L",
  "description": "Color negro, edición limitada",
  "total_units": 200
}
```

### 9.2 Listar inventario
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/inventory
Authorization: Bearer {token}
```

**Response 200:**
```json
[
  {
    "id": "uuid",
    "article_name": "Termo Stanley 1L",
    "total_units": 200,
    "available_units": 187,
    "delivered_units": 13
  }
]
```

---

## 10. Endpoints — Gastos y Resultados (ejecución)

### 10.1 Registrar gasto
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/expenses
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "supplier_name": "Agencia XYZ",
  "amount": 1500000,
  "description": "Diseño material POP",
  "invoice_number": "FE-001234"
}
```

### 10.2 Listar gastos
```
GET /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/expenses
Authorization: Bearer {token}
```

### 10.3 Registrar resultado
```
POST /api/v1/tenants/{tenant_id}/campaigns/{campaign_id}/results
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "result_value": 48500000,
  "description": "Ventas totales del periodo de la campaña"
}
```

---

## 11. Reglas de negocio

### 11.1 Generación de QR
- Se genera automáticamente al activar la campaña (`draft → active`)
- El `qr_slug` se deriva del nombre de la campaña (slugify)
- El QR apunta a `{FRONTEND_URL}/c/{qr_slug}` — esta URL abre el chat de WhatsApp
- Si el slug ya existe, se agrega un sufijo numérico: `sorteo-dia-madre-2026-2`

### 11.2 Reglas por tipo de actividad
Las reglas se almacenan en el campo `rules` (JSONB) con esta estructura:

**Sorteo:**
```json
[
  {"type": "min_amount", "value": 50000},
  {"type": "date_range", "starts": "2026-05-01", "ends": "2026-05-31"},
  {"type": "pos_filter", "mode": "selected"},
  {"type": "tickets", "mode": "per_invoice", "quantity": 1}
]
```

**Incentivo fuerza de venta:**
```json
[
  {"type": "vendor_only"},
  {"type": "goal_ranges", "ranges": [
    {"min": 0, "max": 5000000, "prize_order": 1},
    {"min": 5000001, "max": 10000000, "prize_order": 2}
  ]},
  {"type": "result_method", "method": "invoice"}
]
```

**Compras consumidor:**
```json
[
  {"type": "min_amount", "value": 30000},
  {"type": "winner_method", "method": "goal"},
  {"type": "goal_ranges", "ranges": [
    {"min": 30000, "max": 99999, "prize_order": 1},
    {"min": 100000, "max": null, "prize_order": 2}
  ]}
]
```

**Rotación:**
```json
[
  {"type": "min_amount", "value": 20000},
  {"type": "immediate_prize"},
  {"type": "requires_mercaderista"},
  {"type": "requires_photo", "value": true}
]
```

### 11.3 Auditoría
Registrar en `audit_logs`:
- `campaign.created`
- `campaign.status_changed`
- `campaign.updated`
- `campaign.qr_generated`
- `campaign.vendor_added`
- `campaign.mercaderista_added`

---

## 12. Archivos a crear

```
backend/
└── app/
    ├── api/v1/
    │   └── campaigns.py         # Router principal de campañas
    ├── schemas/
    │   └── campaign.py          # Todos los schemas de campaña
    └── services/
        └── campaign_service.py  # Lógica de negocio campañas
```

---

## 13. Migración de BD requerida

Los modelos ya existen. Correr después de implementar:
```bash
cd backend
alembic revision --autogenerate -m "campaigns full schema"
alembic upgrade head
```

---

## 14. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | Crear campaña tipo sorteo | 201 en estado draft |
| T02 | Activar campaña sin POS | 400 |
| T03 | Activar campaña sin premios | 400 |
| T04 | Activar campaña completa | 200 + QR generado |
| T05 | Editar campaña activa | 400 |
| T06 | Listar campañas con filtro status=active | 200 filtrado |
| T07 | Cargar vendedores CSV | 200 + conteo |
| T08 | Agregar mercaderista | 201 |
| T09 | Cargar inventario | 201 |
| T10 | Registrar gasto | 201 |
| T11 | Cambiar estado draft→active→paused→active→closed | Flujo completo |
| T12 | GET campaña incluye contadores de participaciones | 200 |
