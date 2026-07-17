import { useEffect, useState } from 'react'
import { getCities, createCity, updateCity } from '../../services/citiesService'
import {
  AVAILABLE_PERMISSIONS,
  createRole,
  deleteRole,
  getRoles,
  updateRole,
} from '../../services/rolesService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'
import { formatDateTime } from '../../utils/formatDate'

const TABS = [
  { key: 'roles', label: 'Roles' },
  { key: 'ciudades', label: 'Ciudades' },
  { key: 'planes', label: 'Planes' },
]

const PLANS = [
  {
    key: 'free_demo',
    name: 'free_demo',
    duration: '15 días',
    maxUsers: '2 usuarios máx.',
  },
  {
    key: 'full',
    name: 'full',
    duration: 'Sin límite de días',
    maxUsers: '4 usuarios base',
  },
]

const EMPTY_ROLE_FORM = { value: '', label: '', description: '', permissions: [] }

function permissionLabels(permissions) {
  const perms = Array.isArray(permissions)
    ? permissions
    : Object.keys(permissions || {})
  return perms.map(
    (value) =>
      AVAILABLE_PERMISSIONS.find((permission) => permission.value === value)?.label ||
      value,
  )
}

function RolesTab() {
  const [roles, setRoles] = useState([])
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_ROLE_FORM)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    setRoles(getRoles())
  }, [])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_ROLE_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(role) {
    setEditingId(role.id)
    setForm({
      value: role.value,
      label: role.label,
      description: role.description,
      permissions: Array.isArray(role.permissions)
        ? role.permissions
        : Object.keys(role.permissions || {}),
    })
    setFormError('')
    setModalOpen(true)
  }

  function togglePermission(value) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(value)
        ? current.permissions.filter((p) => p !== value)
        : [...current.permissions, value],
    }))
  }

  function handleSave(e) {
    e.preventDefault()
    setFormError('')
    try {
      if (editingId) {
        updateRole(editingId, form)
      } else {
        createRole(form)
      }
      setRoles(getRoles())
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message || 'No fue posible guardar el rol.')
    }
  }

  function requestDelete(role) {
    setDeleteTarget(role)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    deleteRole(deleteTarget.id)
    setRoles(getRoles())
    setDeleteTarget(null)
  }

  const columns = [
    { key: 'value', header: 'Nombre' },
    { key: 'label', header: 'Label visible' },
    { key: 'description', header: 'Descripción' },
    {
      key: 'permissions',
      header: 'Permisos',
      render: (row) => {
        const labels = permissionLabels(row.permissions)
        return labels.length ? labels.join(', ') : '—'
      },
    },
    {
      key: 'created_at',
      header: 'Fecha creación',
      render: (row) => formatDateTime(row.created_at),
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
            onClick={() => requestDelete(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Roles asignables a usuarios de un cliente. El rol super_admin no se
          gestiona aquí — no es asignable desde el formulario de usuarios.
        </p>
        <Button onClick={openCreateModal}>Nuevo rol</Button>
      </div>
      <Table
        columns={columns}
        rows={roles}
        keyField="id"
        emptyMessage="No hay roles registrados."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar rol' : 'Nuevo rol'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input
            id="role-value"
            label="Nombre interno"
            placeholder="ej. supervisor"
            value={form.value}
            onChange={(e) =>
              setForm({
                ...form,
                value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
              })
            }
            required
          />
          <Input
            id="role-label"
            label="Label visible"
            placeholder="ej. Supervisor"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="role-description"
              className="text-sm font-medium text-v-night"
            >
              Descripción
            </label>
            <textarea
              id="role-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-v-night">Permisos</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_PERMISSIONS.map((permission) => (
                <label
                  key={permission.value}
                  className="flex items-center gap-2 text-sm text-v-night"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission.value)}
                    onChange={() => togglePermission(permission.value)}
                    className="h-4 w-4 rounded border-v-border text-v-magenta focus:ring-v-magenta"
                  />
                  {permission.label}
                </label>
              ))}
            </div>
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
            <Button type="submit">
              {editingId ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </div>
        </form>
      </Modal>

      {deleteTarget && (
        <ConfirmModal
          isOpen={Boolean(deleteTarget)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas eliminar el rol "${deleteTarget.label}"? Esta acción puede afectar el acceso al sistema.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

const EMPTY_CITY_FORM = { name: '', country: 'Colombia', active: true }

function CiudadesTab() {
  const [cities, setCities] = useState([])
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_CITY_FORM)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setCities(getCities())
  }, [])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_CITY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(city) {
    setEditingId(city.id)
    setForm({ name: city.name, country: city.country, active: city.active })
    setFormError('')
    setModalOpen(true)
  }

  function handleSave(e) {
    e.preventDefault()
    setFormError('')
    try {
      if (editingId) {
        updateCity(editingId, form)
      } else {
        createCity(form)
      }
      setCities(getCities())
      setModalOpen(false)
    } catch (err) {
      setFormError(err.message || 'No fue posible guardar la ciudad.')
    }
  }

  const columns = [
    { key: 'name', header: 'Ciudad' },
    { key: 'country', header: 'País' },
    {
      key: 'active',
      header: 'Estado',
      render: (row) => (
        <Badge color={row.active ? 'green' : 'gray'}>
          {row.active ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <Button
          variant="secondary"
          onClick={() => openEditModal(row)}
          className="!px-3 !py-1.5 text-xs"
        >
          Editar
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Ciudades disponibles para los formularios de usuarios y POS.
        </p>
        <Button onClick={openCreateModal}>Nueva ciudad</Button>
      </div>
      <Table
        columns={columns}
        rows={cities}
        keyField="id"
        emptyMessage="No hay ciudades registradas."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar ciudad' : 'Nueva ciudad'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input
            id="city-name"
            label="Nombre de la ciudad"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city-country" className="text-sm font-medium text-v-night">
              País
            </label>
            <select
              id="city-country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              <option value="Colombia">Colombia</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city-active" className="text-sm font-medium text-v-night">
              Estado
            </label>
            <select
              id="city-active"
              value={form.active ? 'true' : 'false'}
              onChange={(e) =>
                setForm({ ...form, active: e.target.value === 'true' })
              }
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            >
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
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
            <Button type="submit">
              {editingId ? 'Guardar cambios' : 'Crear ciudad'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function PlanesTab() {
  const columns = [
    { key: 'name', header: 'Plan' },
    { key: 'duration', header: 'Duración' },
    { key: 'maxUsers', header: 'Usuarios' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Planes disponibles en la plataforma. Solo visualización por ahora.
      </p>
      <Table columns={columns} rows={PLANS} keyField="key" />
    </div>
  )
}

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState('roles')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b border-v-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-v-magenta text-v-magenta'
                : 'border-transparent text-gray-500 hover:text-v-night'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'ciudades' && <CiudadesTab />}
        {activeTab === 'planes' && <PlanesTab />}
      </Card>
    </div>
  )
}
