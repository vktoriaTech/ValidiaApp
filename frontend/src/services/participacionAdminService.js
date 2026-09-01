import api from './api'

// Endpoints admin (autenticados) del motor de participación — SPEC-04B §6.2–6.4.

export async function getParticipations(tenantId, campaignId, eligible) {
  const params = eligible === undefined ? {} : { eligible }
  const { data } = await api.get(
    `/api/v1/tenants/${tenantId}/campaigns/${campaignId}/participations`,
    { params },
  )
  return data
}

export async function runDraw(tenantId, campaignId) {
  const { data } = await api.post(
    `/api/v1/tenants/${tenantId}/campaigns/${campaignId}/draw`,
    {},
  )
  return data
}

export async function getWinners(tenantId, campaignId) {
  const { data } = await api.get(
    `/api/v1/tenants/${tenantId}/campaigns/${campaignId}/winners`,
  )
  return data
}
