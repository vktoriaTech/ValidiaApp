# SPEC-02: Módulo de Tenants y Usuarios
**Proyecto:** Validia MVP  
**Versión:** 1.0  
**Estado:** Aprobado  
**Última actualización:** 2026-07

---

## 1. Descripción general

Este módulo gestiona el ciclo de vida completo de tenants (centros comerciales, marcas, retailers) y sus usuarios dentro del backoffice de Validia. Solo el `super_admin` puede crear y administrar tenants. Los `tenant_admin` gestionan los usuarios dentro de su propio tenant.

---

## 2. Reglas de acceso por rol

| Acción | super_admin | tenant_admin | tenant_viewer | vendor | mercaderista |
|---|---|---|---|---|---|
| Crear tenant | ✅ | ❌ | ❌ | ❌ | ❌ |
| Listar tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver/editar tenant propio | ✅ | ✅ | ✅ (solo lectura) | ❌ | ❌ |
| Crear usuario en tenant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Listar usuarios del tenant | ✅ | ✅ | ✅ | ❌ | ❌ |
| Activar/desactivar usuario | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cambiar rol de usuario | ✅ | ✅* | ❌ | ❌ | ❌ |

> *`tenant_admin` no puede asignar rol `super_admin` ni modificar usuarios de otro tenant.

---

## 3. Endpoints — Tenants

### 3.1 Crear tenant
```
POST /api/v1/tenants
Authorization: Bearer {token} [solo super_admin]
```

**Request:**
```json
{
  "name": "Centro Comercial Jardín Plaza",
  "slug": "cc-jardin-plaza",
  "nit": "900123456-1",
  "whatsapp_number": "+573001234567",
  "categories": [
    {"id": "uuid", "name": "Moda"},
    {"id": "uuid", "name": "Alimentos"}
  ],
  "brands": [
    {"id": "uuid", "name": "Nike"},
    {"id": "uuid", "name": "Adidas"}
  ]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "name": "Centro Comercial Jardín Plaza",
  "slug": "cc-jardin-plaza",
  "nit": "900123456-1",
  "status": "active",
  "created_at": "2026-07-03T10:00:00Z"
}
```

**Errores:**
| Código | Condición |
|---|---|
| 400 | Slug ya existe |
| 403 | No es super_admin |
| 422 | Campos inválidos |

---

### 3.2 Listar tenants
```
GET /api/v1/tenants?page=1&limit=20&status=active&search=jardin
Authorization: Bearer {token} [solo super_admin]
```

**Response 200:**
```json
{
  "items": [...],
  "total": 45,
  "page": 1,
  "limit": 20,
  "pages": 3
}
```

---

### 3.3 Obtener tenant por ID
```
GET /api/v1/tenants/{tenant_id}
Authorization: Bearer {token}
```

> `tenant_admin` solo puede ver su propio tenant. `super_admin` ve cualquiera.

---

### 3.4 Actualizar tenant
```
PUT /api/v1/tenants/{tenant_id}
Authorization: Bearer {token}
```

**Request:** mismos campos del POST (todos opcionales)

---

### 3.5 Cambiar estado del tenant
```
PATCH /api/v1/tenants/{tenant_id}/status
Authorization: Bearer {token} [solo super_admin]
```

**Request:**
```json
{
  "status": "suspended",
  "reason": "Pago vencido"
}
```

---

### 3.6 Datos del tenant propio (para backoffice del cliente)
```
GET /api/v1/tenants/me
Authorization: Bearer {token}
```

Retorna el tenant completo del usuario autenticado incluyendo:
- Datos generales
- Categorías y marcas configuradas
- Número de usuarios activos
- Estado de suscripción

> **⚠️ Nota de implementación crítica:** Este endpoint DEBE declararse **antes** que `GET /api/v1/tenants/{tenant_id}` en el router de FastAPI. Si se declara después, FastAPI intentará interpretar el literal `me` como un UUID y retornará 422. El orden correcto en el router es:
> ```python
> @router.get("/me")          # 1. Primero rutas literales
> @router.get("/{tenant_id}") # 2. Luego rutas con parámetros
> ```
> El backend extrae el `tenant_id` directamente del JWT del usuario autenticado, sin requerir que el frontend conozca o envíe el UUID del tenant.

---

## 4. Endpoints — Usuarios del tenant

### 4.1 Crear usuario
```
POST /api/v1/tenants/{tenant_id}/users
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "email": "karin@ccjardinplaza.com",
  "full_name": "Karin Ibarra",
  "role": "tenant_admin",
  "phone": "+573009876543",
  "city": "Cali"
}
```

> El sistema genera una contraseña temporal y la envía por email al usuario.  
> El usuario debe cambiarla en su primer login.

**Response 201:**
```json
{
  "id": "uuid",
  "email": "karin@ccjardinplaza.com",
  "full_name": "Karin Ibarra",
  "role": "tenant_admin",
  "is_active": true,
  "created_at": "2026-07-03T10:00:00Z"
}
```

