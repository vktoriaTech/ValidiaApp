# SPEC-05A: Catálogo de Sectores, Marcas, Categorías, Productos y SKUs
**Proyecto:** Validia MVP
**Versión:** 0.1
**Estado:** Borrador
**Última actualización:** 2026-07-30
**Depende de:** SPEC-04A (Campañas/Actividades), SPEC-04B (Motor de Participación)
**Precede a:** SPEC-04C implementación (brand_id en actividad), SPEC-04D, 04E, 04F

---

## 1. Conceptos y vocabulario

### 1.1 Sector

El sector económico o industria al que pertenece un cliente (tenant). Ejemplos: Retail, Alimentos y Bebidas, Cuidado Personal, Ferretería, Farmacia. Es un catálogo global administrado por Validia (super_admin) — los clientes no crean sectores propios, solo seleccionan el que les aplica.

### 1.2 Marca (Brand)

Una línea comercial que el cliente gestiona. Un tenant puede tener múltiples marcas. Ejemplo: Nestlé Colombia (tenant) tiene las marcas Milo, Nescafé, Nestea. Las marcas pertenecen a un solo tenant y no se comparten entre tenants.

### 1.3 Categoría de marca

Una agrupación interna dentro de una marca, definida por el mismo cliente. Ejemplo: dentro de Milo pueden existir las categorías "Polvo" y "Bebida lista". Sirve para filtrar productos en los reportes y en la configuración de actividades.

### 1.4 Producto

Un producto comercial asociado a una marca. Representa el artículo a nivel de nombre genérico. Ejemplo: "Milo en polvo". Un producto puede tener múltiples SKUs (presentaciones).

### 1.5 SKU / Artículo

La unidad mínima de inventario: una presentación específica de un producto, identificada por un código y un nombre. Estructura: `código | nombre`. Ejemplos:
- `1516 | Milo 150gr`
- `1517 | Milo supergrande`
- `16518 | Milo familiar`

Los SKUs son los que aparecen en las facturas electrónicas (líneas de detalle del CUFE) y los que se configuran en las reglas de una actividad para validar qué productos cuentan para participar.

### 1.6 Jerarquía completa

```
Tenant (cliente)
├── sector_id → Sector (catálogo global)
└── Brands (marcas del tenant)
    ├── BrandCategories (categorías de la marca)
    └── Products (productos de la marca)
        └── ProductSKUs (presentaciones: código | nombre)
```

### 1.7 Relación con actividades

Una actividad (Campaign) queda asociada a **una marca** del tenant. Esto reemplaza el campo de texto libre `Campaign.brand` que existe hoy. Al seleccionar la marca en el wizard, el admin puede además filtrar qué SKUs de esa marca aplican para participar en la actividad (en el step de reglas/mecánica).

---

## 2. Descripción general y objetivo

**Pregunta de negocio:** ¿cómo estructura Validia el catálogo de productos de cada cliente para que las actividades promocionales se asocien a marcas reales, y los reportes permitan filtrar por marca, categoría y SKU?

**Lo que crea este spec:**

1. Catálogo global de sectores (CRUD de super_admin).
2. CRUD de marcas por tenant (admin del tenant o super_admin).
3. CRUD de categorías por marca.
4. CRUD de productos por marca, cada uno con sus SKUs.
5. Campo `sector_id` en Tenant.
6. Campo `brand_id` en Campaign (reemplaza el texto libre `brand`).

**Lo que NO define este spec:**

- Cómo los SKUs se vinculan a las líneas de detalle de una factura DIAN (eso es parte del motor de participación, se aborda en SPEC-04C implementación).
- Importación masiva de SKUs (CSV/Excel) — fuera de alcance MVP.

---

## 3. Punto de partida (qué ya existe vs. qué falta)

| Elemento | Estado |
|---|---|
| `Tenant` (name, nit, status, etc.) | Existe. Sin `sector_id`. |
| `Campaign.brand` | Existe como `String(100)` texto libre. **Se reemplaza por `brand_id` UUID FK.** |
| `Campaign.category` | Existe como `String(100)` texto libre. Queda como campo auxiliar hasta que se decida su alcance — no se toca en este spec. |
| `POS.tenant_id` | Existe. POS ya pertenece al tenant. ✅ No requiere cambios. |
| `Sector` | **No existe.** |
| `Brand` | **No existe** como entidad. Solo texto libre en Campaign. |
| `BrandCategory` | **No existe.** |
| `Product` | **No existe** como entidad de catálogo (existe `InventoryItem` para inventario de premios, que es diferente). |
| `ProductSKU` | **No existe.** |

