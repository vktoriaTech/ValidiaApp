import { useEffect, useState } from 'react'
import { useActiveTenant } from '../../hooks/useActiveTenant'
import { createPOS, getPOS, updatePOSStatus } from '../../services/posService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

const POS_TYPE_LABELS = {
  propio: 'Propio',
  cliente: 'Cliente',
}

const EMPTY_FORM = {
  name: '',
  pos_type: 'cliente',
  category: '',
  nit_emisor: '',
  city: '',
  address: '',
}

export default function POSPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  const [posList, setPosList] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isModalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  async function loadPOS() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const data = await getPOS(tenantId, { page, limit: 20 })
      setPosList(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar los puntos de venta.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPOS()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page])

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
      await createPOS(tenantId, {
        name: form.name,
        pos_type: form.pos_type,
        category: form.category || null,
        nit_emisor: form.nit_emisor || null,
        city: form.city || null,
        address: form.address || null,
      })
      setModalOpen(false)
      setPage(1)
      await loadPOS()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear el punto de venta.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(pos) {
    setStatusUpdatingId(pos.id)
    try {
      await updatePOSStatus(tenantId, pos.id, { is_active: !pos.is_active })
      await loadPOS()
    } catch {
      setError('No fue posible actualizar el estado del punto de venta.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'pos_type',
      header: 'Tipo',
      render: (row) => POS_TYPE_LABELS[row.pos_type] || row.pos_type,
    },
    { key: 'category', header: 'Categoría', render: (row) => row.category || '—' },
    {
      key: 'nit_emisor',
      header: 'NIT Emisor',
      render: (row) => row.nit_emisor || '—',
    },
    { key: 'city', header: 'Ciudad', render: (row) => row.city || '—' },
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
        <Button
          variant="secondary"
          disabled={statusUpdatingId === row.id}
          onClick={() => toggleStatus(row)}
          className="!px-3 !py-1.5 text-xs"
        >
          {row.is_active ? 'Desactivar' : 'Activar'}
        </Button>
      ),
    },
  ]

  if (isSuperAdmin && tenantLoading) {
    return <p className="text-sm text-gray-500">Cargando tenants...</p>
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un tenant disponible para mostrar los puntos de venta.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Gestiona los puntos de venta del tenant.
        </p>
        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <TenantSwitcher
              tenants={tenants}
              tenantId={tenantId}
              onChange={(id) => {
                setTenantId(id)
                setPage(1)
              }}
            />
          )}
          <Button onClick={openModal}>Nuevo POS</Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={columns}
        rows={posList}
        loading={loading}
        page={page}
        pages={pages}
        onPageChange={setPage}
        emptyMessage="No hay puntos de venta registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo POS"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            id="pos-name"
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pos-type" className="text-sm font-medium text-v-night">
              Tipo
            </label>
            <select
              id="pos-type"
              value={form.pos_type}
              onChange={(e) => setForm({ ...form, pos_type: e.target.value })}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              <option value="cliente">Cliente</option>
              <option value="propio">Propio</option>
            </select>
          </div>

          <Input
            id="pos-category"
            label="Categoría"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <Input
            id="pos-nit"
            label="NIT Emisor"
            value={form.nit_emisor}
            onChange={(e) => setForm({ ...form, nit_emisor: e.target.value })}
          />
          <Input
            id="pos-city"
            label="Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <Input
            id="pos-address"
            label="Dirección"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
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
              {saving ? 'Guardando...' : 'Crear POS'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
