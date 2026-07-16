import api from './api'

export async function getPOS(tenantId, params = {}) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/pos`, { params })
  return data
}

export async function getActivePOS(tenantId) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/pos/active`)
  return data
}

export async function createPOS(tenantId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/pos`, payload)
  return data
}

export async function updatePOSStatus(tenantId, id, payload) {
  const { data } = await api.patch(
    `/api/v1/tenants/${tenantId}/pos/${id}/status`,
    payload,
  )
  return data
}