---

## 4. Flujo end-to-end

```
Super admin crea / mantiene el catálogo de Sectores
        ↓
Al crear o editar un Tenant, el admin selecciona su Sector
        ↓
Admin del tenant crea sus Marcas
  └── Crea Categorías dentro de cada marca
  └── Crea Productos dentro de cada marca
      └── Agrega SKUs a cada producto (código | nombre)
        ↓
Al crear una Actividad (wizard):
  Step 1 · Datos generales → se selecciona la Marca de la actividad
           (solo marcas del tenant seleccionado)
        ↓
  Step 3 · POS y mecánica → los POS disponibles ya son los del tenant (sin cambio)
        ↓
  Step 4 · TyC / Rules → al definir qué productos aplican, se seleccionan
           SKUs del catálogo de la marca elegida
        ↓
Actividad queda con brand_id → Brand → Tenant (trazabilidad completa)
```

---

## 5. Modelo de datos

### 5.1 Tabla nueva: `sectors`

```sql
CREATE TABLE sectors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Datos iniciales sugeridos (seed en migración):
`Retail`, `Alimentos y Bebidas`, `Cuidado Personal`, `Ferretería`, `Farmacia`, `Tecnología`, `Textil y Moda`, `Automotriz`, `Servicios`, `Otro`

### 5.2 Columna nueva en `tenants`

```sql
ALTER TABLE tenants
    ADD COLUMN sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL;
```

Nullable — los tenants existentes quedan sin sector hasta que el admin los actualice.

### 5.3 Tabla nueva: `brands`

```sql
CREATE TABLE brands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    logo_url    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_brands_tenant ON brands(tenant_id);
```

### 5.4 Tabla nueva: `brand_categories`

```sql
CREATE TABLE brand_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);
CREATE INDEX idx_brand_categories_brand ON brand_categories(brand_id);
```

### 5.5 Tabla nueva: `products`

```sql
CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    category_id UUID REFERENCES brand_categories(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_category ON products(category_id);
```

### 5.6 Tabla nueva: `product_skus`

```sql
CREATE TABLE product_skus (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    code        VARCHAR(50) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, code)
);
CREATE INDEX idx_product_skus_product ON product_skus(product_id);
CREATE INDEX idx_product_skus_code ON product_skus(code);
```

El índice en `code` es importante: en el motor de participación, al validar una factura DIAN se cruzan los códigos de línea de la factura con los SKUs de la actividad.

### 5.7 Cambio en `campaigns`: `brand` (texto) → `brand_id` (UUID FK)

```sql
ALTER TABLE campaigns
    ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
