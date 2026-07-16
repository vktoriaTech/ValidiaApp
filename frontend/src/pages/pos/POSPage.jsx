import { useActiveTenant } from '../../hooks/useActiveTenant'
import POSManager from '../../components/pos/POSManager'
import TenantSwitcher from '../../components/layout/TenantSwitcher'

export default function POSPage() {
  const { tenantId, tenants, setTenantId, isSuperAdmin, loading: tenantLoading } =
    useActiveTenant()

  if (isSuperAdmin && tenantLoading) {
    return <p className="text-sm text-gray-500">Cargando clientes...</p>
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-500">
        No hay un cliente disponible para mostrar los puntos de venta.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Gestiona los puntos de venta del cliente.
      </p>
      <POSManager
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
