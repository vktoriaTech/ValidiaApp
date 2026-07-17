import { useEffect, useMemo, useState } from 'react'
import {
  createUser,
  getUsers,
  updateUser,
  updateUserStatus,
} from '../../services/userService'
import { getRoles } from '../../services/rolesService'
import Table from '../ui/Table'
import Badge from '../ui/Badge'
import Modal from '../ui/Modal'
import ConfirmModal from '../ui/ConfirmModal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import TableFilters from '../ui/TableFilters'
import { formatDateTime } from '../../utils/formatDate'

const ROLE_BADGE = {
  super_admin: { color: 'purple', label: 'Super admin' },
  tenant_admin: { color: 'blue', label: 'Administrador' },
  tenant_viewer: { color: 'gray', label: 'Visualizador' },
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const EMPTY_FORM = {
  email: '',
  full_name: '',
  role: 'tenant_viewer',
  phone: '',
}

export default function UsersManager({ tenantId, extraHeader = null }) {
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const roleOptions = getRoles()

  async function loadUsers() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const data = await getUsers(tenantId, { page, limit: 20 })
      setUsers(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [tenantId])

  useEffect(() => {
    loadUsers()
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
    let result = users

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((user) =>
        [user.full_name, user.email].some((value) =>
          value?.toLowerCase().includes(q),
        ),
      )
    }

    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active'
      result = result.filter((user) => user.is_active === isActive)
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
  }, [users, search, statusFilter, sortKey, sortDir])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(user) {
    setEditingId(user.id)
    setForm({
      email: user.email || '',
      full_name: user.full_name || '',
      role: user.role || 'tenant_viewer',
      phone: user.phone || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      if (editingId) {
        await updateUser(tenantId, editingId, {
          full_name: form.full_name,
          role: form.role,
          phone: form.phone || null,
        })
      } else {
        await createUser(tenantId, {
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          phone: form.phone || null,
        })
        setPage(1)
      }
      setModalOpen(false)
      await loadUsers()
    } catch (err) {
      setFormError(
        err.response?.data?.detail ||
          `No fue posible ${editingId ? 'actualizar' : 'crear'} el usuario.`,
      )
    } finally {
      setSaving(false)
    }
  }

  function requestToggleStatus(user) {
    setConfirmTarget(user)
  }

  async function confirmToggleStatus() {
    if (!confirmTarget) return
    const user = confirmTarget
    setStatusUpdatingId(user.id)
    try {
      await updateUserStatus(tenantId, user.id, { is_active: !user.is_active })
      await loadUsers()
    } catch {
      setError('No fue posible actualizar el estado del usuario.')
    } finally {
      setStatusUpdatingId(null)
      setConfirmTarget(null)
    }
  }

  const columns = [
    { key: 'full_name', header: 'Nombre', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'role',
      header: 'Rol',
      sortable: true,
      render: (row) => {
        const badge = ROLE_BADGE[row.role]
        const roleOption = roleOptions.find((option) => option.value === row.role)
        return (
          <Badge color={badge?.color || 'gray'}>
            {badge?.label || roleOption?.label || row.role}
          </Badge>
        )
      },
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
      key: 'created_at',
      header: 'Fecha creación',
      sortable: true,
      render: (row) => new Date(row.created_at).toLocaleDateString('es-CO'),
    },
    {
      key: 'updated_at',
      header: 'Última actualización',
      sortable: true,
      render: (row) => formatDateTime(row.updated_at),
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
            onClick={() => requestToggleStatus(row)}
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
          searchPlaceholder="Buscar por nombre o email..."
          statusOptions={STATUS_OPTIONS}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <div className="flex items-center gap-3">
          {extraHeader}
          <Button onClick={openCreateModal}>Nuevo usuario</Button>
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
        emptyMessage="No hay usuarios registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar usuario' : 'Nuevo usuario'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {editingId ? (
            <Input id="user-email" type="email" label="Email" value={form.email} disabled />
          ) : (
            <Input
              id="user-email"
              type="email"
              label="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          )}
          <Input
            id="user-name"
            label="Nombre completo"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="user-role" className="text-sm font-medium text-v-night">
              Rol
            </label>
            <select
              id="user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            id="user-phone"
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
              {saving
                ? 'Guardando...'
                : editingId
                  ? 'Guardar cambios'
                  : 'Crear usuario'}
            </Button>
          </div>
        </form>
      </Modal>

      {confirmTarget && (
        <ConfirmModal
          isOpen={Boolean(confirmTarget)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas ${confirmTarget.is_active ? 'desactivar' : 'activar'} a ${confirmTarget.full_name}? Esta acción puede afectar el acceso al sistema.`}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={confirmToggleStatus}
          confirming={statusUpdatingId === confirmTarget.id}
        />
      )}
    </div>
  )
}
