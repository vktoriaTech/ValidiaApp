import api from './api'

// Endpoints admin (autenticados) del motor de participación — SPEC-04B §6.2–6.4
// y SPEC-04B-B (vista de participantes paginada + export).

export async function getParticipations(tenantId, campaignId, { page = 1, limit = 50, search = '' } = {}) {
  const params = { page, limit }
  if (search) params.search = search
  const { data } = await api.get(
    `/api/v1/tenants/${tenantId}/campaigns/${campaignId}/participations`,
    { params },
  )
  return data // { items, total, page, pages }
}

export async function exportParticipations(tenantId, campaignId, search = '') {
  const params = search ? { search } : {}
  const res = await api.get(
    `/api/v1/tenants/${tenantId}/campaigns/${campaignId}/participations/export`,
    { params, responseType: 'blob' },
  )
  return res.data // Blob (xlsx)
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
