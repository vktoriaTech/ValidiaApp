# SPEC-01: Módulo de Autenticación
**Proyecto:** Validia MVP  
**Versión:** 1.0  
**Estado:** Aprobado  
**Última actualización:** 2026-07

---

## 1. Descripción general

El módulo de autenticación es la puerta de entrada al backoffice de Validia. Gestiona el acceso seguro de todos los usuarios de la plataforma (super_admin, tenant_admin, tenant_viewer, vendor, mercaderista) mediante JWT con refresh token. Incluye recuperación de contraseña por email y soporte opcional de doble factor de autenticación (MFA/TOTP).

---

## 2. Roles del sistema

| Rol | Descripción | Alcance |
|---|---|---|
| `super_admin` | Admin de Validia | Toda la plataforma |
| `tenant_admin` | Admin del centro comercial / marca | Su tenant |
| `tenant_viewer` | Solo lectura | Su tenant |
| `vendor` | Fuerza de venta externa | Sus campañas asignadas |
| `mercaderista` | Ejecutor en PDV | Sus campañas asignadas |

---

## 3. Endpoints

### 3.1 Login
```
POST /api/v1/auth/login
```

**Request:**
```json
{
  "email": "admin@ccjardinplaza.com",
  "password": "MiPassword123!"
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "admin@ccjardinplaza.com",
    "full_name": "Bryan Cañón",
    "role": "tenant_admin",
    "tenant_id": "uuid",
    "tenant_name": "CC Jardín Plaza",
    "mfa_enabled": false
  }
}
```

**Errores:**
| Código | Condición |
|---|---|
| 401 | Credenciales incorrectas |
| 401 | Usuario inactivo (`is_active = false`) |
| 403 | Tenant suspendido o inactivo |
| 422 | Campos faltantes o formato inválido |

---

### 3.2 Refresh Token
```
POST /api/v1/auth/refresh
```

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600
}
```

**Errores:**
| Código | Condición |
|---|---|
| 401 | Refresh token inválido o expirado |

---

### 3.3 Logout
```
POST /api/v1/auth/logout
Authorization: Bearer {access_token}
```

**Response 200:**
```json
{
  "message": "Sesión cerrada exitosamente"
}
```

---

### 3.4 Solicitar recuperación de contraseña
```
POST /api/v1/auth/forgot-password
```

**Request:**
```json
{
  "email": "admin@ccjardinplaza.com"
}
```

**Response 200:**
```json
{
  "message": "Si el correo existe, recibirás instrucciones en los próximos minutos"
}
```

> **Nota de seguridad:** Siempre retorna 200 aunque el email no exista. Evita enumeración de usuarios.

---

### 3.5 Resetear contraseña
```
POST /api/v1/auth/reset-password
```

**Request:**
```json
{
  "token": "token_de_reset_recibido_por_email",
  "new_password": "NuevaPassword123!",
  "confirm_password": "NuevaPassword123!"
}
```

**Response 200:**
```json
{
  "message": "Contraseña actualizada exitosamente"
}
```

**Errores:**
| Código | Condición |
|---|---|
| 400 | Token inválido o expirado (24h) |
| 400 | Passwords no coinciden |
| 422 | Password no cumple política |

---

### 3.6 Perfil del usuario autenticado
```
GET /api/v1/auth/me
Authorization: Bearer {access_token}
```

**Response 200:**
```json
{
  "id": "uuid",
  "email": "admin@ccjardinplaza.com",
  "full_name": "Bryan Cañón",
  "role": "tenant_admin",
  "tenant_id": "uuid",
  "tenant_name": "CC Jardín Plaza",
  "tenant_status": "active",
  "mfa_enabled": false,
  "last_login": "2026-07-03T10:00:00Z"
}
```

---

### 3.7 Cambiar contraseña (usuario autenticado)
```
POST /api/v1/auth/change-password
Authorization: Bearer {access_token}
```

**Request:**
```json
{
  "current_password": "MiPassword123!",
  "new_password": "NuevaPassword456!",
  "confirm_password": "NuevaPassword456!"
}
```

---

### 3.8 Activar / Configurar MFA (opcional)
```
POST /api/v1/auth/mfa/setup
Authorization: Bearer {access_token}
```

**Response 200:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_url": "otpauth://totp/Validia:admin@cc.com?secret=...",
  "backup_codes": ["12345678", "87654321"]
}
```

