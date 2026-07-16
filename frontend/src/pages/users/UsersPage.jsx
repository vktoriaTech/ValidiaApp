import { useEffect, useState } from 'react'
import { useActiveTenant } from '../../hooks/useActiveTenant'
import {
  createUser,
  getUsers,
  updateUserStatus,
} from '../../services/userService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

const ROLE_BADGE = {
  super_admin: { color: 'purple', label: 'Super admin' },
  tenant_admin: { color: 'blue', label: 'Administrador' },
  tenant_viewer: { color: 'gray', label: 'Visualizador' },
}

const EMPTY_FORM = {
  email: '',
  full_name: '',
  role: 'tenant_viewer',
  phone: '',
  city: '',
}

export default function UsersPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isModalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

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
    loadUsers()
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
      await createUser(tenantId, {
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        phone: form.phone || null,
        city: form.city || null,
      })
      setModalOpen(false)
      setPage(1)
      await loadUsers()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear el usuario.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(user) {
    setStatusUpdatingId(user.id)
    try {
      await updateUserStatus(tenantId, user.id, { is_active: !user.is_active })
      await loadUsers()
    } catch {
      setError('No fue posible actualizar el estado del usuario.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns = [
    { key: 'full_name', header: 'Nombre' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Rol',
      render: (row) => {
        const badge = ROLE_BADGE[row.role] || { color: 'gray', label: row.role }
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
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
        No hay un tenant disponible para mostrar los usuarios.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Gestiona los usuarios del tenant.
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
          <Button onClick={openModal}>Nuevo usuario</Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={columns}
        rows={users}
        loading={loading}
        page={page}
        pages={pages}
        onPageChange={setPage}
        emptyMessage="No hay usuarios registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo usuario"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            id="user-email"
            type="email"
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
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
              <option value="tenant_viewer">Visualizador</option>
              <option value="tenant_admin">Administrador</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>

          <Input
            id="user-phone"
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            id="user-city"
            label="Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
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
              {saving ? 'Guardando...' : 'Crear usuario'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
