import { useEffect, useMemo, useState } from 'react'
import {
  createPOS,
  getPOS,
  updatePOS,
  updatePOSStatus,
} from '../../services/posService'
import { getActiveCityNames } from '../../services/citiesService'
import Table from '../ui/Table'
import Badge from '../ui/Badge'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import TableFilters from '../ui/TableFilters'

const POS_TYPE_LABELS = {
  propio: 'Propio',
  cliente: 'Cliente',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const EMPTY_FORM = {
  name: '',
  pos_type: 'cliente',
  category: '',
  nit_emisor: '',
  city: '',
  address: '',
  lat: '',
  lng: '',
}

export default function POSManager({ tenantId, extraHeader = null }) {
  const [posList, setPosList] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  const cityOptions = getActiveCityNames()

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
    setPage(1)
  }, [tenantId])

  useEffect(() => {
    loadPOS()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page])

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const visibleRows = useMemo(() => {
    let result = posList

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((pos) =>
        [pos.name, pos.nit_emisor, pos.city].some((value) =>
          value?.toLowerCase().includes(q),
        ),
      )
    }

    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active'
      result = result.filter((pos) => pos.is_active === isActive)
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
  }, [posList, search, statusFilter, sortKey, sortDir])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(pos) {
    setEditingId(pos.id)
    setForm({
      name: pos.name || '',
      pos_type: pos.pos_type || 'cliente',
      category: pos.category || '',
      nit_emisor: pos.nit_emisor || '',
      city: pos.city || '',
      address: pos.address || '',
      lat: pos.lat ?? '',
      lng: pos.lng ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    const payload = {
      name: form.name,
      pos_type: form.pos_type,
      category: form.category || null,
      nit_emisor: form.nit_emisor || null,
      city: form.city || null,
      address: form.address || null,
      lat: form.lat !== '' ? Number(form.lat) : null,
      lng: form.lng !== '' ? Number(form.lng) : null,
    }
    try {
      if (editingId) {
        await updatePOS(tenantId, editingId, payload)
      } else {
        await createPOS(tenantId, payload)
        setPage(1)
      }
      setModalOpen(false)
      await loadPOS()
    } catch (err) {
      setFormError(
        err.response?.data?.detail ||
          `No fue posible ${editingId ? 'actualizar' : 'crear'} el punto de venta.`,
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
    { key: 'name', header: 'Nombre', sortable: true },
    {
      key: 'pos_type',
      header: 'Tipo',
      sortable: true,
      render: (row) => POS_TYPE_LABELS[row.pos_type] || row.pos_type,
    },
    {
      key: 'category',
      header: 'Categoría',
      sortable: true,
      render: (row) => row.category || '—',
    },
    {
      key: 'nit_emisor',
      header: 'NIT Emisor',
      sortable: true,
      render: (row) => row.nit_emisor || '—',
    },
    {
      key: 'city',
      header: 'Ciudad',
      sortable: true,
      render: (row) => row.city || '—',
    },
    {
      key: 'is_active',
      header: 'Estado',
      sortable: true,
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
            onClick={() => openEditModal(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            disabled={statusUpdatingId === row.id}
            onClick={() => toggleStatus(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            {row.is_active ? 'Desactivar' : 'Activar'}
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
          searchPlaceholder="Buscar por nombre, NIT emisor o ciudad..."
          statusOptions={STATUS_OPTIONS}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <div className="flex items-center gap-3">
          {extraHeader}
          <Button onClick={openCreateModal}>Nuevo POS</Button>
        </div>
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
        emptyMessage="No hay puntos de venta registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar POS' : 'Nuevo POS'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pos-city" className="text-sm font-medium text-v-night">
              Ciudad
            </label>
            <select
              id="pos-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              <option value="">Selecciona una ciudad</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <Input
            id="pos-address"
            label="Dirección"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="pos-lat"
              type="number"
              step="any"
              min="-90"
              max="90"
              label="Latitud"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
            />
            <Input
              id="pos-lng"
              type="number"
              step="any"
              min="-180"
              max="180"
              label="Longitud"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
            />
          </div>

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
              {saving
                ? 'Guardando...'
                : editingId
                  ? 'Guardar cambios'
                  : 'Crear POS'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
