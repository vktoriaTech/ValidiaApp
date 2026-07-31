import api from './api'

export async function getBrands(tenantId, params = {}) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/brands`, { params })
  return data
}

export async function createBrand(tenantId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/brands`, payload)
  return data
}

export async function updateBrand(tenantId, brandId, payload) {
  const { data } = await api.put(`/api/v1/tenants/${tenantId}/brands/${brandId}`, payload)
  return data
}

export async function deactivateBrand(tenantId, brandId) {
  await api.delete(`/api/v1/tenants/${tenantId}/brands/${brandId}`)
}

export async function getBrandCategories(tenantId, brandId) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/brands/${brandId}/categories`)
  return data
}

export async function createBrandCategory(tenantId, brandId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/brands/${brandId}/categories`, payload)
  return data
}

export async function updateBrandCategory(tenantId, brandId, categoryId, payload) {
  const { data } = await api.put(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/categories/${categoryId}`,
    payload,
  )
  return data
}

export async function deleteBrandCategory(tenantId, brandId, categoryId) {
  await api.delete(`/api/v1/tenants/${tenantId}/brands/${brandId}/categories/${categoryId}`)
}
