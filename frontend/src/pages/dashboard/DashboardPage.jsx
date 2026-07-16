import { useEffect, useState } from 'react'
import { useActiveTenant } from '../../hooks/useActiveTenant'
import { getCampaigns } from '../../services/campaignService'
import { getPOS } from '../../services/posService'
import { getUsers } from '../../services/userService'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

// No existe todavía un endpoint /api/v1/cufe/stats en el backend, así que
// este KPI se muestra con datos de ejemplo hasta que se implemente.
const MOCK_INVOICES_VALIDATED = 3092

export default function DashboardPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  const [kpis, setKpis] = useState({
    activeCampaigns: null,
    activePOS: null,
    activeUsers: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tenantId) return
    let active = true
    setLoading(true)
    setError('')

    Promise.all([
      getCampaigns(tenantId, { status: 'active', page: 1, limit: 1 }),
      getPOS(tenantId, { is_active: true, page: 1, limit: 1 }),
      getUsers(tenantId, { is_active: true, page: 1, limit: 1 }),
    ])
      .then(([campaigns, pos, users]) => {
        if (!active) return
        setKpis({
          activeCampaigns: campaigns.total,
          activePOS: pos.total,
          activeUsers: users.total,
        })
      })
      .catch(() => {
        if (active) setError('No fue posible cargar las métricas del dashboard.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [tenantId])

  const cards = [
    {
      label: 'Campañas activas',
      value: kpis.activeCampaigns,
    },
    {
      label: 'POS activos',
      value: kpis.activePOS,
    },
    {
      label: 'Usuarios activos',
      value: kpis.activeUsers,
    },
    {
      label: 'Facturas validadas',
      value: MOCK_INVOICES_VALIDATED,
      mock: true,
    },
  ]

  if (isSuperAdmin && tenantLoading) {
    return <p className="text-sm text-gray-500">Cargando clientes...</p>
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un cliente disponible para mostrar el dashboard.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {isSuperAdmin && (
        <div className="flex justify-end">
          <TenantSwitcher
            tenants={tenants}
            tenantId={tenantId}
            onChange={setTenantId}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
            {loading && kpi.value === null ? (
              <Spinner className="mt-3 justify-start" size="h-5 w-5" />
            ) : (
              <p className="mt-2 text-3xl font-bold text-v-magenta">
                {kpi.value?.toLocaleString('es-CO') ?? '—'}
              </p>
            )}
            {kpi.mock && (
              <p className="mt-1 text-xs text-gray-400">Datos de ejemplo</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
