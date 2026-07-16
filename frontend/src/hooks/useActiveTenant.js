import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { getTenants } from '../services/tenantService'

export function useActiveTenant() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [tenantId, setTenantId] = useState(user?.tenant_id ?? null)
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(isSuperAdmin && !user?.tenant_id)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSuperAdmin) return
    let active = true
    setLoading(true)
    setError('')
    getTenants({ page: 1, limit: 100 })
      .then((data) => {
        if (!active) return
        setTenants(data.items || [])
        setTenantId((current) => current ?? data.items?.[0]?.id ?? null)
      })
      .catch(() => {
        if (active) setError('No fue posible cargar la lista de clientes.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isSuperAdmin])

  return { tenantId, setTenantId, tenants, isSuperAdmin, loading, error }
}
