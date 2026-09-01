import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  createCampaign,
  getCampaign,
  getCampaigns,
  updateCampaign,
  updateCampaignStatus,
} from '../../services/campaignService'
import { getActivePOS } from '../../services/posService'
import {
  getParticipations,
  runDraw,
  getWinners,
} from '../../services/participacionAdminService'
import { getTenants } from '../../services/tenantService'
import { getBrands } from '../../services/brandService'
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

const STEPS = [
  'Cliente',
  'Datos generales',
  'Premios',
  'Mecánica',
  'Reglas de participación',
  'Términos y Condiciones',
  'Resumen',
]

const PAGE_SIZE = 20

function emptyForm() {
  return {
    name: '',
    description: '',
    activity_type: 'sorteo',
    brand_id: '',
    objective_type: '',
    objective_label: '',
    objective_value: '',
    starts_at: '',
    ends_at: '',
    pos_ids: [],
    mechanic: 'acumulacion',
    closure_type: 'system',
    prizes: [
      { name: '', prize_type: 'articulo', quantity: 1, order: 1, min_amount: '', max_participations: '' },
    ],
    terms_text: '',
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
  const [activationMissing, setActivationMissing] = useState([])

  const [activePOS, setActivePOS] = useState([])
  const [posLoading, setPosLoading] = useState(false)
  const [posSearch, setPosSearch] = useState('')
  const [wizardBrands, setWizardBrands] = useState([])
  const [brandsLoading, setBrandsLoading] = useState(false)

  const [wizardTenantId, setWizardTenantId] = useState(null)
  const [wizardTenantName, setWizardTenantName] = useState('')
  const [wizardClienteSearch, setWizardClienteSearch] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTenantId, setDetailTenantId] = useState(null)
  const [detailCampaign, setDetailCampaign] = useState(null)
  const [detailPartCount, setDetailPartCount] = useState(0)
  const [detailWinners, setDetailWinners] = useState([])
  const [detailPartLoading, setDetailPartLoading] = useState(false)
  const [drawLoading, setDrawLoading] = useState(false)
  const [drawError, setDrawError] = useState('')
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const navigate = useNavigate()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [editingCampaignId, setEditingCampaignId] = useState(null)

  const firstStep = editingCampaignId ? 1 : (isSuperAdmin ? 0 : 1)

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
      setError('No fue posible cargar las actividades.')
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
      setError('No fue posible cargar las actividades.')
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
    setPosSearch('')
    setWizardClienteSearch('')
    setEditingCampaignId(null)

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

  function closeWizard() {
    setModalOpen(false)
    setEditingCampaignId(null)
  }

  function selectWizardCliente(cliente) {
    setWizardTenantId(cliente.id)
    setWizardTenantName(cliente.name)
  }

  function clearWizardCliente() {
    setWizardTenantId(null)
    setWizardTenantName('')
  }

  function resolveTenantName(tenantId) {
    if (!isSuperAdmin) return authTenant?.name || authUser?.tenant_name || ''
    return clienteDirectory.find((cliente) => cliente.id === tenantId)?.name || ''
  }

  async function handleNext() {
    const nextStep = step + 1
    if (nextStep === 1) {
      setBrandsLoading(true)
      try {
        const data = await getBrands(wizardTenantId, { is_active: true })
        setWizardBrands(Array.isArray(data) ? data : (data.items || []))
      } catch {
        setWizardBrands([])
      } finally {
        setBrandsLoading(false)
      }
    }
    if (nextStep === 3) {
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
    setForm({
      ...form,
      prizes: [
        ...form.prizes,
        {
          name: '',
          prize_type: 'articulo',
          quantity: 1,
          order: form.prizes.length + 1,
          min_amount: '',
          max_participations: '',
        },
      ],
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

  // Builds Campaign.rules per SPEC-04C §3.2.6 from the wizard's prize rules.
  function buildRules(prizes, posIds, startsAt, endsAt) {
    const validPrizes = prizes.filter((prize) => prize.name.trim())
    return {
      mechanic: 'acumulacion',
      date_start: startsAt ? startsAt.slice(0, 10) : null,
      date_end: endsAt ? endsAt.slice(0, 10) : null,
      pos_ids: posIds,
      eligibility: {
        type: 'threshold_per_prize',
        prizes: validPrizes.map((prize) => ({
          prize_order: Number(prize.order) || 1,
          min_amount: Number(prize.min_amount) || 0,
          max_participations: Number(prize.max_participations) || 1,
        })),
      },
    }
  }

  async function handleSubmit() {
    setFormError('')
    setSaving(true)
    try {
      const validPrizes = form.prizes.filter((prize) => prize.name.trim())
      const payload = {
        name: form.name,
        description: form.description || null,
        activity_type: form.activity_type,
        brand_id: form.brand_id || null,
        objective_type: form.objective_type || null,
        objective_label: form.objective_type === 'otros' ? (form.objective_label || null) : null,
        objective_value: form.objective_value ? Number(form.objective_value) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        participation_method: 'acumulacion',
        closure_type: form.closure_type || 'system',
        terms_text: form.terms_text.trim() || null,
        pos_ids: form.pos_ids,
        rules: buildRules(form.prizes, form.pos_ids, form.starts_at, form.ends_at),
        prizes: validPrizes.map((prize) => ({
          name: prize.name,
          prize_type: prize.prize_type,
          quantity: Number(prize.quantity) || 1,
          order: Number(prize.order) || 1,
        })),
      }

      if (editingCampaignId) {
        await updateCampaign(wizardTenantId, editingCampaignId, payload)
      } else {
        await createCampaign(wizardTenantId, payload)
      }

      closeWizard()
      setPage(1)
      await refreshCurrentList()
    } catch (err) {
      setFormError(
        err.response?.data?.detail ||
          (editingCampaignId
            ? 'No fue posible actualizar la actividad.'
            : 'No fue posible crear la actividad.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function requestActivate(campaign) {
    const campaignTenantId = campaign.tenant_id || listTenantId
    try {
      const detail = await getCampaign(campaignTenantId, campaign.id)
      const missing = []
      if (!detail.starts_at || !detail.ends_at) missing.push('Fechas de inicio y fin de la actividad')
      if (!detail.prizes || detail.prizes.length === 0) missing.push('Al menos 1 premio')
      if (!detail.pos || detail.pos.length === 0) missing.push('Al menos 1 punto de venta')
      if (!detail.terms_text || !detail.terms_text.trim()) missing.push('Términos y condiciones')
      if (missing.length > 0) {
        setActivationMissing(missing)
      } else {
        setConfirmCampaign(campaign)
      }
    } catch {
      setError('No fue posible verificar la actividad.')
    }
  }

  async function confirmActivate() {
    if (!confirmCampaign) return
    const campaign = confirmCampaign
    const campaignTenantId = campaign.tenant_id || listTenantId
    setStatusUpdatingId(campaign.id)
    try {
      await updateCampaignStatus(campaignTenantId, campaign.id, { status: 'active' })
      await refreshCurrentList()
    } catch (err) {
      const msg = err?.response?.data?.detail
      setError(msg || 'No fue posible activar la actividad.')
    } finally {
      setStatusUpdatingId(null)
      setConfirmCampaign(null)
    }
  }

  async function openDetail(campaign) {
    const campaignTenantId = campaign.tenant_id || listTenantId
    setDetailTenantId(campaignTenantId)
    setDetailOpen(true)
    setDetailError('')
    setDetailCampaign(null)
    setDetailPartCount(0)
    setDetailWinners([])
    setDrawError('')
    setLinkCopied(false)
    setDetailLoading(true)
    try {
      const data = await getCampaign(campaignTenantId, campaign.id)
      setDetailCampaign(data)
      // Participantes y ganadores solo aplican a actividades ya en operación.
      if (['active', 'paused', 'closed', 'archived'].includes(data.status)) {
        loadParticipationData(campaignTenantId, campaign.id)
      }
    } catch {
      setDetailError('No fue posible cargar el detalle de la actividad.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadParticipationData(tenantId, campaignId) {
    setDetailPartLoading(true)
    try {
      const [parts, wins] = await Promise.all([
        getParticipations(tenantId, campaignId, { limit: 1 }).catch(() => ({ total: 0 })),
        getWinners(tenantId, campaignId).catch(() => []),
      ])
      setDetailPartCount(parts.total || 0)
      setDetailWinners(wins || [])
    } finally {
      setDetailPartLoading(false)
    }
  }

  function openParticipants() {
    if (!detailCampaign) return
    navigate(`/campaigns/${detailCampaign.id}/participants`, {
      state: { tenantId: detailTenantId, campaignName: detailCampaign.name },
    })
  }

  async function handleCloseCampaign() {
    if (!detailCampaign) return
    setDrawError('')
    setStatusUpdatingId(detailCampaign.id)
    try {
      await updateCampaignStatus(detailTenantId, detailCampaign.id, { status: 'closed' })
      const data = await getCampaign(detailTenantId, detailCampaign.id)
      setDetailCampaign(data)
      await refreshCurrentList()
    } catch (err) {
      setDrawError(err?.response?.data?.detail || 'No fue posible cerrar la actividad.')
    } finally {
      setStatusUpdatingId(null)
      setCloseConfirm(false)
    }
  }

  async function handleRunDraw() {
    if (!detailCampaign) return
    setDrawError('')
    setDrawLoading(true)
    try {
      const res = await runDraw(detailTenantId, detailCampaign.id)
      setDetailWinners(res.winners || [])
      await loadParticipationData(detailTenantId, detailCampaign.id)
    } catch (err) {
      const detail = err?.response?.data?.detail
      setDrawError(
        detail === 'no_eligible_participations'
          ? 'No hay participaciones elegibles para sortear.'
          : detail || 'No fue posible ejecutar el sorteo.',
      )
    } finally {
      setDrawLoading(false)
    }
  }

  function copyParticipationLink() {
    if (!detailCampaign) return
    const url = `${window.location.origin}/participar/${detailCampaign.id}`
    navigator.clipboard?.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  function closeDetail() {
    setDetailOpen(false)
    setDetailCampaign(null)
  }

  // Opens the full creation wizard pre-populated with the campaign's current
  // data, so editing reuses every step (including prizes and POS) instead of
  // a separate reduced form. Only reachable for draft campaigns (backend
  // _require_draft enforces this too).
  async function openEditWizard(campaign) {
    const tenantId = campaign.tenant_id || detailTenantId
    setDetailOpen(false)
    setFormError('')
    setPosSearch('')
    setWizardClienteSearch('')
    setEditingCampaignId(campaign.id)
    setWizardTenantId(tenantId)
    setWizardTenantName(resolveTenantName(tenantId))

    setBrandsLoading(true)
    setPosLoading(true)
    try {
      const [brandsData, posData] = await Promise.all([
        getBrands(tenantId, { is_active: true }),
        getActivePOS(tenantId),
      ])
      setWizardBrands(Array.isArray(brandsData) ? brandsData : (brandsData.items || []))
      setActivePOS(posData)
    } catch {
      setWizardBrands([])
      setActivePOS([])
    } finally {
      setBrandsLoading(false)
      setPosLoading(false)
    }

    const eligibilityPrizes = campaign.rules?.eligibility?.prizes || []
    const ruleByOrder = Object.fromEntries(eligibilityPrizes.map((rule) => [rule.prize_order, rule]))
    const prizes = (campaign.prizes || []).length
      ? campaign.prizes.map((prize) => ({
          name: prize.name,
          prize_type: prize.prize_type,
          quantity: prize.quantity,
          order: prize.order,
          min_amount: ruleByOrder[prize.order]?.min_amount ?? '',
          max_participations: ruleByOrder[prize.order]?.max_participations ?? '',
        }))
      : [{ name: '', prize_type: 'articulo', quantity: 1, order: 1, min_amount: '', max_participations: '' }]

    setForm({
      name: campaign.name || '',
      description: campaign.description || '',
      activity_type: campaign.activity_type || 'sorteo',
      brand_id: campaign.brand_id || '',
      objective_type: campaign.objective_type || '',
      objective_label: campaign.objective_label || '',
      objective_value: campaign.objective_value ? String(campaign.objective_value) : '',
      starts_at: campaign.starts_at ? campaign.starts_at.slice(0, 16) : '',
      ends_at: campaign.ends_at ? campaign.ends_at.slice(0, 16) : '',
      pos_ids: (campaign.pos || []).map((pos) => pos.id),
      mechanic: 'acumulacion',
      closure_type: campaign.closure_type || 'system',
      prizes,
      terms_text: campaign.terms_text || '',
    })

    setStep(1)
    setModalOpen(true)
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
        No hay un cliente disponible para mostrar las actividades.
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
          <Button onClick={openModal}>Nueva actividad</Button>
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
        emptyMessage="No hay actividades registradas."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={closeWizard}
        title={editingCampaignId ? 'Editar actividad' : 'Nueva actividad'}
        maxWidth="max-w-2xl"
        fixedLayout
        stickyHeader={
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {STEPS.map((label, index) => (
              <div key={label} className="flex shrink-0 items-center gap-2">
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
                  className={`text-xs font-medium ${
                    index <= step ? 'text-v-night' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
                {index < STEPS.length - 1 && (
                  <div className="mx-1 h-px w-6 shrink-0 bg-v-border" />
                )}
              </div>
            ))}
          </div>
        }
        footer={
          <div className="flex justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                step === firstStep ? closeWizard() : setStep(step - 1)
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
                {saving
                  ? (editingCampaignId ? 'Guardando...' : 'Creando...')
                  : (editingCampaignId ? 'Guardar cambios' : 'Confirmar y crear')}
              </Button>
            )}
          </div>
        }
      >

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
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-brand"
                className="text-sm font-medium text-v-night"
              >
                Marca <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              {brandsLoading ? (
                <p className="text-sm text-gray-400">Cargando marcas...</p>
              ) : (
                <select
                  id="campaign-brand"
                  value={form.brand_id}
                  onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                  className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
                >
                  <option value="">Sin marca asignada</option>
                  {wizardBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              )}
              {wizardBrands.length === 0 && !brandsLoading && (
                <p className="text-xs text-gray-400">
                  Este cliente aún no tiene marcas registradas.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-objective-type"
                className="text-sm font-medium text-v-night"
              >
                Objetivo de la actividad <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select
                id="campaign-objective-type"
                value={form.objective_type}
                onChange={(e) =>
                  setForm({ ...form, objective_type: e.target.value, objective_label: '', objective_value: '' })
                }
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              >
                <option value="">Sin objetivo definido</option>
                <option value="venta">Venta</option>
                <option value="rotacion">Rotación</option>
                <option value="otros">Otros</option>
              </select>
            </div>

            {form.objective_type === 'otros' && (
              <Input
                id="campaign-objective-label"
                label="Nombre del objetivo"
                placeholder="Ej: Nuevos clientes, Visitas a punto..."
                value={form.objective_label}
                onChange={(e) => setForm({ ...form, objective_label: e.target.value })}
              />
            )}

            {form.objective_type && (
              <Input
                id="campaign-objective-value"
                label="Valor objetivo"
                inputMode="numeric"
                placeholder="Ej: 20000000"
                value={formatMoneyCO(form.objective_value)}
                onChange={(e) =>
                  setForm({ ...form, objective_value: parseMoneyCO(e.target.value) })
                }
              />
            )}

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
          <div className="flex flex-col gap-3">
            {form.prizes.map((prize, index) => {
              const isMoneyPrize = MONEY_PRIZE_TYPES.includes(prize.prize_type)
              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-v-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Premio {index + 1}
                    </span>
                    {form.prizes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePrize(index)}
                        className="text-xs font-medium text-red-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>

                  {/* Orden + Nombre en una fila */}
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      id={`prize-order-${index}`}
                      type="number"
                      min="1"
                      label="Orden"
                      value={prize.order}
                      onChange={(e) => updatePrize(index, 'order', e.target.value)}
                    />
                    <div className="col-span-3">
                      <Input
                        id={`prize-name-${index}`}
                        label="Nombre del premio"
                        value={prize.name}
                        onChange={(e) => updatePrize(index, 'name', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Tipo + Cantidad/Valor + botón agregar en última fila */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-v-night">Tipo</label>
                      <select
                        value={prize.prize_type}
                        onChange={(e) => updatePrize(index, 'prize_type', e.target.value)}
                        className="w-full rounded-lg border border-v-border bg-v-white px-3 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
                      >
                        {Object.entries(PRIZE_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
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
                        onChange={(e) => updatePrize(index, 'quantity', parseMoneyCO(e.target.value))}
                      />
                    ) : (
                      <Input
                        id={`prize-quantity-${index}`}
                        type="number"
                        min="1"
                        label="Cantidad"
                        value={prize.quantity}
                        onChange={(e) => updatePrize(index, 'quantity', e.target.value)}
                      />
                    )}

                    {/* Botón agregar solo en el último premio */}
                    {index === form.prizes.length - 1 ? (
                      <div className="flex flex-col justify-end">
                        <button
                          type="button"
                          onClick={addPrize}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-v-magenta px-3 py-2.5 text-sm font-medium text-white hover:bg-v-magenta/90 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Agregar
                        </button>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-v-night">
                  Puntos de venta
                </label>
                <div className="flex items-center gap-3">
                {form.pos_ids.length > 0 && (
                  <span className="text-xs text-v-magenta font-medium">
                    {form.pos_ids.length} seleccionado{form.pos_ids.length > 1 ? 's' : ''}
                  </span>
                )}
                {activePOS.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = activePOS.every((pos) => form.pos_ids.includes(pos.id))
                      setForm({
                        ...form,
                        pos_ids: allSelected ? [] : activePOS.map((pos) => pos.id),
                      })
                    }}
                    className="text-xs font-medium text-gray-400 hover:text-v-magenta transition-colors"
                  >
                    {activePOS.every((pos) => form.pos_ids.includes(pos.id))
                      ? 'Deseleccionar todos'
                      : 'Seleccionar todos'}
                  </button>
                )}
              </div>
              </div>

              {posLoading ? (
                <p className="text-sm text-gray-400">Cargando POS activos...</p>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Buscar punto de venta..."
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-v-magenta"
                  />
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-v-border bg-v-white p-2">
                    {activePOS
                      .filter((pos) =>
                        `${pos.name} ${pos.nit_emisor ?? ''}`
                          .toLowerCase()
                          .includes(posSearch.toLowerCase())
                      )
                      .map((pos) => {
                        const selected = form.pos_ids.includes(pos.id)
                        return (
                          <label
                            key={pos.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                              selected ? 'bg-v-magenta/10 text-v-night' : 'hover:bg-v-gray-50 text-v-night'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const ids = selected
                                  ? form.pos_ids.filter((id) => id !== pos.id)
                                  : [...form.pos_ids, pos.id]
                                setForm({ ...form, pos_ids: ids })
                              }}
                              className="h-4 w-4 accent-v-magenta"
                            />
                            <span className="flex-1 truncate">{pos.name}</span>
                            {pos.nit_emisor && (
                              <span className="shrink-0 text-xs text-gray-400">{pos.nit_emisor}</span>
                            )}
                          </label>
                        )
                      })}
                    {activePOS.filter((pos) =>
                      `${pos.name} ${pos.nit_emisor ?? ''}`
                        .toLowerCase()
                        .includes(posSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">
                        No se encontraron puntos de venta.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-mechanic"
                className="text-sm font-medium text-v-night"
              >
                Mecánica
              </label>
              <select
                id="campaign-mechanic"
                value={form.mechanic}
                onChange={(e) => setForm({ ...form, mechanic: e.target.value })}
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              >
                <option value="acumulacion">Acumulación de factura</option>
              </select>
              <p className="text-xs text-gray-400">
                Única mecánica disponible en el MVP: el consumidor acumula el
                monto de sus facturas válidas.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="campaign-closure-type"
                className="text-sm font-medium text-v-night"
              >
                Tipo de cierre
              </label>
              <select
                id="campaign-closure-type"
                value={form.closure_type}
                onChange={(e) => setForm({ ...form, closure_type: e.target.value })}
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
              >
                <option value="system">Sistema (automático)</option>
                <option value="external">Externo / notarial (manual)</option>
              </select>
              <p className="text-xs text-gray-400">
                Sistema: Validia ejecuta el sorteo automáticamente. Externo: un
                notario u otra entidad conduce el sorteo y los ganadores se
                ingresan manualmente.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            {(() => {
              const validPrizeIndices = form.prizes
                .map((prize, index) => ({ prize, index }))
                .filter(({ prize }) => prize.name.trim())

              if (validPrizeIndices.length === 0) {
                return (
                  <p className="text-sm text-gray-400">
                    Agrega al menos un premio en el paso anterior para
                    definir sus reglas de participación.
                  </p>
                )
              }

              const multiplePrizes = validPrizeIndices.length > 1

              return validPrizeIndices.map(({ prize, index }) => (
                <div
                  key={index}
                  className={
                    multiplePrizes
                      ? 'flex flex-col gap-3 rounded-lg border border-v-border p-4'
                      : 'flex flex-col gap-3'
                  }
                >
                  {multiplePrizes && (
                    <span className="text-sm font-medium text-v-night">
                      {prize.name} (orden {prize.order})
                    </span>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id={`prize-min-amount-${index}`}
                      label="Monto mínimo (umbral)"
                      inputMode="numeric"
                      placeholder="100.000"
                      value={formatMoneyCO(prize.min_amount)}
                      onChange={(e) =>
                        updatePrize(index, 'min_amount', parseMoneyCO(e.target.value))
                      }
                    />
                    <Input
                      id={`prize-max-participations-${index}`}
                      type="number"
                      min="1"
                      label="Cantidad de participaciones (tope)"
                      value={prize.max_participations}
                      onChange={(e) =>
                        updatePrize(index, 'max_participations', e.target.value)
                      }
                    />
                  </div>
                </div>
              ))
            })()}
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-v-night">
                Términos y condiciones
              </label>
              <p className="mb-2 text-xs text-gray-400">
                No es obligatorio para crear la actividad, pero sí para
                activarla. Puedes completarlo ahora o más adelante desde el
                detalle de la actividad.
              </p>
              <textarea
                rows={10}
                value={form.terms_text}
                onChange={(e) =>
                  setForm({ ...form, terms_text: e.target.value })
                }
                placeholder="Términos y condiciones de la actividad..."
                className="w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-v-magenta"
              />
            </div>
          </div>
        )}

        {step === 6 && (
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
              <p className="text-xs text-gray-400">Mecánica</p>
              <p>Acumulación de factura</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Premios y reglas de participación</p>
              <ul className="mt-1 list-inside list-disc">
                {form.prizes
                  .filter((prize) => prize.name.trim())
                  .map((prize, index) => (
                    <li key={index}>
                      {prize.name} (orden {prize.order}) — {PRIZE_TYPE_LABELS[prize.prize_type]}{' '}
                      {MONEY_PRIZE_TYPES.includes(prize.prize_type)
                        ? `— $${formatMoneyCO(prize.quantity)}`
                        : `x ${prize.quantity}`}
                      {prize.min_amount
                        ? ` · Mínimo $${formatMoneyCO(prize.min_amount)} · Tope ${prize.max_participations || '—'}`
                        : ' · Sin regla de participación definida'}
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-gray-400">Términos y condiciones</p>
              <p>
                {form.terms_text.trim()
                  ? 'Definidos'
                  : 'Sin definir — no podrás activar la actividad hasta agregarlos'}
              </p>
            </div>
          </div>
        )}

        {formError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {formError}
          </p>
        )}
      </Modal>

      <Modal
        isOpen={detailOpen}
        onClose={closeDetail}
        title="Detalle de actividad"
        maxWidth="max-w-2xl"
      >
        {detailLoading ? (
          <Spinner className="py-10" />
        ) : detailError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {detailError}
          </p>
        ) : !detailCampaign ? null : (
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
              <p className="text-xs text-gray-400">Mecánica</p>
              <p className="mt-1 text-v-night">
                {detailCampaign.participation_method === 'acumulacion'
                  ? 'Acumulación de factura'
                  : detailCampaign.participation_method || '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Tipo de cierre</p>
              <p className="mt-1 text-v-night">
                {detailCampaign.closure_type === 'system'
                  ? 'Sistema (automático)'
                  : detailCampaign.closure_type === 'external'
                  ? 'Externo / notarial (manual)'
                  : '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Premios</p>
              {detailCampaign.prizes?.length ? (
                <ul className="mt-1 list-inside list-disc">
                  {detailCampaign.prizes.map((prize) => (
                    <li key={prize.id}>
                      {prize.name} (orden {prize.order}) — {PRIZE_TYPE_LABELS[prize.prize_type] || prize.prize_type}{' '}
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

            <div>
              <p className="text-xs text-gray-400">Reglas de participación</p>
              {detailCampaign.prizes?.length ? (
                <ul className="mt-1 list-inside list-disc">
                  {detailCampaign.prizes.map((prize) => {
                    const rule = (detailCampaign.rules?.eligibility?.prizes || []).find(
                      (r) => r.prize_order === prize.order,
                    )
                    return (
                      <li key={prize.id}>
                        {prize.name}:{' '}
                        {rule
                          ? `mínimo $${formatMoneyCO(rule.min_amount)} · tope ${rule.max_participations}`
                          : 'Sin regla configurada'}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-gray-400">Sin premios asociados.</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">Términos y condiciones</p>
              <p>
                {detailCampaign.terms_text?.trim()
                  ? 'Definidos'
                  : 'Sin definir — no se puede activar hasta agregarlos'}
              </p>
            </div>

            {/* Link de participación — para compartir con los participantes */}
            {detailCampaign.status === 'active' && (
              <div>
                <p className="text-xs text-gray-400">Link de participación</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-v-gray-50 px-2 py-1 text-xs text-v-night">
                    {`${window.location.origin}/participar/${detailCampaign.id}`}
                  </code>
                  <Button type="button" variant="secondary" onClick={copyParticipationLink} className="!px-3 !py-1 text-xs">
                    {linkCopied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Participantes — resumen; el detalle vive en su propia vista */}
            {['active', 'paused', 'closed', 'archived'].includes(detailCampaign.status) && (
              <div>
                <p className="text-xs text-gray-400">Participantes</p>
                <p className="mt-1 text-sm">
                  {detailPartLoading
                    ? 'Cargando...'
                    : `${detailPartCount} participación(es) registrada(s)`}
                </p>
              </div>
            )}

            {/* Ganadores */}
            {detailWinners.length > 0 && (
              <div>
                <p className="text-xs text-gray-400">Ganadores</p>
                <ul className="mt-1 space-y-1">
                  {detailWinners.map((w, i) => (
                    <li key={`${w.participant_id}-${i}`} className="rounded-lg bg-v-magenta/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-v-magenta">{w.prize}</span> — {w.participant_name || 'Sin nombre'} (CC {w.cedula}), {w.tickets} boleta(s)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {drawError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{drawError}</p>
            )}

            <div className="mt-2 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={closeDetail}>
                Cerrar
              </Button>
              {['active', 'paused', 'closed', 'archived'].includes(detailCampaign.status) && (
                <Button type="button" variant="secondary" onClick={openParticipants}>
                  Participantes
                </Button>
              )}
              {detailCampaign.status === 'draft' && (
                <Button type="button" onClick={() => openEditWizard(detailCampaign)}>
                  Editar actividad
                </Button>
              )}
              {['active', 'paused'].includes(detailCampaign.status) && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={statusUpdatingId === detailCampaign.id}
                  onClick={() => setCloseConfirm(true)}
                >
                  Cerrar actividad
                </Button>
              )}
              {detailCampaign.status === 'closed' && detailWinners.length === 0 && (
                <Button type="button" disabled={drawLoading} onClick={handleRunDraw}>
                  {drawLoading ? 'Sorteando...' : 'Ejecutar sorteo'}
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
          message={`¿Estás seguro de que deseas activar "${confirmCampaign.name}"? Una vez activa, los participantes podrán registrarse.`}
          onCancel={() => setConfirmCampaign(null)}
          onConfirm={confirmActivate}
          confirming={statusUpdatingId === confirmCampaign.id}
        />
      )}

      {closeConfirm && detailCampaign && (
        <ConfirmModal
          isOpen={closeConfirm}
          title="Cerrar actividad"
          message={`¿Cerrar "${detailCampaign.name}"? No se recibirán más participaciones y quedará lista para ejecutar el sorteo. Esta acción no se puede revertir.`}
          onCancel={() => setCloseConfirm(false)}
          onConfirm={handleCloseCampaign}
          confirming={statusUpdatingId === detailCampaign.id}
        />
      )}

      {activationMissing.length > 0 && (
        <Modal
          isOpen={activationMissing.length > 0}
          onClose={() => setActivationMissing([])}
          title="Requisitos para activar"
          maxWidth="max-w-sm"
        >
          <p className="mb-4 text-sm text-gray-500">
            Completa los siguientes campos antes de poder activar la actividad:
          </p>
          <ul className="space-y-2 mb-6">
            {activationMissing.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-red-600">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={() => setActivationMissing([])}>Entendido</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
