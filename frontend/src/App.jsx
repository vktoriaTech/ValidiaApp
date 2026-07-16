import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Shell from './components/layout/Shell'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ClientesPage from './pages/clientes/ClientesPage'
import ClienteDetailPage from './pages/clientes/ClienteDetailPage'
import CampaignsPage from './pages/campaigns/CampaignsPage'
import POSPage from './pages/pos/POSPage'
import UsersPage from './pages/users/UsersPage'
import ConfiguracionPage from './pages/configuracion/ConfiguracionPage'
import ProfilePage from './pages/profile/ProfilePage'

export default function App() {
  const token = useAuthStore((state) => state.token)

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      <Route path="/" element={<Shell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="clientes/:clienteId" element={<ClienteDetailPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="configuracion" element={<ConfiguracionPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