-- La columna brand (texto) se mantiene temporalmente para no romper datos existentes.
-- Se puede eliminar en una migración posterior una vez que todos los tenants
-- hayan migrado sus datos al nuevo catálogo.
```

`brand_id` es nullable — actividades existentes quedan sin marca hasta que se reasignen.

### 5.8 Resumen de migraciones

| Cambio | Tipo |
|---|---|
| Crear `sectors` + seed | Migración nueva |
| `tenants.sector_id` | Migración nueva (ALTER TABLE) |
| Crear `brands` | Migración nueva |
| Crear `brand_categories` | Migración nueva |
| Crear `products` | Migración nueva |
| Crear `product_skus` | Migración nueva |
| `campaigns.brand_id` (nueva columna FK) | Migración nueva (ALTER TABLE) |

Todas estas migraciones pueden ir en **un solo archivo de Alembic** (`revision --autogenerate` detectará los modelos nuevos si están importados en `__init__.py`).

---

## 6. Endpoints / API

Todos bajo el prefix `/api/v1/`. Los de sectores requieren `super_admin`. Los de marcas/categorías/productos/SKUs requieren estar autenticado como admin del tenant o super_admin.

### 6.1 Sectores (super_admin)

```
GET    /sectors                        → lista paginada
POST   /sectors                        → crear sector
PUT    /sectors/{sector_id}            → actualizar nombre
DELETE /sectors/{sector_id}            → eliminar (solo si no hay tenants asignados)
```

### 6.2 Tenant: asignar sector

```
PATCH  /tenants/{tenant_id}            → ya existe; agregar sector_id al body permitido
```

(El endpoint PATCH de tenant ya existe — solo se agrega `sector_id` al schema de actualización.)

### 6.3 Marcas (por tenant)

```
GET    /tenants/{tenant_id}/brands                    → lista (con categorías y conteo de productos)
POST   /tenants/{tenant_id}/brands                    → crear marca
PUT    /tenants/{tenant_id}/brands/{brand_id}         → actualizar
DELETE /tenants/{tenant_id}/brands/{brand_id}         → desactivar (soft delete via is_active)
```

**POST body:**
```json
{ "name": "Milo", "logo_url": null }
```

**GET response (item):**
```json
{
  "id": "uuid",
  "name": "Milo",
  "logo_url": null,
  "is_active": true,
  "categories": [{ "id": "uuid", "name": "Polvo" }],
  "product_count": 3
}
```

### 6.4 Categorías (por marca)

```
GET    /tenants/{tenant_id}/brands/{brand_id}/categories
POST   /tenants/{tenant_id}/brands/{brand_id}/categories
PUT    /tenants/{tenant_id}/brands/{brand_id}/categories/{category_id}
DELETE /tenants/{tenant_id}/brands/{brand_id}/categories/{category_id}
```

DELETE solo si no hay productos asignados a esa categoría (devuelve 409 si hay).

### 6.5 Productos (por marca)

```
GET    /tenants/{tenant_id}/brands/{brand_id}/products
POST   /tenants/{tenant_id}/brands/{brand_id}/products
PUT    /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}
DELETE /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}
```

**POST body:**
```json
{ "name": "Milo en polvo", "category_id": "uuid-or-null" }
```

### 6.6 SKUs (por producto)

```
GET    /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}/skus
POST   /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}/skus
PUT    /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}/skus/{sku_id}
DELETE /tenants/{tenant_id}/brands/{brand_id}/products/{product_id}/skus/{sku_id}
```

**POST body:**
```json
{ "code": "1516", "name": "Milo 150gr" }
```

**GET response (item):**
```json
{ "id": "uuid", "code": "1516", "name": "Milo 150gr", "is_active": true }
```

### 6.7 Campañas: brand_id en wizard

El endpoint existente `POST /tenants/{tenant_id}/campaigns` y `PUT .../campaigns/{id}` reciben `brand_id` como campo opcional en el body. El campo `brand` (texto) se depreca pero se mantiene para compatibilidad.

**Selector en el wizard (step 1 — Datos generales):**
```
GET /tenants/{tenant_id}/brands?is_active=true   → para poblar el dropdown
```

---

## 7. Contratos e interfaces internas

```python
# Orden de dependencias para construir el árbol completo de un tenant:
# tenant → brands → (categories, products → skus)

def get_brands_with_summary(tenant_id: UUID, db: Session) -> list[BrandSummary]:
    """Devuelve marcas activas del tenant con sus categorías y conteo de productos.
    Usada en el wizard de actividades para el selector de marca."""

def get_skus_for_brand(brand_id: UUID, db: Session) -> list[ProductSKUFlat]:
    """Devuelve todos los SKUs activos de todos los productos de una marca,
    con su product_name para mostrar en el selector de la actividad.
    Estructura: [{sku_id, code, name, product_name, category_name}]"""
