import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  createCampaign,
  getCampaign,
  getCampaigns,
  updateCampaign,
  updateCampaignStatus,
} from '../../services/campaignService'
import { getActivePOS } from '../../services/posService'
import { getTenants } from '../../services/tenantService'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import TableFilters from '../../components/ui/TableFilters'
import { formatDateTime } from '../../utils/formatDate'

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
  tarjeta_regalo: 'Tarjeta de regalo',
  servicio: 'Servicio',
}

const MONEY_PRIZE_TYPES = ['dinero', 'tarjeta_regalo']

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'closed', label: 'Cerrada' },
]

const STEPS = ['Cliente', 'Datos generales', 'POS y mecánica', 'Premios', 'Resumen']

const PAGE_SIZE = 20

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

function formatMoneyCO(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

function parseMoneyCO(formatted) {
  return formatted.replace(/\D/g, '')
}

export default function CampaignsPage() {
  const authUser = useAuthStore((state) => state.user)
  const authTenant = useAuthStore((state) => state.tenant)
  const isSuperAdmin = authUser?.role === 'super_admin'
  const ownTenantId = authUser?.tenant_id ?? null

  const [clienteDirectory, setClienteDirectory] = useState([])
  const [clienteDirectoryLoading, setClienteDirectoryLoading] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState(null)
  const [pageClienteQuery, setPageClienteQuery] = useState('')

  const listTenantId = isSuperAdmin ? (selectedCliente?.id ?? null) : ownTenantId
  const allClientsMode = isSuperAdmin && !selectedCliente

  const [campaigns, setCampaigns] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const [isModalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)
  const [confirmCampaign, setConfirmCampaign] = useState(null)

  const [activePOS, setActivePOS] = useState([])
  const [posLoading, setPosLoading] = useState(false)

  const [wizardTenantId, setWizardTenantId] = useState(null)
  const [wizardTenantName, setWizardTenantName] = useState('')
  const [wizardClienteSearch, setWizardClienteSearch] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTenantId, setDetailTenantId] = useState(null)
  const [detailCampaign, setDetailCampaign] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [isEditingDetail, setEditingDetail] = useState(false)
  const [detailEditForm, setDetailEditForm] = useState(null)
  const [detailEditError, setDetailEditError] = useState('')
  const [detailSaving, setDetailSaving] = useState(false)

  const firstStep = isSuperAdmin ? 0 : 1

  useEffect(() => {
    if (!isSuperAdmin) return
    let active = true
    setClienteDirectoryLoading(true)
    getTenants({ page: 1, limit: 100 })
      .then((data) => {
        if (active) setClienteDirectory(data.items || [])
      })
      .catch(() => {
        if (active) setClienteDirectory([])
      })
      .finally(() => {
        if (active) setClienteDirectoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [isSuperAdmin])

  async function loadTenantCampaigns() {
    if (!listTenantId) {
      setCampaigns([])
      setPages(1)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getCampaigns(listTenantId, { page, limit: PAGE_SIZE })
      setCampaigns(data.items)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar las campañas.')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllCampaigns() {
    setLoading(true)
    setError('')
    try {
      const tenantsData = await getTenants({ page: 1, limit: 100 })
      const tenantList = tenantsData.items || []
      const results = await Promise.all(
        tenantList.map((t) =>
          getCampaigns(t.id, { page: 1, limit: 100 })
            .then((data) =>
              (data.items || []).map((c) => ({
                ...c,
                tenant_id: t.id,
                tenant_name: t.name,
              })),
            )
            .catch(() => []),
        ),
      )
      setCampaigns(results.flat())
    } catch {
      setError('No fue posible cargar las campañas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [listTenantId, allClientsMode])

  useEffect(() => {
    if (allClientsMode) {
      loadAllCampaigns()
    }
  }, [allClientsMode])

  useEffect(() => {
    if (!allClientsMode) {
      loadTenantCampaigns()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClientsMode, listTenantId, page])

  useEffect(() => {
    if (allClientsMode) setPage(1)
  }, [search, statusFilter, allClientsMode])

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredSorted = useMemo(() => {
    let result = campaigns

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((campaign) => campaign.name?.toLowerCase().includes(q))
    }

    if (statusFilter !== 'all') {
      result = result.filter((campaign) => campaign.status === statusFilter)
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
  }, [campaigns, search, statusFilter, sortKey, sortDir])

  const displayPages = allClientsMode
    ? Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
    : pages

  const visibleRows = allClientsMode
    ? filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredSorted

  const pageClienteResults = useMemo(() => {
    if (!pageClienteQuery.trim()) return []
    const q = pageClienteQuery.trim().toLowerCase()
    return clienteDirectory.filter((cliente) =>
      cliente.name?.toLowerCase().includes(q),
    )
  }, [clienteDirectory, pageClienteQuery])

  const filteredWizardClienteOptions = useMemo(() => {
    if (!wizardClienteSearch.trim()) return clienteDirectory
    const q = wizardClienteSearch.trim().toLowerCase()
    return clienteDirectory.filter(
      (cliente) =>
        cliente.name?.toLowerCase().includes(q) ||
        cliente.nit?.toLowerCase().includes(q),
    )
  }, [clienteDirectory, wizardClienteSearch])

  function openModal() {
    setForm(emptyForm())
    setFormError('')
    setActivePOS([])
    setWizardClienteSearch('')

    if (isSuperAdmin) {
      setWizardTenantId(null)
      setWizardTenantName('')
      setStep(0)
    } else {
      setWizardTenantId(ownTenantId)
      setWizardTenantName(authTenant?.name || authUser?.tenant_name || '')
      setStep(1)
    }
    setModalOpen(true)
  }

  function selectWizardCliente(cliente) {
    setWizardTenantId(cliente.id)
    setWizardTenantName(cliente.name)
  }

  function clearWizardCliente() {
    setWizardTenantId(null)
    setWizardTenantName('')
  }

  async function handleNext() {
    const nextStep = step + 1
    if (nextStep === 2) {
      setPosLoading(true)
      try {
        const data = await getActivePOS(wizardTenantId)
        setActivePOS(data)
      } catch {
        setActivePOS([])
      } finally {
        setPosLoading(false)
      }
    }
    setStep(nextStep)
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
    if (step === 0) return Boolean(wizardTenantId)
    if (step === 1) return form.name.trim().length > 0
    return true
  }

  async function refreshCurrentList() {
    if (allClientsMode) {
      await loadAllCampaigns()
    } else {
      await loadTenantCampaigns()
    }
  }

  async function handleSubmit() {
    setFormError('')
    setSaving(true)
    try {
      await createCampaign(wizardTenantId, {
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
      await refreshCurrentList()
    } catch (err) {
      setFormError(
        err.response?.data?.detail || 'No fue posible crear la campaña.',
      )
    } finally {
      setSaving(false)
    }
  }

  function requestActivate(campaign) {
    setConfirmCampaign(campaign)
  }

  async function confirmActivate() {
    if (!confirmCampaign) return
    const campaign = confirmCampaign
    const campaignTenantId = campaign.tenant_id || listTenantId
    setStatusUpdatingId(campaign.id)
    try {
      await updateCampaignStatus(campaignTenantId, campaign.id, { status: 'active' })
      await refreshCurrentList()
    } catch {
      setError('No fue posible activar la campaña.')
    } finally {
      setStatusUpdatingId(null)
      setConfirmCampaign(null)
    }
  }

  async function openDetail(campaign) {
    const campaignTenantId = campaign.tenant_id || listTenantId
    setDetailTenantId(campaignTenantId)
    setDetailOpen(true)
    setEditingDetail(false)
    setDetailError('')
    setDetailCampaign(null)
    setDetailLoading(true)
    try {
      const data = await getCampaign(campaignTenantId, campaign.id)
      setDetailCampaign(data)
    } catch {
      setDetailError('No fue posible cargar el detalle de la campaña.')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailOpen(false)
    setEditingDetail(false)
    setDetailCampaign(null)
  }

  function startEditDetail() {
    setDetailEditForm({
      name: detailCampaign.name || '',
      description: detailCampaign.description || '',
      activity_type: detailCampaign.activity_type || 'sorteo',
      starts_at: detailCampaign.starts_at
        ? detailCampaign.starts_at.slice(0, 16)
        : '',
      ends_at: detailCampaign.ends_at ? detailCampaign.ends_at.slice(0, 16) : '',
      participation_method: detailCampaign.participation_method || '',
    })
    setDetailEditError('')
    setEditingDetail(true)
  }

  async function saveDetailEdit(e) {
    e.preventDefault()
    setDetailEditError('')
    setDetailSaving(true)
    try {
      await updateCampaign(detailTenantId, detailCampaign.id, {
        name: detailEditForm.name,
        description: detailEditForm.description || null,
        activity_type: detailEditForm.activity_type,
        starts_at: detailEditForm.starts_at
          ? new Date(detailEditForm.starts_at).toISOString()
          : null,
        ends_at: detailEditForm.ends_at
          ? new Date(detailEditForm.ends_at).toISOString()
          : null,
        participation_method: detailEditForm.participation_method || null,
      })
      const refreshed = await getCampaign(detailTenantId, detailCampaign.id)
      setDetailCampaign(refreshed)
      setEditingDetail(false)
      await refreshCurrentList()
    } catch (err) {
      setDetailEditError(
        err.response?.data?.detail || 'No fue posible actualizar la campaña.',
      )
    } finally {
      setDetailSaving(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre', sortable: true },
    ...(allClientsMode
      ? [
          {
            key: 'tenant_name',
            header: 'Cliente',
            sortable: true,
            render: (row) => row.tenant_name || '—',
          },
        ]
      : []),
    {
      key: 'activity_type',
      header: 'Tipo',
      sortable: true,
      render: (row) =>
        ACTIVITY_TYPE_LABELS[row.activity_type] || row.activity_type || '—',
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (row) => {
        const badge = STATUS_BADGE[row.status] || STATUS_BADGE.draft
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'starts_at',
      header: 'Fecha inicio',
      sortable: true,
      render: (row) =>
        row.starts_at ? new Date(row.starts_at).toLocaleDateString('es-CO') : '—',
    },
    {
      key: 'ends_at',
      header: 'Fecha fin',
      sortable: true,
      render: (row) =>
        row.ends_at ? new Date(row.ends_at).toLocaleDateString('es-CO') : '—',
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
          <button
            type="button"
            onClick={() => openDetail(row)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-v-night hover:bg-v-gray-50"
          >
            Ver detalle
          </button>
          {row.status === 'draft' && (
            <Button
              variant="secondary"
              disabled={statusUpdatingId === row.id}
              onClick={() => requestActivate(row)}
              className="!px-3 !py-1.5 text-xs"
            >
              Activar
            </Button>
          )}
        </div>
      ),
    },
  ]

  if (!isSuperAdmin && !ownTenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un cliente disponible para mostrar las campañas.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TableFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre..."
          statusOptions={STATUS_OPTIONS}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <div className="flex items-center gap-3">
          {isSuperAdmin &&
            (selectedCliente ? (
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-v-gray-50 px-3 py-2 text-sm font-medium text-v-night">
                {selectedCliente.name}
                <button
                  type="button"
                  onClick={() => setSelectedCliente(null)}
                  aria-label="Quitar cliente seleccionado"
                  className="text-gray-400 hover:text-red-500"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ) : (
              <div className="relative w-64">
                <input
                  type="text"
                  value={pageClienteQuery}
                  onChange={(e) => setPageClienteQuery(e.target.value)}
                  placeholder="Buscar cliente por nombre..."
                  className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-v-magenta"
                />
                {pageClienteQuery.trim() && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-v-border bg-v-white shadow-lg">
                    {clienteDirectoryLoading ? (
                      <p className="px-3 py-2 text-sm text-gray-400">
                        Cargando clientes...
                      </p>
                    ) : pageClienteResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">
                        Sin resultados.
                      </p>
                    ) : (
                      pageClienteResults.map((cliente) => (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => {
                            setSelectedCliente({ id: cliente.id, name: cliente.name })
                            setPageClienteQuery('')
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-v-night hover:bg-v-gray-50"
                        >
                          {cliente.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
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
        rows={visibleRows}
        loading={loading}
        page={page}
        pages={displayPages}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
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
                {index}
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
            {wizardTenantId ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-v-gray-50 px-3 py-1.5 text-sm font-medium text-v-night">
                  {wizardTenantName}
                  <button
                    type="button"
                    onClick={clearWizardCliente}
                    aria-label="Quitar cliente seleccionado"
                    className="text-gray-400 hover:text-red-500"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              </div>
            ) : (
              <>
                <Input
                  id="campaign-cliente-search"
                  label="Cliente"
                  placeholder="Buscar cliente por nombre o NIT..."
                  value={wizardClienteSearch}
                  onChange={(e) => setWizardClienteSearch(e.target.value)}
                />
                {clienteDirectoryLoading ? (
                  <p className="text-sm text-gray-400">Cargando clientes...</p>
                ) : filteredWizardClienteOptions.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No se encontraron clientes.
                  </p>
                ) : (
                  <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                    {filteredWizardClienteOptions.map((cliente) => (
                      <button
                        key={cliente.id}
                        type="button"
                        onClick={() => selectWizardCliente(cliente)}
                        className="rounded-lg border border-v-border px-4 py-3 text-left transition-colors hover:border-v-magenta hover:bg-v-gray-50"
                      >
                        <p className="text-sm font-medium text-v-night">
                          {cliente.name}
                        </p>
                        <p className="text-xs text-gray-500">NIT {cliente.nit}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 1 && (
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

        {step === 2 && (
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

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {form.prizes.map((prize, index) => {
              const isMoneyPrize = MONEY_PRIZE_TYPES.includes(prize.prize_type)
              return (
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
                      <label className="text-sm font-medium text-v-night">
                        Tipo
                      </label>
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
                    {isMoneyPrize ? (
                      <Input
                        id={`prize-quantity-${index}`}
                        label="Valor"
                        inputMode="numeric"
                        placeholder="1.000.000"
                        value={formatMoneyCO(prize.quantity)}
                        onChange={(e) =>
                          updatePrize(index, 'quantity', parseMoneyCO(e.target.value))
                        }
                      />
                    ) : (
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
                    )}
                  </div>
                </div>
              )
            })}
            {form.prizes.length < 3 && (
              <Button type="button" variant="secondary" onClick={addPrize}>
                Agregar premio
              </Button>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Cliente</p>
              <p className="font-medium text-v-night">{wizardTenantName || '—'}</p>
            </div>
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
                      {prize.name} — {PRIZE_TYPE_LABELS[prize.prize_type]}{' '}
                      {MONEY_PRIZE_TYPES.includes(prize.prize_type)
                        ? `— $${formatMoneyCO(prize.quantity)}`
                        : `x ${prize.quantity}`}
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
            onClick={() =>
              step === firstStep ? setModalOpen(false) : setStep(step - 1)
            }
          >
            {step === firstStep ? 'Cancelar' : 'Atrás'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!canAdvance()} onClick={handleNext}>
              Siguiente
            </Button>
          ) : (
            <Button type="button" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Creando...' : 'Confirmar y crear'}
            </Button>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={detailOpen}
        onClose={closeDetail}
        title="Detalle de campaña"
        maxWidth="max-w-2xl"
      >
        {detailLoading ? (
          <Spinner className="py-10" />
        ) : detailError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {detailError}
          </p>
        ) : !detailCampaign ? null : isEditingDetail ? (
          <form onSubmit={saveDetailEdit} className="flex flex-col gap-4">
            <Input
              id="detail-edit-name"
              label="Nombre"
              value={detailEditForm.name}
              onChange={(e) =>
                setDetailEditForm({ ...detailEditForm, name: e.target.value })
              }
              required
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="detail-edit-description"
                className="text-sm font-medium text-v-night"
              >
                Descripción
              </label>
              <textarea
                id="detail-edit-description"
                rows={3}
                value={detailEditForm.description}
                onChange={(e) =>
                  setDetailEditForm({
                    ...detailEditForm,
                    description: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="detail-edit-activity-type"
                className="text-sm font-medium text-v-night"
              >
                Tipo de actividad
              </label>
              <select
                id="detail-edit-activity-type"
                value={detailEditForm.activity_type}
                onChange={(e) =>
                  setDetailEditForm({
                    ...detailEditForm,
                    activity_type: e.target.value,
                  })
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
                id="detail-edit-starts-at"
                type="datetime-local"
                label="Fecha inicio"
                value={detailEditForm.starts_at}
                onChange={(e) =>
                  setDetailEditForm({
                    ...detailEditForm,
                    starts_at: e.target.value,
                  })
                }
              />
              <Input
                id="detail-edit-ends-at"
                type="datetime-local"
                label="Fecha fin"
                value={detailEditForm.ends_at}
                onChange={(e) =>
                  setDetailEditForm({ ...detailEditForm, ends_at: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="detail-edit-participation"
                className="text-sm font-medium text-v-night"
              >
                Mecánica de participación
              </label>
              <textarea
                id="detail-edit-participation"
                rows={3}
                value={detailEditForm.participation_method}
                onChange={(e) =>
                  setDetailEditForm({
                    ...detailEditForm,
                    participation_method: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              />
            </div>

            {detailEditError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {detailEditError}
              </p>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingDetail(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={detailSaving}>
                {detailSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-v-night">
                  {detailCampaign.name}
                </p>
                <p className="text-gray-500">
                  {ACTIVITY_TYPE_LABELS[detailCampaign.activity_type] ||
                    detailCampaign.activity_type ||
                    '—'}
                </p>
              </div>
              <Badge
                color={
                  (STATUS_BADGE[detailCampaign.status] || STATUS_BADGE.draft).color
                }
              >
                {(STATUS_BADGE[detailCampaign.status] || STATUS_BADGE.draft).label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-v-gray-50 p-3">
              <div>
                <p className="text-xs text-gray-400">Fecha inicio</p>
                <p>
                  {detailCampaign.starts_at
                    ? new Date(detailCampaign.starts_at).toLocaleString('es-CO')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha fin</p>
                <p>
                  {detailCampaign.ends_at
                    ? new Date(detailCampaign.ends_at).toLocaleString('es-CO')
                    : '—'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400">Descripción</p>
              <p className="mt-1 text-v-night">
                {detailCampaign.description || '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Mecánica de participación</p>
              <p className="mt-1 text-v-night">
                {detailCampaign.participation_method || '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Tipo de cierre</p>
              <p className="mt-1 text-v-night">
                {detailCampaign.closure_type || '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Premios</p>
              {detailCampaign.prizes?.length ? (
                <ul className="mt-1 list-inside list-disc">
                  {detailCampaign.prizes.map((prize) => (
                    <li key={prize.id}>
                      {prize.name} — {PRIZE_TYPE_LABELS[prize.prize_type] || prize.prize_type}{' '}
                      {MONEY_PRIZE_TYPES.includes(prize.prize_type)
                        ? `— $${formatMoneyCO(prize.quantity)}`
                        : `x ${prize.quantity}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-gray-400">Sin premios asociados.</p>
              )}
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={closeDetail}>
                Cerrar
              </Button>
              {detailCampaign.status === 'draft' && (
                <Button type="button" onClick={startEditDetail}>
                  Editar campaña
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirmCampaign && (
        <ConfirmModal
          isOpen={Boolean(confirmCampaign)}
          title="Confirmar acción"
          message={`¿Estás seguro de que deseas activar a ${confirmCampaign.name}? Esta acción puede afectar el acceso al sistema.`}
          onCancel={() => setConfirmCampaign(null)}
          onConfirm={confirmActivate}
          confirming={statusUpdatingId === confirmCampaign.id}
        />
      )}
    </div>
  )
}
