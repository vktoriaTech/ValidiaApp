import api from './api'

export async function getProducts(tenantId, brandId) {
  const { data } = await api.get(`/api/v1/tenants/${tenantId}/brands/${brandId}/products`)
  return data
}

export async function createProduct(tenantId, brandId, payload) {
  const { data } = await api.post(`/api/v1/tenants/${tenantId}/brands/${brandId}/products`, payload)
  return data
}

export async function updateProduct(tenantId, brandId, productId, payload) {
  const { data } = await api.put(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}`,
    payload,
  )
  return data
}

export async function deleteProduct(tenantId, brandId, productId) {
  await api.delete(`/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}`)
}

export async function getSKUs(tenantId, brandId, productId) {
  const { data } = await api.get(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}/skus`,
  )
  return data
}

export async function createSKU(tenantId, brandId, productId, payload) {
  const { data } = await api.post(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}/skus`,
    payload,
  )
  return data
}

export async function updateSKU(tenantId, brandId, productId, skuId, payload) {
  const { data } = await api.put(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}/skus/${skuId}`,
    payload,
  )
  return data
}

export async function deleteSKU(tenantId, brandId, productId, skuId) {
  await api.delete(
    `/api/v1/tenants/${tenantId}/brands/${brandId}/products/${productId}/skus/${skuId}`,
  )
}
