import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  createTenant,
  getTenants,
  updateTenantStatus,
} from '../../services/tenantService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

const STATUS_BADGE = {
  active: { color: 'green', label: 'Activo' },
  suspended: { color: 'red', label: 'Suspendido' },
  inactive: { color: 'gray', label: 'Inactivo' },
}

const EMPTY_FORM = { name: '', slug: '', nit: '', whatsapp_number: '' }

export default function TenantsPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [tenants, setTenants] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isModalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  async function loadTenants() {
    setLoading(true)
    setError('')
    try {
      const data = await getTenants({ page, limit: 20 })
      setTenants(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar los tenants.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    loadTenants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isSuperAdmin])

  if (!isSuperAdmin) {
    return (
      <p className="text-sm text-gray-500">
        No tienes permisos para ver este módulo.
      </p>
    )
  }

  function openModal() {
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      await createTenant({
        name: form.name,
        slug: form.slug || null,
        nit: form.nit,
        whatsapp_number: form.whatsapp_number || null,
      })
      setModalOpen(false)
      setPage(1)
      await loadTenants()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear el tenant.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(tenant) {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active'
    setStatusUpdatingId(tenant.id)
    try {
      await updateTenantStatus(tenant.id, { status: nextStatus })
      await loadTenants()
    } catch {
      setError('No fue posible actualizar el estado del tenant.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre' },
    { key: 'slug', header: 'Slug' },
    { key: 'nit', header: 'NIT' },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => {
        const badge = STATUS_BADGE[row.status] || STATUS_BADGE.inactive
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'created_at',
      header: 'Fecha creación',
      render: (row) => new Date(row.created_at).toLocaleDateString('es-CO'),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <Button
          variant="secondary"
          disabled={statusUpdatingId === row.id}
          onClick={() => toggleStatus(row)}
          className="!px-3 !py-1.5 text-xs"
        >
          {row.status === 'active' ? 'Suspender' : 'Activar'}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Gestiona los tenants de la plataforma.
        </p>
        <Button onClick={openModal}>Nuevo tenant</Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={columns}
        rows={tenants}
        loading={loading}
        page={page}
        pages={pages}
        onPageChange={setPage}
        emptyMessage="No hay tenants registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo tenant"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            id="tenant-name"
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            id="tenant-slug"
            label="Slug (opcional)"
            placeholder="se genera automáticamente si se deja vacío"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <Input
            id="tenant-nit"
            label="NIT"
            value={form.nit}
            onChange={(e) => setForm({ ...form, nit: e.target.value })}
            required
          />
          <Input
            id="tenant-whatsapp"
            label="WhatsApp"
            placeholder="+57 300 000 0000"
            value={form.whatsapp_number}
            onChange={(e) =>
              setForm({ ...form, whatsapp_number: e.target.value })
            }
          />

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Crear tenant'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
