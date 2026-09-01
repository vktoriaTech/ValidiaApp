import { useEffect, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { getParticipations, exportParticipations } from '../../services/participacionAdminService'
import Button from '../../components/ui/Button'

const LIMIT = 50

function fmtMoney(v) {
  if (v == null || v === '') return '—'
  return `$${Number(v).toLocaleString('es-CO')}`
}
function fmtDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('es-CO')
}
function fmtDateTime(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-CO')
}

export default function ParticipantsPage() {
  const { campaignId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const authTenant = useAuthStore((s) => s.tenant)

  // El tenant y el nombre llegan por navegación desde el detalle; si se entra
  // por URL directa, se usa el tenant de la sesión (admin de un solo cliente).
  const tenantId = location.state?.tenantId || authTenant?.id
  const campaignName = location.state?.campaignName || 'Actividad'

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!tenantId) {
      setError('No se pudo determinar el cliente de la actividad.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getParticipations(tenantId, campaignId, { page, limit: LIMIT, search })
      setRows(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      setError('No fue posible cargar los participantes.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, campaignId, page, search])

  useEffect(() => {
    load()
  }, [load])

  function submitSearch(e) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportParticipations(tenantId, campaignId, search)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `participantes-${campaignName.replace(/\s+/g, '_')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('No fue posible exportar el Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-v-magenta hover:underline">
            ← Volver
          </button>
          <h1 className="text-xl font-semibold text-v-night">Participantes — {campaignName}</h1>
          <p className="text-sm text-gray-500">{total} participación(es) registrada(s)</p>
        </div>
        <Button onClick={handleExport} disabled={exporting || total === 0}>
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </Button>
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por cédula, nombre, celular, CUFE o NIT..."
          className="w-full max-w-md rounded-lg border border-v-border px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-magenta"
        />
        <Button type="submit" variant="secondary">Buscar</Button>
        {search && (
          <Button type="button" variant="secondary" onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}>
            Limpiar
          </Button>
        )}
      </form>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-v-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-v-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Cédula</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Celular</th>
              <th className="px-3 py-2">Correo</th>
              <th className="px-3 py-2">CUFE</th>
              <th className="px-3 py-2 text-right">Monto factura</th>
              <th className="px-3 py-2">Fecha factura</th>
              <th className="px-3 py-2">NIT POS</th>
              <th className="px-3 py-2 text-right">Boletas</th>
              <th className="px-3 py-2 text-right">Acumulado</th>
              <th className="px-3 py-2 text-center">Elegible</th>
              <th className="px-3 py-2 text-center">Ganador</th>
              <th className="px-3 py-2">Participó</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">Sin participantes.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-v-border hover:bg-v-gray-50">
                  <td className="px-3 py-2">{r.participant_cedula}</td>
                  <td className="px-3 py-2">{r.participant_name || '—'}</td>
                  <td className="px-3 py-2">{r.participant_phone || '—'}</td>
                  <td className="px-3 py-2">{r.participant_email || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs" title={r.invoice_cufe}>{r.invoice_cufe?.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.invoice_amount)}</td>
                  <td className="px-3 py-2">{fmtDate(r.invoice_date)}</td>
                  <td className="px-3 py-2">{r.pos_nit || '—'}</td>
                  <td className="px-3 py-2 text-right">{r.tickets}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.accumulated_total)}</td>
                  <td className="px-3 py-2 text-center">{r.eligible ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2 text-center">{r.is_winner ? '🏆' : ''}</td>
                  <td className="px-3 py-2">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-gray-500">Página {page} de {pages}</span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
