import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    ),
  },
  {
    to: '/clientes',
    label: 'Clientes',
    superAdminOnly: true,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m8-14h.01M11 11h.01M11 15h.01M7 7h.01M7 11h.01M7 15h.01M15 7h.01M15 11h.01M15 15h.01"
      />
    ),
  },
  {
    to: '/campaigns',
    label: 'Campañas',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
      />
    ),
  },
  {
    to: '/users',
    label: 'Usuarios',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-4a4 4 0 100-8 4 4 0 000 8zm6 4a4 4 0 00-3-3.87m0 0a4 4 0 10-3.999-6.929"
      />
    ),
  },
  {
    to: '/configuracion',
    label: 'Configuración',
    superAdminOnly: true,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
    ),
    secondaryPath: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    ),
  },
  {
    to: '/profile',
    label: 'Mi perfil',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    ),
  },
]

const ROLE_LABELS = {
  super_admin: 'Super admin',
  tenant_admin: 'Administrador',
  tenant_viewer: 'Visualizador',
}

export default function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const tenant = useAuthStore((state) => state.tenant)
  const navItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || user?.role === 'super_admin',
  )

  return (
    <aside className="flex h-full w-64 flex-col bg-v-night text-v-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-9 w-9">
            <polygon
              points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"
              fill="#FF0080"
            />
            <text
              x="12"
              y="16"
              textAnchor="middle"
              fontSize="10"
              fontWeight="800"
              fill="#FFFFFF"
              fontFamily="Montserrat, sans-serif"
            >
              VK
            </text>
          </svg>
        </div>
        <span className="font-accent text-lg font-extrabold tracking-wide">
          VKTORIA
        </span>
      </div>

      {tenant && (
        <div className="mx-6 mb-4 rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">
            Cliente activo
          </p>
          <p className="truncate text-sm font-medium text-v-white">
            {tenant.name}
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-v-magenta text-v-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-v-white'
              }`
            }
          >
            <svg
              className="h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {item.icon}
              {item.secondaryPath}
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <p className="truncate text-sm font-medium text-v-white">
          {user?.full_name || user?.email || 'Usuario'}
        </p>
        <p className="truncate text-xs text-white/40">
          {ROLE_LABELS[user?.role] || user?.role || '—'}
        </p>
      </div>
    </aside>
  )
}
