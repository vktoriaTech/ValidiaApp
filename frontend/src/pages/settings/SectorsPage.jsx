import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  getSectors,
  createSector,
  updateSector,
  deleteSector,
} from '../../services/sectorService'
import Table from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'

const EMPTY_FORM = { name: '' }

export default function SectorsPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isModalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function loadSectors() {
    setLoading(true)
    setError('')
    try {
      const data = await getSectors({ limit: 100 })
      setSectors(data.items || [])
    } catch {
      setError('No fue posible cargar los sectores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSectors()
  }, [])

  if (!isSuperAdmin) {
    return (
      <p className="text-sm text-gray-500">
        No tienes permisos para ver este módulo.
      </p>
    )
  }

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(sector) {
    setEditingId(sector.id)
    setForm({ name: sector.name })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      if (editingId) {
        await updateSector(editingId, { name: form.name })
      } else {
        await createSector({ name: form.name })
      }
      setModalOpen(false)
      await loadSectors()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible guardar el sector.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSector(deleteTarget.id)
      setDeleteTarget(null)
      await loadSectors()
    } catch (err) {
      setError(
        err.response?.data?.detail || 'No fue posible eliminar el sector.',
      )
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre del sector' },
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
            onClick={() => setDeleteTarget(row)}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-v-night">Sectores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Catálogo global de sectores económicos. Se usa para clasificar clientes.
          </p>
        </div>
        <Button onClick={openCreateModal}>Nuevo sector</Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Card>
        <Table
          columns={columns}
          rows={sectors}
          loading={loading}
          keyField="id"
          emptyMessage="No hay sectores registrados."
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar sector' : 'Nuevo sector'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input
            id="sector-name"
            label="Nombre del sector"
            placeholder="ej. Retail, Alimentos y Bebidas"
            value={form.name}
            onChange={(e) => setForm({ name: e.target.value })}
            required
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
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear sector'}
            </Button>
          </div>
        </form>
      </Modal>

      {deleteTarget && (
        <ConfirmModal
          isOpen={Boolean(deleteTarget)}
          title="Eliminar sector"
          message={`¿Estás seguro de que deseas eliminar el sector "${deleteTarget.name}"? Los clientes asignados a este sector quedarán sin sector.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          confirming={deleting}
        />
      )}
    </div>
  )
}