```
POST /api/v1/auth/mfa/verify
```
```json
{
  "code": "123456"
}
```

---

## 4. Reglas de negocio

### 4.1 Política de contraseñas
- Mínimo 8 caracteres
- Al menos 1 mayúscula
- Al menos 1 número
- Al menos 1 carácter especial

### 4.2 JWT
- **Access token:** expira en 60 minutos
- **Refresh token:** expira en 7 días
- Algoritmo: HS256
- Payload mínimo: `{ sub: user_id, tenant_id, role, exp }`

### 4.3 Reset de contraseña
- Token único, expira en 24 horas
- Un solo uso — se invalida al usarse
- Se almacena como hash en BD, no en texto plano

### 4.4 Registro de auditoría
Cada login exitoso debe generar un registro en `audit_logs`:
```json
{
  "entity": "user",
  "action": "login",
  "payload": { "ip": "x.x.x.x", "user_agent": "..." }
}
```

### 4.5 Bloqueo de acceso
- Si `user.is_active = false` → 401
- Si `tenant.status != active` → 403 con mensaje claro
- Si `subscription.status = expired` → 403 con mensaje de suscripción vencida

---

## 5. Archivos a crear

```
backend/
└── app/
    ├── api/v1/
    │   └── auth.py                  # Router con todos los endpoints
    ├── core/
    │   ├── security.py              # JWT encode/decode, hash passwords
    │   └── dependencies.py          # get_current_user, require_role
    ├── schemas/
    │   └── auth.py                  # Pydantic schemas request/response
    └── services/
        └── auth_service.py          # Lógica de negocio auth
```

---

## 6. Dependencias técnicas

```
python-jose[cryptography]==3.3.0    # JWT
passlib[bcrypt]==1.7.4              # Hash passwords
python-multipart==0.0.9             # Form data
pyotp==2.9.0                        # TOTP para MFA
qrcode==7.4.2                       # QR para MFA setup
```

---

## 7. Variables de entorno requeridas

```bash
JWT_SECRET_KEY=...
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=noreply@validia.co
```

---

## 8. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | Login con credenciales correctas | 200 + tokens |
| T02 | Login con password incorrecto | 401 |
| T03 | Login con usuario inactivo | 401 |
| T04 | Login con tenant suspendido | 403 |
| T05 | Refresh con token válido | 200 + nuevo access token |
| T06 | Refresh con token expirado | 401 |
| T07 | Solicitar reset con email existente | 200 |
| T08 | Solicitar reset con email inexistente | 200 (no revela info) |
| T09 | Reset con token válido | 200 |
| T10 | Reset con token expirado | 400 |
| T11 | GET /me con token válido | 200 + datos usuario |
| T12 | GET /me sin token | 401 |
| T13 | Password sin mayúscula | 422 |
| T14 | MFA setup y verificación | 200 |

---

## 9. Notas de implementación

- Los refresh tokens **no se almacenan en BD** en el MVP — se validan por firma JWT. En V2 implementar blacklist con Redis.
- El email de reset se envía de forma **asíncrona** usando `BackgroundTasks` de FastAPI para no bloquear la respuesta.
- El token de reset sí se almacena en BD como hash con `created_at` para validar expiración de 24h. Agregar campo `password_reset_token` y `password_reset_expires` a la tabla `users`.
- `super_admin` no pertenece a ningún tenant — su `tenant_id` puede ser `null`.