**Errores:**
| Código | Condición |
|---|---|
| 400 | Email ya existe en el tenant |
| 403 | Sin permisos |
| 409 | Límite de usuarios del plan alcanzado |

---

### 4.2 Listar usuarios del tenant
```
GET /api/v1/tenants/{tenant_id}/users?page=1&limit=20&role=tenant_admin&is_active=true
Authorization: Bearer {token}
```

---

### 4.3 Obtener usuario por ID
```
GET /api/v1/tenants/{tenant_id}/users/{user_id}
Authorization: Bearer {token}
```

---

### 4.4 Actualizar usuario
```
PUT /api/v1/tenants/{tenant_id}/users/{user_id}
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "full_name": "Karin Ibarra Ruiz",
  "role": "tenant_viewer",
  "phone": "+573009876543",
  "city": "Cali"
}
```

---

### 4.5 Activar / Desactivar usuario
```
PATCH /api/v1/tenants/{tenant_id}/users/{user_id}/status
Authorization: Bearer {token} [super_admin | tenant_admin]
```

**Request:**
```json
{
  "is_active": false
}
```

---

### 4.6 Reenviar invitación / contraseña temporal
```
POST /api/v1/tenants/{tenant_id}/users/{user_id}/resend-invite
Authorization: Bearer {token} [super_admin | tenant_admin]
```

---

## 5. Endpoints — Configuración del tenant

### 5.1 Actualizar categorías
```
PUT /api/v1/tenants/{tenant_id}/categories
Authorization: Bearer {token} [tenant_admin]
```

**Request:**
```json
{
  "categories": [
    {"name": "Moda"},
    {"name": "Alimentos"},
    {"name": "Tecnología"}
  ]
}
```

---

### 5.2 Actualizar marcas
```
PUT /api/v1/tenants/{tenant_id}/brands
Authorization: Bearer {token} [tenant_admin]
```

---

### 5.3 Actualizar número WhatsApp
```
PUT /api/v1/tenants/{tenant_id}/whatsapp
Authorization: Bearer {token} [tenant_admin]
```

**Request:**
```json
{
  "whatsapp_number": "+573001234567",
  "whatsapp_token": "token_meta_cloud_api"
}
```

---

## 6. Reglas de negocio

### 6.1 Creación de tenants
- Solo `super_admin` puede crear tenants
- El `slug` es único en toda la plataforma, se genera automáticamente desde el `name` si no se provee
- Al crear un tenant se crea automáticamente una suscripción `free_demo` de 15 días

### 6.2 Límite de usuarios por plan
| Plan | Usuarios máximos |
|---|---|
| `free_demo` | 2 (1 admin + 1 viewer) |
| `full` | 4 base (1 admin + 3 viewers) + adicionales |

### 6.3 Contraseña temporal
- Se genera aleatoriamente (12 caracteres, cumple política)
- Se envía por email con link al portal
- Se marca `must_change_password = true` en el usuario
- En el próximo login se redirige obligatoriamente a cambiar contraseña

### 6.4 Aislamiento multi-tenant
- Un `tenant_admin` NUNCA puede ver datos de otro tenant
- Toda query lleva `WHERE tenant_id = {current_user.tenant_id}`
- El `super_admin` puede operar en cualquier tenant

### 6.5 Auditoría
Registrar en `audit_logs` los siguientes eventos:
- `tenant.created`
- `tenant.status_changed`
- `user.created`
- `user.status_changed`
- `user.role_changed`

---

## 7. Archivos a crear

```
backend/
└── app/
    ├── api/v1/
    │   ├── tenants.py           # Router tenants + usuarios del tenant
    │   └── users.py             # Router usuarios (helpers compartidos)
    ├── schemas/
    │   ├── tenant.py            # TenantCreate, TenantUpdate, TenantResponse
    │   └── user.py              # UserCreate, UserUpdate, UserResponse
    └── services/
        ├── tenant_service.py    # Lógica de negocio tenants
        └── user_service.py      # Lógica de negocio usuarios
```

---

## 8. Campo adicional requerido en modelo User

Agregar a `backend/app/models/user.py`:
```python
must_change_password = Column(Boolean, default=False)
```

---

## 9. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | super_admin crea tenant | 201 + suscripción free_demo creada |
| T02 | tenant_admin intenta crear tenant | 403 |
| T03 | Crear tenant con slug duplicado | 400 |
| T04 | super_admin lista todos los tenants | 200 paginado |
| T05 | tenant_admin ve solo su tenant | 200 solo su data |
| T06 | Crear usuario en tenant | 201 + email con contraseña temporal |
| T07 | Crear usuario duplicado en mismo tenant | 400 |
| T08 | Límite de usuarios alcanzado | 409 |
| T09 | Desactivar usuario | 200 + usuario no puede hacer login |
| T10 | tenant_admin modifica usuario de otro tenant | 403 |
| T11 | Actualizar categorías del tenant | 200 |
| T12 | GET /tenants/me retorna tenant propio | 200 |