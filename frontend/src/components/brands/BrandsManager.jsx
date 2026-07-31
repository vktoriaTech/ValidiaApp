import { useEffect, useState } from 'react'
import {
  createBrand,
  createBrandCategory,
  deactivateBrand,
  deleteBrandCategory,
  getBrandCategories,
  getBrands,
  updateBrand,
  updateBrandCategory,
} from '../../services/brandService'
import {
  createProduct,
  createSKU,
  deleteProduct,
  deleteSKU,
  getProducts,
  getSKUs,
  updateProduct,
  updateSKU,
} from '../../services/productService'
import Table from '../ui/Table'
import Badge from '../ui/Badge'
import Card from '../ui/Card'
import Modal from '../ui/Modal'
import ConfirmModal from '../ui/ConfirmModal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Spinner from '../ui/Spinner'

export default function BrandsManager({ tenantId }) {
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedBrand, setSelectedBrand] = useState(null)

  const [isBrandModalOpen, setBrandModalOpen] = useState(false)
  const [editingBrand, setEditingBrand] = useState(null)
  const [brandForm, setBrandForm] = useState({ name: '', logo_url: '' })
  const [brandFormError, setBrandFormError] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  async function loadBrands() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const data = await getBrands(tenantId)
      setBrands(data)
    } catch {
      setError('No fue posible cargar las marcas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBrands()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  function openCreateBrand() {
    setEditingBrand(null)
    setBrandForm({ name: '', logo_url: '' })
    setBrandFormError('')
    setBrandModalOpen(true)
  }

  function openEditBrand(brand) {
    setEditingBrand(brand)
    setBrandForm({ name: brand.name || '', logo_url: brand.logo_url || '' })
    setBrandFormError('')
    setBrandModalOpen(true)
  }

  async function handleBrandSubmit(e) {
    e.preventDefault()
    setBrandFormError('')
    setBrandSaving(true)
    const payload = { name: brandForm.name, logo_url: brandForm.logo_url || null }
    try {
      if (editingBrand) {
        await updateBrand(tenantId, editingBrand.id, payload)
      } else {
        await createBrand(tenantId, payload)
      }
      setBrandModalOpen(false)
      await loadBrands()
    } catch (err) {
      setBrandFormError(
        err.response?.data?.detail ||
          `No fue posible ${editingBrand ? 'actualizar' : 'crear'} la marca.`,
      )
    } finally {
      setBrandSaving(false)
    }
  }

  async function confirmDeactivateBrand() {
    if (!confirmDeactivate) return
    setDeactivating(true)
    try {
      await deactivateBrand(tenantId, confirmDeactivate.id)
      await loadBrands()
    } catch {
      setError('No fue posible desactivar la marca.')
    } finally {
      setDeactivating(false)
      setConfirmDeactivate(null)
    }
  }

  if (selectedBrand) {
    return (
      <BrandDetail
        tenantId={tenantId}
        brand={selectedBrand}
        onBack={() => {
          setSelectedBrand(null)
          loadBrands()
        }}
      />
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelectedBrand(row)}
          className="font-medium text-v-night hover:text-v-magenta hover:underline"
        >
          {row.name}
        </button>
      ),
    },
    {
      key: 'categories',
      header: 'Categorías',
      render: (row) =>
        row.categories?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.categories.map((c) => (
              <Badge key={c.id} color="gray">
                {c.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: 'product_count', header: 'Productos', render: (row) => row.product_count },
    {
      key: 'is_active',
      header: 'Estado',
      render: (row) => (
        <Badge color={row.is_active ? 'green' : 'gray'}>
          {row.is_active ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setSelectedBrand(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Ver catálogo
          </Button>
          <Button
            variant="secondary"
            onClick={() => openEditBrand(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Editar
          </Button>
          {row.is_active && (
            <Button
              variant="secondary"
              onClick={() => setConfirmDeactivate(row)}
              className="!px-3 !py-1.5 text-xs"
            >
              Desactivar
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-v-night">Marcas del cliente</h3>
        <Button onClick={openCreateBrand}>Nueva marca</Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Table
        columns={columns}
        rows={brands}
        loading={loading}
        emptyMessage="No hay marcas registradas para este cliente."
      />

      <Modal
        isOpen={isBrandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        title={editingBrand ? 'Editar marca' : 'Nueva marca'}
      >
        <form onSubmit={handleBrandSubmit} className="flex flex-col gap-4">
          <Input
            id="brand-name"
            label="Nombre"
            value={brandForm.name}
            onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
            required
          />
          <Input
            id="brand-logo"
            label="URL del logo"
            placeholder="https://..."
            value={brandForm.logo_url}
            onChange={(e) => setBrandForm({ ...brandForm, logo_url: e.target.value })}
          />
          {brandFormError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {brandFormError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setBrandModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={brandSaving}>
              {brandSaving ? 'Guardando...' : editingBrand ? 'Guardar cambios' : 'Crear marca'}
            </Button>
          </div>
        </form>
      </Modal>

      {confirmDeactivate && (
        <ConfirmModal
          isOpen={Boolean(confirmDeactivate)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas desactivar la marca ${confirmDeactivate.name}? Los productos y SKUs existentes se conservan.`}
          onCancel={() => setConfirmDeactivate(null)}
          onConfirm={confirmDeactivateBrand}
          confirming={deactivating}
        />
      )}
    </div>
  )
}

// ── Brand detail: categories + products + SKUs ─────────────────────────────────

function BrandDetail({ tenantId, brand, onBack }) {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [categoryFormError, setCategoryFormError] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null)
  const [deletingCategory, setDeletingCategory] = useState(false)

  const [isProductModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState({ name: '', category_id: '' })
  const [productFormError, setProductFormError] = useState('')
  const [productSaving, setProductSaving] = useState(false)
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState(null)
  const [deletingProduct, setDeletingProduct] = useState(false)

  const [skuProduct, setSkuProduct] = useState(null)

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [cats, prods] = await Promise.all([
        getBrandCategories(tenantId, brand.id),
        getProducts(tenantId, brand.id),
      ])
      setCategories(cats)
      setProducts(prods)
    } catch {
      setError('No fue posible cargar el catálogo de la marca.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  // ── Categories ──

  function openCreateCategory() {
    setEditingCategory(null)
    setCategoryForm({ name: '' })
    setCategoryFormError('')
    setCategoryModalOpen(true)
  }

  function openEditCategory(category) {
    setEditingCategory(category)
    setCategoryForm({ name: category.name })
    setCategoryFormError('')
    setCategoryModalOpen(true)
  }

  async function handleCategorySubmit(e) {
    e.preventDefault()
    setCategoryFormError('')
    setCategorySaving(true)
    try {
      if (editingCategory) {
        await updateBrandCategory(tenantId, brand.id, editingCategory.id, {
          name: categoryForm.name,
        })
      } else {
        await createBrandCategory(tenantId, brand.id, { name: categoryForm.name })
      }
      setCategoryModalOpen(false)
      await loadAll()
    } catch (err) {
      setCategoryFormError(
        err.response?.data?.detail || 'No fue posible guardar la categoría.',
      )
    } finally {
      setCategorySaving(false)
    }
  }

  async function confirmDeleteCategoryAction() {
    if (!confirmDeleteCategory) return
    setDeletingCategory(true)
    try {
      await deleteBrandCategory(tenantId, brand.id, confirmDeleteCategory.id)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'No fue posible eliminar la categoría.')
    } finally {
      setDeletingCategory(false)
      setConfirmDeleteCategory(null)
    }
  }

  // ── Products ──

  function openCreateProduct() {
    setEditingProduct(null)
    setProductForm({ name: '', category_id: '' })
    setProductFormError('')
    setProductModalOpen(true)
  }

  function openEditProduct(product) {
    setEditingProduct(product)
    setProductForm({ name: product.name, category_id: product.category_id || '' })
    setProductFormError('')
    setProductModalOpen(true)
  }

  async function handleProductSubmit(e) {
    e.preventDefault()
    setProductFormError('')
    setProductSaving(true)
    const payload = { name: productForm.name, category_id: productForm.category_id || null }
    try {
      if (editingProduct) {
        await updateProduct(tenantId, brand.id, editingProduct.id, payload)
      } else {
        await createProduct(tenantId, brand.id, payload)
      }
      setProductModalOpen(false)
      await loadAll()
    } catch (err) {
      setProductFormError(err.response?.data?.detail || 'No fue posible guardar el producto.')
    } finally {
      setProductSaving(false)
    }
  }

  async function confirmDeleteProductAction() {
    if (!confirmDeleteProduct) return
    setDeletingProduct(true)
    try {
      await deleteProduct(tenantId, brand.id, confirmDeleteProduct.id)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'No fue posible eliminar el producto.')
    } finally {
      setDeletingProduct(false)
      setConfirmDeleteProduct(null)
    }
  }

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name || '—'
  }

  const productColumns = [
    { key: 'name', header: 'Nombre' },
    { key: 'category_id', header: 'Categoría', render: (row) => categoryName(row.category_id) },
    {
      key: 'is_active',
      header: 'Estado',
      render: (row) => (
        <Badge color={row.is_active ? 'green' : 'gray'}>
          {row.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setSkuProduct(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            SKUs
          </Button>
          <Button
            variant="secondary"
            onClick={() => openEditProduct(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirmDeleteProduct(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="w-fit text-sm font-medium text-v-magenta hover:underline"
      >
        ← Volver a marcas
      </button>

      <h3 className="text-lg font-semibold text-v-night">{brand.name}</h3>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <Spinner className="py-10" />
      ) : (
        <>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-v-night">Categorías</h4>
              <Button
                variant="secondary"
                onClick={openCreateCategory}
                className="!px-3 !py-1.5 text-xs"
              >
                Nueva categoría
              </Button>
            </div>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">Sin categorías registradas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-full bg-v-gray-50 px-3 py-1.5 text-sm text-v-night"
                  >
                    {c.name}
                    <button
                      type="button"
                      onClick={() => openEditCategory(c)}
                      aria-label={`Editar ${c.name}`}
                      className="text-gray-400 hover:text-v-night"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCategory(c)}
                      aria-label={`Eliminar ${c.name}`}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-v-night">Productos</h4>
              <Button onClick={openCreateProduct}>Nuevo producto</Button>
            </div>
            <Table
              columns={productColumns}
              rows={products}
              emptyMessage="No hay productos registrados en esta marca."
            />
          </div>
        </>
      )}

      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategory ? 'Editar categoría' : 'Nueva categoría'}
      >
        <form onSubmit={handleCategorySubmit} className="flex flex-col gap-4">
          <Input
            id="category-name"
            label="Nombre"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ name: e.target.value })}
            required
          />
          {categoryFormError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {categoryFormError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCategoryModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={categorySaving}>
              {categorySaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? 'Editar producto' : 'Nuevo producto'}
      >
        <form onSubmit={handleProductSubmit} className="flex flex-col gap-4">
          <Input
            id="product-name"
            label="Nombre"
            value={productForm.name}
            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-category" className="text-sm font-medium text-v-night">
              Categoría
            </label>
            <select
              id="product-category"
              value={productForm.category_id}
              onChange={(e) =>
                setProductForm({ ...productForm, category_id: e.target.value })
              }
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {productFormError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {productFormError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProductModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={productSaving}>
              {productSaving
                ? 'Guardando...'
                : editingProduct
                  ? 'Guardar cambios'
                  : 'Crear producto'}
            </Button>
          </div>
        </form>
      </Modal>

      {confirmDeleteCategory && (
        <ConfirmModal
          isOpen={Boolean(confirmDeleteCategory)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas eliminar la categoría ${confirmDeleteCategory.name}? Esta acción no se puede deshacer.`}
          onCancel={() => setConfirmDeleteCategory(null)}
          onConfirm={confirmDeleteCategoryAction}
          confirming={deletingCategory}
        />
      )}

      {confirmDeleteProduct && (
        <ConfirmModal
          isOpen={Boolean(confirmDeleteProduct)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas eliminar el producto ${confirmDeleteProduct.name}? Se eliminarán también sus SKUs.`}
          onCancel={() => setConfirmDeleteProduct(null)}
          onConfirm={confirmDeleteProductAction}
          confirming={deletingProduct}
        />
      )}

      {skuProduct && (
        <SkuModal
          tenantId={tenantId}
          brandId={brand.id}
          product={skuProduct}
          onClose={() => setSkuProduct(null)}
        />
      )}
    </div>
  )
}

// ── SKU management modal ────────────────────────────────────────────────────────

function SkuModal({ tenantId, brandId, product, onClose }) {
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingSku, setEditingSku] = useState(null)
  const [form, setForm] = useState({ code: '', name: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function loadSkus() {
    setLoading(true)
    setError('')
    try {
      const data = await getSKUs(tenantId, brandId, product.id)
      setSkus(data)
    } catch {
      setError('No fue posible cargar los SKUs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  function startCreate() {
    setEditingSku(null)
    setForm({ code: '', name: '' })
    setFormError('')
  }

  function startEdit(sku) {
    setEditingSku(sku)
    setForm({ code: sku.code, name: sku.name })
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      if (editingSku) {
        await updateSKU(tenantId, brandId, product.id, editingSku.id, form)
      } else {
        await createSKU(tenantId, brandId, product.id, form)
      }
      startCreate()
      await loadSkus()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'No fue posible guardar el SKU.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteSKU(tenantId, brandId, product.id, confirmDelete.id)
      await loadSkus()
    } catch {
      setError('No fue posible eliminar el SKU.')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  const columns = [
    { key: 'code', header: 'Código' },
    { key: 'name', header: 'Nombre' },
    {
      key: 'is_active',
      header: 'Estado',
      render: (row) => (
        <Badge color={row.is_active ? 'green' : 'gray'}>
          {row.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => startEdit(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirmDelete(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <Modal isOpen onClose={onClose} title={`SKUs de ${product.name}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="mb-4 flex items-end gap-3">
        <Input
          id="sku-code"
          label="Código"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
        <Input
          id="sku-name"
          label="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingSku ? 'Guardar' : 'Agregar SKU'}
        </Button>
        {editingSku && (
          <Button type="button" variant="secondary" onClick={startCreate}>
            Cancelar
          </Button>
        )}
      </form>

      {formError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Table
        columns={columns}
        rows={skus}
        loading={loading}
        emptyMessage="No hay SKUs registrados para este producto."
      />

      {confirmDelete && (
        <ConfirmModal
          isOpen={Boolean(confirmDelete)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas eliminar el SKU ${confirmDelete.code}?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteAction}
          confirming={deleting}
        />
      )}
    </Modal>
  )
}
