import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import TableFilters from '../../components/ui/TableFilters'

const STATUS_BADGE = {
  active: { color: 'green', label: 'Activo' },
  suspended: { color: 'red', label: 'Suspendido' },
  inactive: { color: 'gray', label: 'Inactivo' },
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'suspended', label: 'Suspendido' },
]

const EMPTY_FORM = { name: '', slug: '', nit: '', whatsapp_number: '' }

export default function ClientesPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [clientes, setClientes] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const [isModalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  async function loadClientes() {
    setLoading(true)
    setError('')
    try {
      const data = await getTenants({ page, limit: 20 })
      setClientes(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar los clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    loadClientes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isSuperAdmin])

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const visibleRows = useMemo(() => {
    let result = clientes

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((cliente) =>
        [cliente.name, cliente.nit, cliente.slug].some((value) =>
          value?.toLowerCase().includes(q),
        ),
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((cliente) => cliente.status === statusFilter)
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [clientes, search, statusFilter, sortKey, sortDir])

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
      await loadClientes()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear el cliente.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(cliente) {
    const nextStatus = cliente.status === 'active' ? 'suspended' : 'active'
    setStatusUpdatingId(cliente.id)
    try {
      await updateTenantStatus(cliente.id, { status: nextStatus })
      await loadClientes()
    } catch {
      setError('No fue posible actualizar el estado del cliente.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      sortable: true,
      render: (row) => (
        <Link
          to={`/clientes/${row.id}`}
          className="font-medium text-v-night hover:text-v-magenta hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    { key: 'slug', header: 'Slug', sortable: true },
    { key: 'nit', header: 'NIT', sortable: true },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (row) => {
        const badge = STATUS_BADGE[row.status] || STATUS_BADGE.inactive
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'created_at',
      header: 'Fecha creación',
      sortable: true,
      render: (row) => new Date(row.created_at).toLocaleDateString('es-CO'),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/clientes/${row.id}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-v-night hover:bg-v-gray-50"
          >
            Ver detalle
          </Link>
          <Button
            variant="secondary"
            disabled={statusUpdatingId === row.id}
            onClick={() => toggleStatus(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            {row.status === 'active' ? 'Suspender' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TableFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre, NIT o slug..."
          statusOptions={STATUS_OPTIONS}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <Button onClick={openModal}>Nuevo cliente</Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        page={page}
        pages={pages}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        emptyMessage="No hay clientes registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo cliente"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            id="cliente-name"
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            id="cliente-slug"
            label="Slug (opcional)"
            placeholder="se genera automáticamente si se deja vacío"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <Input
            id="cliente-nit"
            label="NIT"
            value={form.nit}
            onChange={(e) => setForm({ ...form, nit: e.target.value })}
            required
          />
          <Input
            id="cliente-whatsapp"
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
              {saving ? 'Guardando...' : 'Crear cliente'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