```

---

## 8. Reglas de negocio

| # | Regla |
|---|---|
| R01 | Un nombre de marca debe ser único dentro del mismo tenant (no a nivel global) |
| R02 | Una categoría debe ser única dentro de la misma marca |
| R03 | Un código de SKU (`code`) debe ser único dentro del mismo producto |
| R04 | Eliminar una marca desactiva (`is_active=false`) en lugar de borrar físicamente, para no romper actividades históricas que la referencian |
| R05 | Eliminar una categoría solo se permite si no tiene productos asignados (409 si los hay) |
| R06 | `Campaign.brand_id` es opcional — una actividad puede crearse sin marca seleccionada |
| R07 | El dropdown de marca en el wizard solo muestra marcas activas del tenant de la actividad |
| R08 | `sector_id` en Tenant es opcional — los tenants existentes quedan sin sector hasta que el admin lo asigne |
| R09 | Sectores: solo super_admin puede crear, editar y eliminar. Tenants y admins solo leen. |
| R10 | No se puede eliminar un sector que tenga tenants asignados (409) |

---

## 9. Auditoría

| Evento | Cuándo |
|---|---|
| `brand.created` | Nueva marca creada |
| `brand.updated` | Nombre o logo actualizados |
| `brand.deactivated` | Marca desactivada |
| `product.created` | Nuevo producto creado |
| `product_sku.created` | Nuevo SKU agregado |
| `product_sku.updated` | Código o nombre de SKU editado |
| `tenant.sector_assigned` | Se asigna sector a un tenant |
| `campaign.brand_assigned` | Se asigna brand_id a una actividad |

---

## 10. Archivos a crear/modificar

```
backend/app/
├── models/
│   ├── sector.py                   [NUEVO] — Sector
│   ├── brand.py                    [NUEVO] — Brand
│   ├── brand_category.py           [NUEVO] — BrandCategory
│   ├── product.py                  [NUEVO] — Product
│   ├── product_sku.py              [NUEVO] — ProductSKU
│   ├── tenant.py                   [MODIFICAR] — agregar sector_id FK
│   ├── campaign.py                 [MODIFICAR] — agregar brand_id FK
│   └── __init__.py                 [MODIFICAR] — importar modelos nuevos
│
├── schemas/
│   ├── sector.py                   [NUEVO]
│   ├── brand.py                    [NUEVO] — BrandCreate, BrandResponse, BrandSummary
│   ├── brand_category.py           [NUEVO]
│   ├── product.py                  [NUEVO] — ProductCreate, ProductResponse
│   └── product_sku.py              [NUEVO] — SKUCreate, SKUResponse, SKUFlat
│
├── services/
│   ├── sector_service.py           [NUEVO]
│   ├── brand_service.py            [NUEVO]
│   └── product_service.py          [NUEVO]
│
└── api/v1/
    ├── sectors.py                  [NUEVO] — router super_admin
    ├── brands.py                   [NUEVO] — router bajo /tenants/{id}/brands
    └── products.py                 [NUEVO] — router bajo brands/{id}/products y .../skus

frontend/src/
├── pages/
│   ├── tenants/
│   │   └── TenantForm.jsx          [MODIFICAR] — agregar selector de sector
│   └── brands/
│       └── BrandsPage.jsx          [NUEVO] — CRUD de marcas, categorías, productos, SKUs
│           (accesible desde el detalle del tenant o desde el sidebar)
└── services/
    ├── sectorService.js            [NUEVO]
    └── brandService.js             [NUEVO]
```

---

## 11. Migración de BD

Un único archivo de Alembic que crea todo en orden (respetando dependencias de FK):

```bash
docker exec -it validia-backend alembic revision --autogenerate \
  -m "catalog_sectors_brands_products_skus"
# Verificar que incluye: sectors, tenants.sector_id, brands, brand_categories,
#   products, product_skus, campaigns.brand_id
docker exec -it validia-backend alembic upgrade head
```

**Orden de creación dentro de la migración:**
1. `sectors` (sin dependencias externas)
2. `tenants.sector_id` (ALTER TABLE — depende de `sectors`)
3. `brands` (depende de `tenants`)
4. `brand_categories` (depende de `brands`)
5. `products` (depende de `brands` y `brand_categories`)
6. `product_skus` (depende de `products`)
7. `campaigns.brand_id` (ALTER TABLE — depende de `brands`)

---

## 12. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| T01 | Crear sector como super_admin | 201, sector en lista global |
| T02 | Crear sector como admin de tenant | 403 |
| T03 | Crear marca con nombre duplicado dentro del mismo tenant | 409 |
| T04 | Crear marca con el mismo nombre en tenant diferente | 201 (no es duplicado) |
| T05 | Eliminar categoría que tiene productos asignados | 409 |
| T06 | Eliminar categoría sin productos | 204 |
| T07 | Crear SKU con código duplicado dentro del mismo producto | 409 |
| T08 | Crear SKU con código igual pero en producto diferente | 201 |
| T09 | Desactivar marca → sus productos/SKUs permanecen en BD | Marca `is_active=false`, datos intactos |
| T10 | Wizard de actividad: dropdown de marca solo muestra activas del tenant | Solo marcas con `is_active=true` del tenant seleccionado |
| T11 | Crear actividad con `brand_id` válido del tenant | 201, `brand_id` guardado |
| T12 | Crear actividad con `brand_id` de otro tenant | 422 o 404 |
| T13 | Asignar sector a tenant existente | 200, `sector_id` actualizado |
| T14 | Eliminar sector con tenants asignados | 409 |
| T15 | GET `/tenants/{id}/brands` incluye categorías y conteo de productos | 200, estructura correcta |
