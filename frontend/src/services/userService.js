import api from './api'

export async function getUsers(tenantId, params = {}) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/users`, { params })
  return data
}

export async function createUser(tenantId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/users`, payload)
  return data
}

export async function updateUser(tenantId, userId, payload) {
  const { data } = await api.put(
    `/api/v1/tenants/${tenantId}/users/${userId}`,
    payload,
  )
  return data
}

export async function updateUserStatus(tenantId, id, payload) {
  const { data } = await api.patch(
    `/api/v1/tenants/${tenantId}/users/${id}/status`,
    payload,
  )
  return data
}
