const STORAGE_KEY = 'validia-roles'

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

export const AVAILABLE_PERMISSIONS = [
  { value: 'ver_dashboard', label: 'Ver dashboard' },
  { value: 'gestionar_clientes', label: 'Gestionar clientes' },
  { value: 'gestionar_campañas', label: 'Gestionar campañas' },
  { value: 'gestionar_pos', label: 'Gestionar POS' },
  { value: 'gestionar_usuarios', label: 'Gestionar usuarios' },
  { value: 'ver_reportes', label: 'Ver reportes' },
  { value: 'exportar_datos', label: 'Exportar datos' },
  { value: 'configuracion', label: 'Configuración' },
]

// super_admin queda fuera a propósito: un tenant_admin no puede asignar ese rol.
const DEFAULT_ROLES = [
  {
    id: 'role-tenant-admin',
    value: 'tenant_admin',
    label: 'Administrador',
    description: 'Administrador de cliente',
    permissions: [
      'gestionar_campañas',
      'gestionar_pos',
      'gestionar_usuarios',
      'ver_reportes',
      'exportar_datos',
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'role-tenant-viewer',
    value: 'tenant_viewer',
    label: 'Visualizador',
    description: 'Solo lectura',
    permissions: ['ver_dashboard', 'ver_reportes'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'role-vendor',
    value: 'vendor',
    label: 'Vendedor',
    description: 'Acceso a campañas asignadas',
    permissions: ['ver_dashboard'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'role-mercaderista',
    value: 'mercaderista',
    label: 'Mercaderista',
    description: 'Ejecución en PDV',
    permissions: ['ver_dashboard'],
    created_at: new Date().toISOString(),
  },
]

function normalizePermissions(permissions) {
  if (Array.isArray(permissions)) return permissions
  if (permissions && typeof permissions === 'object') return Object.keys(permissions)
  return []
}

function normalizeRole(role) {
  return { ...role, permissions: normalizePermissions(role.permissions) }
}

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
    const roles = Array.isArray(parsed) ? parsed : DEFAULT_ROLES
    return roles.map(normalizeRole)
  } catch {
    return DEFAULT_ROLES
  }
}

function isDuplicateValue(roles, { value, excludeId }) {
  return roles.some((role) => role.id !== excludeId && role.value === value)
}

export function createRole(payload) {
  const roles = getRoles()
  if (isDuplicateValue(roles, { value: payload.value })) {
    throw new Error('Ya existe un rol con ese nombre interno.')
  }
  const newRole = normalizeRole({
    id: generateId(),
    ...payload,
    created_at: new Date().toISOString(),
  })
  saveRoles([...roles, newRole])
  return newRole
}

export function updateRole(id, payload) {
  const roles = getRoles()
  if (isDuplicateValue(roles, { value: payload.value, excludeId: id })) {
    throw new Error('Ya existe un rol con ese nombre interno.')
  }
  const updated = roles.map((role) =>
    role.id === id ? normalizeRole({ ...role, ...payload }) : role,
  )
  saveRoles(updated)
  return updated.find((role) => role.id === id)
}

export function deleteRole(id) {
  saveRoles(getRoles().filter((role) => role.id !== id))
}
