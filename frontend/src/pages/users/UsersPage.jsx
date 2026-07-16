import { useActiveTenant } from '../../hooks/useActiveTenant'
import UsersManager from '../../components/users/UsersManager'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

export default function UsersPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  if (isSuperAdmin && tenantLoading) {
    return <p className="text-sm text-gray-500">Cargando clientes...</p>
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un cliente disponible para mostrar los usuarios.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">Gestiona los usuarios del cliente.</p>
      <UsersManager
        tenantId={tenantId}
        extraHeader={
          isSuperAdmin && (
            <TenantSwitcher
              tenants={tenants}
              tenantId={tenantId}
              onChange={setTenantId}
            />
          )
        }
      />
    </div>
  )
}
