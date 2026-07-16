import { useEffect, useState } from 'react'
import { useActiveTenant } from '../../hooks/useActiveTenant'
import {
  createCampaign,
  getCampaigns,
  updateCampaignStatus,
} from '../../services/campaignService'
import { getActivePOS } from '../../services/posService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

const ACTIVITY_TYPE_LABELS = {
  sorteo: 'Sorteo',
  incentivo_fuerza_venta: 'Incentivo fuerza de venta',
  compras_consumidor: 'Compras consumidor',
  rotacion: 'Rotación',
}

const STATUS_BADGE = {
  draft: { color: 'gray', label: 'Borrador' },
  active: { color: 'green', label: 'Activa' },
  paused: { color: 'yellow', label: 'Pausada' },
  closed: { color: 'blue', label: 'Cerrada' },
  archived: { color: 'purple', label: 'Archivada' },
}

const PRIZE_TYPE_LABELS = {
  articulo: 'Artículo',
  dinero: 'Dinero',
  servicio: 'Servicio',
}

const STEPS = ['Datos generales', 'POS y mecánica', 'Premios', 'Resumen']

function emptyForm() {
  return {
    name: '',
    description: '',
    activity_type: 'sorteo',
    starts_at: '',
    ends_at: '',
    pos_ids: [],
    participation_method: '',
    prizes: [{ name: '', prize_type: 'articulo', quantity: 1 }],
  }
}

