import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getTenant,
  updateTenant,
  updateTenantStatus,
} from '../../services/tenantService'
import Breadcrumb from '../../components/ui/Breadcrumb'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import POSManager from '../../components/pos/POSManager'
import UsersManager from '../../components/users/UsersManager'

const STATUS_BADGE = {
  active: { color: 'green', label: 'Activo' },
  suspended: { color: 'red', label: 'Suspendido' },
  inactive: { color: 'gray', label: 'Inactivo' },
}

const TABS = [
  { key: 'info', label: 'Información general' },
  { key: 'pos', label: 'Puntos de venta' },
  { key: 'users', label: 'Usuarios' },
]

function formFromCliente(cliente) {
  return {
    name: cliente.name || '',
    nit: cliente.nit || '',
    slug: cliente.slug || '',
    whatsapp_number: cliente.whatsapp_number || '',
    status: cliente.status || 'active',
  }
}

export default function ClienteDetailPage() {
  const { clienteId } = useParams()
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('info')

  const [isEditOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function loadCliente() {
    setLoading(true)
    setError('')
    try {
      const data = await getTenant(clienteId)
      setCliente(data)
    } catch {
      setError('No fue posible cargar la información del cliente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCliente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function openEditModal() {
    setEditForm(formFromCliente(cliente))
    setEditError('')
    setEditOpen(true)
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditError('')
    setEditSaving(true)
    try {
      await updateTenant(clienteId, {
        name: editForm.name,
        slug: editForm.slug || null,
        nit: editForm.nit,
        whatsapp_number: editForm.whatsapp_number || null,
      })
      if (editForm.status !== cliente.status) {
        await updateTenantStatus(clienteId, { status: editForm.status })
      }
      setEditOpen(false)
      await loadCliente()
    } catch (err) {
      setEditError(
        err.response?.data?.detail || 'No fue posible actualizar el cliente.',
      )
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) {
    return <Spinner className="mt-10" />
  }

  if (error || !cliente) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumb
          items={[{ label: 'Clientes', href: '/clientes' }, { label: 'Cliente' }]}
        />
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error || 'Cliente no encontrado.'}
        </p>
      </div>
    )
  }

  const badge = STATUS_BADGE[cliente.status] || STATUS_BADGE.inactive

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[{ label: 'Clientes', href: '/clientes' }, { label: cliente.name }]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-v-night">{cliente.name}</h2>
          <Badge color={badge.color}>{badge.label}</Badge>
        </div>
        <Button variant="secondary" onClick={openEditModal}>
          Editar cliente
        </Button>
      </div>

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

      {activeTab === 'info' && (
        <Card>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                Nombre
              </dt>
              <dd className="mt-1 text-sm text-v-night">{cliente.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                NIT
              </dt>
              <dd className="mt-1 text-sm text-v-night">{cliente.nit}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                Slug
              </dt>
              <dd className="mt-1 text-sm text-v-night">{cliente.slug}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                Estado
              </dt>
              <dd className="mt-1">
                <Badge color={badge.color}>{badge.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                WhatsApp
              </dt>
              <dd className="mt-1 text-sm text-v-night">
                {cliente.whatsapp_number || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                Fecha creación
              </dt>
              <dd className="mt-1 text-sm text-v-night">
                {new Date(cliente.created_at).toLocaleDateString('es-CO')}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {activeTab === 'pos' && <POSManager tenantId={clienteId} />}
      {activeTab === 'users' && <UsersManager tenantId={clienteId} />}

      <Modal
        isOpen={isEditOpen}
        onClose={() => setEditOpen(false)}
        title="Editar cliente"
      >
        {editForm && (
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            <Input
              id="edit-cliente-name"
              label="Nombre"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <Input
              id="edit-cliente-nit"
              label="NIT"
              value={editForm.nit}
              onChange={(e) => setEditForm({ ...editForm, nit: e.target.value })}
              required
            />
            <Input
              id="edit-cliente-slug"
              label="Slug"
              value={editForm.slug}
              onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
            />
            <Input
              id="edit-cliente-whatsapp"
              label="WhatsApp"
              placeholder="+57 300 000 0000"
              value={editForm.whatsapp_number}
              onChange={(e) =>
                setEditForm({ ...editForm, whatsapp_number: e.target.value })
              }
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="edit-cliente-status"
                className="text-sm font-medium text-v-night"
              >
                Estado
              </label>
              <select
                id="edit-cliente-status"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm({ ...editForm, status: e.target.value })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>

            {editError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {editError}
              </p>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
