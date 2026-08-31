import axios from 'axios'

// Cliente público, sin el interceptor de auth de api.js (que redirige a
// /login ante un 401). La página de participación la usan personas sin sesión.
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

export async function getPublicCampaign(campaignId) {
  const { data } = await publicApi.get(`/api/v1/campaigns/${campaignId}/public`)
  return data
}

export async function acceptTerms(campaignId, payload) {
  const { data } = await publicApi.post(
    `/api/v1/campaigns/${campaignId}/terms/accept`,
    payload,
  )
  return data
}

// Flujo reutilizable (mismo endpoint que usará el bot de WhatsApp):
// foto(s) + cédula → OCR → validar DIAN → participar → resultado.
export async function participateByImage(campaignId, { cedula, fullName, phone, files }) {
  const form = new FormData()
  form.append('cedula', cedula)
  if (fullName) form.append('full_name', fullName)
  if (phone) form.append('phone_wa', phone)
  form.append('channel', 'web')
  files.forEach((file) => form.append('files', file))
  const { data } = await publicApi.post(
    `/api/v1/campaigns/${campaignId}/participate-by-image`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
