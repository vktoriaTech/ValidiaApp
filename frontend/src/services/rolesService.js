const STORAGE_KEY = 'validia-roles'

// super_admin queda fuera a propósito: un tenant_admin no puede asignar ese rol.
const DEFAULT_ROLES = [
  {
    value: 'tenant_admin',
    label: 'Administrador',
    description: 'Administrador de cliente',
    permissions: 'Gestión de su organización',
  },
  {
    value: 'tenant_viewer',
    label: 'Visualizador',
    description: 'Visualizador',
    permissions: 'Solo lectura',
  },
  {
    value: 'vendor',
    label: 'Vendedor',
    description: 'Vendedor',
    permissions: 'Acceso a campañas asignadas',
  },
  {
    value: 'mercaderista',
    label: 'Mercaderista',
    description: 'Mercaderista',
    permissions: 'Ejecución en PDV',
  },
]

export function saveRoles(roles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roles))
}

export function getRoles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      saveRoles(DEFAULT_ROLES)
      return DEFAULT_ROLES
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_ROLES
  } catch {
    return DEFAULT_ROLES
  }
}
