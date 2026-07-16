import { useEffect, useState } from 'react'
import { getCities, createCity, updateCity } from '../../services/citiesService'
import { getRoles, saveRoles } from '../../services/rolesService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'

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

function RolesTab() {
  const [roles, setRoles] = useState([])
  const [editingValue, setEditingValue] = useState(null)
  const [description, setDescription] = useState('')

  useEffect(() => {
    setRoles(getRoles())
  }, [])

  function openEdit(role) {
    setEditingValue(role.value)
    setDescription(role.description)
  }

  function handleSave(e) {
    e.preventDefault()
    const updated = roles.map((role) =>
      role.value === editingValue ? { ...role, description } : role,
    )
    saveRoles(updated)
    setRoles(updated)
    setEditingValue(null)
  }

  const columns = [
    { key: 'label', header: 'Nombre' },
    { key: 'description', header: 'Descripción' },
    { key: 'permissions', header: 'Permisos' },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <Button
          variant="secondary"
          onClick={() => openEdit(row)}
          className="!px-3 !py-1.5 text-xs"
        >
          Editar
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Roles asignables a usuarios de un cliente. El rol super_admin no se
        gestiona aquí — no es asignable desde el formulario de usuarios.
      </p>
      <Table columns={columns} rows={roles} keyField="value" />

      <Modal
        isOpen={Boolean(editingValue)}
        onClose={() => setEditingValue(null)}
        title="Editar rol"
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
            />
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingValue(null)}
            >
              Cancelar
            </Button>
            <Button type="submit">Guardar cambios</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const EMPTY_CITY_FORM = { name: '', country: 'Colombia', active: true }

function CiudadesTab() {
  const [cities, setCities] = useState([])
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_CITY_FORM)

  useEffect(() => {
    setCities(getCities())
  }, [])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_CITY_FORM)
    setModalOpen(true)
  }

  function openEditModal(city) {
    setEditingId(city.id)
    setForm({ name: city.name, country: city.country, active: city.active })
    setModalOpen(true)
  }

  function handleSave(e) {
    e.preventDefault()
    if (editingId) {
      updateCity(editingId, form)
    } else {
      createCity(form)
    }
    setCities(getCities())
    setModalOpen(false)
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
