import api from './api'

export async function getTenants(params = {}) {
  const { data } = await api.get('/api/v1/tenants', { params })
  return data
}

export async function getTenant(id) {
  const { data } = await api.get(`/api/v1/tenants/${id}`)
  return data
}

export async function createTenant(payload) {
  const { data } = await api.post('/api/v1/tenants', payload)
  return data
}

export async function updateTenant(id, payload) {
  const { data } = await api.put(`/api/v1/tenants/${id}`, payload)
  return data
}

export async function updateTenantStatus(id, payload) {
  const { data } = await api.patch(`/api/v1/tenants/${id}/status`, payload)
  return data
}
