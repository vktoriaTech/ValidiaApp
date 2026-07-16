import api from './api'

export async function login(email, password) {
  const { data } = await api.post('/api/v1/auth/login', { email, password })
  return data
}

export async function logout() {
  const { data } = await api.post('/api/v1/auth/logout')
  return data
}

export async function getMe() {
  const { data } = await api.get('/api/v1/auth/me')
  return data
}
