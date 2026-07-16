import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import Sidebar from './Sidebar'
import Button from '../ui/Button'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/campaigns': 'Campañas',
  '/pos': 'Puntos de venta',
  '/users': 'Usuarios',
  '/configuracion': 'Configuración',
  '/profile': 'Mi perfil',
}

function getPageTitle(pathname) {
  const match = Object.keys(PAGE_TITLES).find((path) =>
    pathname.startsWith(path),
  )
  return match ? PAGE_TITLES[match] : 'Validia'
}

export default function Shell() {
  const token = useAuthStore((state) => state.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-v-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-v-border bg-v-white px-8 py-4">
          <h1 className="text-xl font-semibold text-v-night">
            {getPageTitle(location.pathname)}
          </h1>
          <Button variant="primary">Nueva actividad</Button>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
