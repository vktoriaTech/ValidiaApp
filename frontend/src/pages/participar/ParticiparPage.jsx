import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getPublicCampaign,
  acceptTerms,
  participateByImage,
} from '../../services/participacionService'

const CHANNEL = 'web'

const REASON_MESSAGES = {
  pos_not_eligible: 'La factura no es de un establecimiento que participa en esta actividad.',
  invoice_date_out_of_range: 'La fecha de la factura está fuera del periodo de la actividad.',
  terms_not_accepted: 'Debes aceptar los términos antes de participar.',
  invoice_amount_below_minimum: 'La compra aún no alcanza el monto mínimo para participar.',
}

// El detalle del backend puede ser un string (errores de OCR) o un objeto
// {reason: ...} (rechazos de reglas). Se normaliza a un mensaje legible para
// no romper el render (React no puede pintar un objeto).
function errorMessage(err, fallback) {
  const d = err?.response?.data?.detail
  if (typeof d === 'string') return d
  if (d && typeof d === 'object' && d.reason) {
    return REASON_MESSAGES[d.reason] || 'No pudimos validar tu factura para esta actividad.'
  }
  return fallback
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  )
}

export default function ParticiparPage() {
  const { campaignId } = useParams()

  const [phase, setPhase] = useState('loading') // loading|closed|identity|upload|result|error
  const [campaign, setCampaign] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Identidad — solo cédula (el resto sale de la factura / del canal)
  const [cedula, setCedula] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const [files, setFiles] = useState([])
  const [result, setResult] = useState(null)

  useEffect(() => {
    getPublicCampaign(campaignId)
      .then((c) => {
        setCampaign(c)
        setPhase(c.status === 'active' ? 'identity' : 'closed')
      })
      .catch(() => setPhase('error'))
  }, [campaignId])

  async function submitIdentity(e) {
    e.preventDefault()
    setError('')
    if (!cedula.trim()) {
      setError('Ingresa tu cédula.')
      return
    }
    if (!acceptedTerms) {
      setError('Debes aceptar los términos y condiciones.')
      return
    }
    setBusy(true)
    try {
      await acceptTerms(campaignId, { cedula: cedula.trim(), channel: CHANNEL })
      setPhase('upload')
    } catch (err) {
      setError(errorMessage(err, 'No fue posible registrar tu aceptación.'))
    } finally {
      setBusy(false)
    }
  }

  async function submitPhotos(e) {
    e.preventDefault()
    setError('')
    if (files.length === 0) {
      setError('Sube al menos una foto de tu factura.')
      return
    }
    setBusy(true)
    try {
      const data = await participateByImage(campaignId, { cedula: cedula.trim(), files })
      setResult(data)
      setPhase('result')
    } catch (err) {
      // OCR falló o factura inválida — se pide reenviar (se queda en 'upload').
      setError(errorMessage(err, 'No pudimos procesar la factura. Intenta con una foto más nítida.'))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFiles([])
    setResult(null)
    setError('')
    setPhase('upload')
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-10 w-10">
              <polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5" fill="#FF0080" />
              <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="800" fill="#FFF" fontFamily="sans-serif">VK</text>
            </svg>
          </div>
          <span className="text-lg font-extrabold tracking-wide">VKTORIA</span>
        </div>

        {phase === 'loading' && <p className="text-white/60">Cargando actividad...</p>}

        {phase === 'error' && (
          <div className="rounded-xl bg-white/5 p-6">
            <p className="text-lg font-semibold">Actividad no encontrada</p>
            <p className="mt-1 text-sm text-white/60">Verifica el enlace e intenta de nuevo.</p>
          </div>
        )}

        {phase === 'closed' && campaign && (
          <div className="rounded-xl bg-white/5 p-6">
            <p className="text-lg font-semibold">{campaign.name}</p>
            <p className="mt-1 text-sm text-white/60">
              Esta actividad no está recibiendo participaciones en este momento.
            </p>
          </div>
        )}

        {campaign && ['identity', 'upload', 'result'].includes(phase) && (
          <>
            <h1 className="mb-1 text-2xl font-bold">{campaign.name}</h1>
            <p className="mb-6 text-sm text-white/50">Participa con tu factura de compra</p>

            {error && (
              <p className="mb-4 rounded-lg bg-[#FF0080]/15 px-3 py-2 text-sm text-[#FF8DC4]">{error}</p>
            )}

            {/* Paso 1 — Cédula + aceptación de T&C */}
            {phase === 'identity' && (
              <form onSubmit={submitIdentity} className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/40">Cédula</span>
                  <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric"
                    className="v-input" placeholder="Tu número de cédula" />
                </label>

                {campaign.terms_text && (
                  <div className="max-h-32 overflow-y-auto rounded-lg bg-white/5 p-3 text-xs text-white/60">
                    {campaign.terms_text}
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#FF0080]" />
                  Acepto los términos y condiciones de la actividad.
                </label>

                <SubmitButton busy={busy}>Continuar</SubmitButton>
              </form>
            )}

            {/* Paso 2 — Subir foto(s) de la factura */}
            {phase === 'upload' && (
              <form onSubmit={submitPhotos} className="space-y-4">
                <p className="text-sm text-white/70">
                  Toma 1 o 2 fotos de tu factura donde se vean claramente el <b>CUFE</b> y el <b>NIT</b> del emisor.
                </p>
                <input
                  type="file" accept="image/*" capture="environment" multiple
                  onChange={(e) => setFiles(Array.from(e.target.files).slice(0, 2))}
                  className="block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF0080] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                {files.length > 0 && (
                  <p className="text-xs text-white/50">{files.length} foto(s) seleccionada(s)</p>
                )}
                <SubmitButton busy={busy}>
                  {busy ? 'Procesando factura (hasta 1 min)...' : 'Participar'}
                </SubmitButton>
                <p className="text-center text-xs text-white/30">
                  Leemos tu factura y la validamos ante la DIAN automáticamente.
                </p>
              </form>
            )}

            {/* Paso 3 — Resultado */}
            {phase === 'result' && result && (
              <div className="rounded-xl bg-white/5 p-6 text-center">
                {result.eligible ? (
                  <>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF0080]">
                      <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-xl font-bold">¡Estás participando!</p>
                    <p className="mt-2 text-sm text-white/70">
                      Boletas de esta factura: <b>{result.tickets_earned}</b>
                    </p>
                    <p className="text-sm text-white/70">
                      Boletas totales acumuladas: <b>{result.tickets_total}</b>
                    </p>
                    {result.accumulated_total != null && (
                      <p className="text-sm text-white/50">
                        Monto acumulado: ${Number(result.accumulated_total).toLocaleString('es-CO')}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">Factura registrada</p>
                    <p className="mt-2 text-sm text-white/60">
                      Tu compra aún no alcanza el monto mínimo para generar boletas. ¡Sigue participando!
                    </p>
                  </>
                )}
                <button onClick={reset}
                  className="mt-6 w-full rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5">
                  Registrar otra factura
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-xs text-white/30">Powered by VKTORIA</p>
      </div>

      <style>{`
        .v-input {
          width: 100%;
          border-radius: 0.5rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 0.6rem 0.75rem;
          color: white;
          outline: none;
        }
        .v-input:focus { border-color: #FF0080; }
        .v-input::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>
    </div>
  )
}

function SubmitButton({ busy, children }) {
  return (
    <button type="submit" disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF0080] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#FF0080]/90 disabled:opacity-60">
      {busy && <Spinner />}
      {children}
    </button>
  )
}