export default function CampaignsPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  const [campaigns, setCampaigns] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isModalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  const [activePOS, setActivePOS] = useState([])
  const [posLoading, setPosLoading] = useState(false)

  async function loadCampaigns() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const data = await getCampaigns(tenantId, { page, limit: 20 })
      setCampaigns(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar las campañas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page])

  async function openModal() {
    setForm(emptyForm())
    setFormError('')
    setStep(0)
    setModalOpen(true)
    setPosLoading(true)
    try {
      const data = await getActivePOS(tenantId)
      setActivePOS(data)
    } catch {
      setActivePOS([])
    } finally {
      setPosLoading(false)
    }
  }

  function updatePrize(index, field, value) {
    const prizes = form.prizes.map((prize, i) =>
      i === index ? { ...prize, [field]: value } : prize,
    )
    setForm({ ...form, prizes })
  }

  function addPrize() {
    if (form.prizes.length >= 3) return
    setForm({
      ...form,
      prizes: [...form.prizes, { name: '', prize_type: 'articulo', quantity: 1 }],
    })
  }

  function removePrize(index) {
    setForm({ ...form, prizes: form.prizes.filter((_, i) => i !== index) })
  }

  function canAdvance() {
    if (step === 0) return form.name.trim().length > 0
    return true
  }

  async function handleSubmit() {
    setFormError('')
    setSaving(true)
    try {
      await createCampaign(tenantId, {
        name: form.name,
        description: form.description || null,
        activity_type: form.activity_type,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        participation_method: form.participation_method || null,
        pos_ids: form.pos_ids,
        prizes: form.prizes
          .filter((prize) => prize.name.trim())
          .map((prize, index) => ({
            name: prize.name,
            prize_type: prize.prize_type,
            quantity: Number(prize.quantity) || 1,
            order: index + 1,
          })),
      })
      setModalOpen(false)
      setPage(1)
      await loadCampaigns()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear la campaña.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function activateCampaign(campaign) {
    setStatusUpdatingId(campaign.id)
    try {
      await updateCampaignStatus(tenantId, campaign.id, { status: 'active' })
      await loadCampaigns()
    } catch {
      setError('No fue posible activar la campaña.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'activity_type',
      header: 'Tipo',
      render: (row) =>
        ACTIVITY_TYPE_LABELS[row.activity_type] || row.activity_type || '—',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => {
        const badge = STATUS_BADGE[row.status] || STATUS_BADGE.draft
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'starts_at',
      header: 'Fecha inicio',
      render: (row) =>
        row.starts_at ? new Date(row.starts_at).toLocaleDateString('es-CO') : '—',
    },
    {
      key: 'ends_at',
      header: 'Fecha fin',
      render: (row) =>
        row.ends_at ? new Date(row.ends_at).toLocaleDateString('es-CO') : '—',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) =>
        row.status === 'draft' ? (
          <Button
            variant="secondary"
            disabled={statusUpdatingId === row.id}
            onClick={() => activateCampaign(row)}
            className="!px-3 !py-1.5 text-xs"
          >
            Activar
          </Button>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ]

  if (isSuperAdmin && tenantLoading) {
    return <p className="text-sm text-gray-500">Cargando tenants...</p>
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un tenant disponible para mostrar las campañas.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Gestiona las campañas del tenant.</p>
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
          <Button onClick={openModal}>Nueva campaña</Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={columns}
        rows={campaigns}
        loading={loading}
        page={page}
        pages={pages}
        onPageChange={setPage}
        emptyMessage="No hay campañas registradas."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva campaña"
        maxWidth="max-w-2xl"
      >
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  index <= step
                    ? 'bg-v-magenta text-v-white'
                    : 'bg-v-gray-50 text-gray-400'
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`hidden text-xs font-medium sm:block ${
                  index <= step ? 'text-v-night' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <div className="h-px flex-1 bg-v-border" />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <Input
              id="campaign-name"
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-description"
                className="text-sm font-medium text-v-night"
              >
                Descripción
              </label>
              <textarea
                id="campaign-description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-activity-type"
                className="text-sm font-medium text-v-night"
              >
                Tipo de actividad
              </label>
              <select
                id="campaign-activity-type"
                value={form.activity_type}
                onChange={(e) =>
                  setForm({ ...form, activity_type: e.target.value })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              >
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="campaign-starts-at"
                type="datetime-local"
                label="Fecha inicio"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
              <Input
                id="campaign-ends-at"
                type="datetime-local"
                label="Fecha fin"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-pos"
                className="text-sm font-medium text-v-night"
              >
                Puntos de venta
              </label>
              {posLoading ? (
                <p className="text-sm text-gray-400">Cargando POS activos...</p>
              ) : (
                <select
                  id="campaign-pos"
                  multiple
                  value={form.pos_ids}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pos_ids: Array.from(e.target.selectedOptions, (o) => o.value),
                    })
                  }
                  className="h-36 w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
                >
                  {activePOS.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.name}
                      {pos.nit_emisor ? ` — ${pos.nit_emisor}` : ''}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-400">
                Mantén Ctrl/Cmd para seleccionar varios puntos de venta.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-participation-method"
                className="text-sm font-medium text-v-night"
              >
                Mecánica de participación
              </label>
              <textarea
                id="campaign-participation-method"
                rows={3}
                value={form.participation_method}
                onChange={(e) =>
                  setForm({ ...form, participation_method: e.target.value })
                }
                placeholder="Describe cómo participan los clientes"
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {form.prizes.map((prize, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-lg border border-v-border p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-v-night">
                    Premio {index + 1}
                  </span>
                  {form.prizes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePrize(index)}
                      className="text-xs font-medium text-red-500 hover:underline"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <Input
                  id={`prize-name-${index}`}
                  label="Nombre"
                  value={prize.name}
                  onChange={(e) => updatePrize(index, 'name', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-v-night">Tipo</label>
                    <select
                      value={prize.prize_type}
                      onChange={(e) =>
                        updatePrize(index, 'prize_type', e.target.value)
                      }
                      className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
                    >
                      {Object.entries(PRIZE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    id={`prize-quantity-${index}`}
                    type="number"
                    min="1"
                    label="Cantidad"
                    value={prize.quantity}
                    onChange={(e) =>
                      updatePrize(index, 'quantity', e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
            {form.prizes.length < 3 && (
              <Button type="button" variant="secondary" onClick={addPrize}>
                Agregar premio
              </Button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="font-medium text-v-night">{form.name || '—'}</p>
              <p className="text-gray-500">
                {ACTIVITY_TYPE_LABELS[form.activity_type]}
              </p>
              {form.description && (
                <p className="mt-1 text-gray-500">{form.description}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-v-gray-50 p-3">
              <div>
                <p className="text-xs text-gray-400">Fecha inicio</p>
                <p>{form.starts_at || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha fin</p>
                <p>{form.ends_at || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400">
                Puntos de venta seleccionados
              </p>
              <p>{form.pos_ids.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Premios</p>
              <ul className="mt-1 list-inside list-disc">
                {form.prizes
                  .filter((prize) => prize.name.trim())
                  .map((prize, index) => (
                    <li key={index}>
                      {prize.name} — {PRIZE_TYPE_LABELS[prize.prize_type]} x{' '}
                      {prize.quantity}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}

        {formError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => (step === 0 ? setModalOpen(false) : setStep(step - 1))}
          >
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canAdvance()}
              onClick={() => setStep(step + 1)}
            >
              Siguiente
            </Button>
          ) : (
            <Button type="button" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Creando...' : 'Confirmar y crear'}
            </Button>
          )}
        </div>
      </Modal>
    </div>
  )
}
