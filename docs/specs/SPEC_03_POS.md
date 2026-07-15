# SPEC-03: Módulo de Puntos de Venta (POS)
**Proyecto:** Validia MVP  
**Versión:** 1.0  
**Estado:** Aprobado  
**Última actualización:** 2026-07

---

## 1. Descripción general

Los Puntos de Venta (POS) representan las tiendas o sucursales asociadas a un tenant. Son la unidad base para filtrar qué facturas son válidas en una campaña — solo las facturas emitidas por tiendas participantes en la campaña son aceptadas por el motor de reglas.

Un POS puede ser **propio** (del centro comercial) o **de un cliente** (una marca o retailer dentro del centro comercial).

---

## 2. Reglas de acceso por rol

| Acción | super_admin | tenant_admin | tenant_viewer | vendor | mercaderista |
|---|---|---|---|---|---|
| Crear POS | ✅ | ✅ | ❌ | ❌ | ❌ |
| Listar POS | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver POS por ID | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar POS | ✅ | ✅ | ❌ | ❌ | ❌ |
| Activar/desactivar POS | ✅ | ✅ | ❌ | ❌ | ❌ |

> Aislamiento multi-tenant: un `tenant_admin` solo puede ver y gestionar los POS de su propio tenant.

---

## 3. Endpoints

### 3.1 Crear POS
```
POST /api/v1/tenants/{tenant_id}/pos
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "name": "Nike Store Piso 2",
  "pos_type": "cliente",
  "category": "Moda",
  "nit_emisor": "900123456-1",
  "city": "Cali",
  "address": "Carrera 100 # 11-60, Piso 2, Local 201",
  "lat": 3.4516,
  "lng": -76.5320
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Nike Store Piso 2",
  "pos_type": "cliente",
  "category": "Moda",
  "nit_emisor": "900123456-1",
  "city": "Cali",
  "address": "Carrera 100 # 11-60, Piso 2, Local 201",
  "lat": 3.4516,
  "lng": -76.5320,
  "is_active": true,
  "created_at": "2026-07-03T10:00:00Z"
}
```

**Errores:**
| Código | Condición |
|---|---|
| 403 | Sin permisos o tenant incorrecto |
| 422 | Campos inválidos |

---

### 3.2 Listar POS del tenant
```
GET /api/v1/tenants/{tenant_id}/pos?page=1&limit=20&is_active=true&search=nike&pos_type=cliente
Authorization: Bearer {token}
```

**Response 200:**
```json
{
  "items": [...],
  "total": 12,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

---

### 3.3 Obtener POS por ID
```
GET /api/v1/tenants/{tenant_id}/pos/{pos_id}
Authorization: Bearer {token}
```

---

### 3.4 Actualizar POS
```
PUT /api/v1/tenants/{tenant_id}/pos/{pos_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:** mismos campos del POST (todos opcionales)

---

### 3.5 Activar / Desactivar POS
```
PATCH /api/v1/tenants/{tenant_id}/pos/{pos_id}/status
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "is_active": false
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "name": "Nike Store Piso 2",
  "is_active": false,
  "updated_at": "2026-07-03T10:00:00Z"
}
```

---

### 3.6 Listar POS activos para selector (uso en creación de campañas)
```
GET /api/v1/tenants/{tenant_id}/pos/active
Authorization: Bearer {token}
```

> Retorna lista simplificada sin paginación para usar en dropdowns del wizard de campañas.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Nike Store Piso 2",
    "nit_emisor": "900123456-1",
    "category": "Moda"
  }
]
```

> **⚠️ Nota de implementación crítica:** Declarar `GET /pos/active` ANTES que `GET /pos/{pos_id}` en el router para evitar que FastAPI interprete `active` como un UUID.

---

## 4. Reglas de negocio

### 4.1 Aislamiento multi-tenant
- Todo POS pertenece a un tenant — toda query lleva `WHERE tenant_id = {tenant_id}`
- Un `tenant_admin` no puede ver ni modificar POS de otro tenant
- El `super_admin` puede operar en cualquier tenant

### 4.2 Tipos de POS
- `propio` — pertenece al centro comercial o marca directamente
- `cliente` — es una tienda o local dentro del centro comercial

### 4.3 NIT emisor
- El campo `nit_emisor` es el identificador que usa el motor de reglas para validar si una factura fue emitida por una tienda participante en la campaña
- Es opcional al crear — se puede agregar después
- Se recomienda siempre llenarlo para que la validación CUFE funcione correctamente

### 4.4 Georreferenciación
- `lat` y `lng` son opcionales
- Si se proveen, deben ser coordenadas válidas (lat entre -90 y 90, lng entre -180 y 180)

### 4.5 POS desactivado
- Un POS desactivado NO aparece en el selector de campañas nuevas
- Si ya estaba asociado a una campaña activa, sigue siendo válido para esa campaña

### 4.6 Auditoría
Registrar en `audit_logs`:
- `pos.created`
- `pos.updated`
- `pos.status_changed`

---

## 5. Archivos a crear

```
backend/
└── app/
    ├── api/v1/
    │   └── pos.py               # Router POS
    ├── schemas/
    │   └── pos.py               # POSCreate, POSUpdate, POSResponse, POSSimple
    └── services/
        └── pos_service.py       # Lógica de negocio POS
```

---

## 6. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | tenant_admin crea POS en su tenant | 201 |
| T02 | tenant_admin crea POS en otro tenant | 403 |
| T03 | Listar POS con filtro is_active=true | 200 solo activos |
| T04 | Listar POS con search=nike | 200 filtrado por nombre |
| T05 | GET /pos/active retorna lista simplificada | 200 sin paginación |
| T06 | GET /pos/{pos_id} con ID válido | 200 |
| T07 | GET /pos/{pos_id} de otro tenant | 403 |
| T08 | Actualizar POS | 200 |
| T09 | Desactivar POS | 200 + no aparece en /pos/active |
| T10 | Crear POS sin nit_emisor | 201 (es opcional) |
| T11 | Crear POS con lat/lng inválidos | 422 |
