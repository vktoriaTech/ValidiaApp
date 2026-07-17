import api from './api'

export async function getCampaigns(tenantId, params = {}) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/campaigns`, { params })
  return data
}

export async function getCampaign(tenantId, id) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/campaigns/${id}`)
  return data
}

export async function createCampaign(tenantId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/campaigns`, payload)
  return data
}

export async function updateCampaign(tenantId, id, payload) {
  const { data } = await api.put(
    `/api/v1/tenants/${tenantId}/campaigns/${id}`,
    payload,
  )
  return data
}

export async function updateCampaignStatus(tenantId, id, payload) {
  const { data } = await api.patch(
    `/api/v1/tenants/${tenantId}/campaigns/${id}/status`,
    payload,
  )
  return data
}
