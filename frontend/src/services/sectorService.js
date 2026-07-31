import api from './api'

export async function getSectors(params = {}) {
  const { data } = await api.get('/api/v1/sectors', { params })
  return data
}

export async function createSector(payload) {
  const { data } = await api.post('/api/v1/sectors', payload)
  return data
}

export async function updateSector(id, payload) {
  const { data } = await api.put(`/api/v1/sectors/${id}`, payload)
  return data
}

export async function deleteSector(id) {
  await api.delete(`/api/v1/sectors/${id}`)
}
