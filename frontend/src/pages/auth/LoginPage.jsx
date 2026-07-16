import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../services/authService'
import { useAuthStore } from '../../store/authStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Card from '../../components/ui/Card'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setAuth({
        token: data.access_token,
        user: data.user,
        tenant: data.user?.tenant_id
          ? { id: data.user.tenant_id, name: data.user.tenant_name }
          : null,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
      } else {
        setError('No fue posible iniciar sesión. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-v-gray-50 px-4">
      <Card className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-14 w-14">
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
          <div className="text-center">
            <h1 className="font-accent text-xl font-bold text-v-night">
              Validia
            </h1>
            <p className="text-sm text-gray-500">
              Inicia sesión en tu cuenta
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="email"
            type="email"
            label="Correo electrónico"
            placeholder="admin@validia.co"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            id="password"
            type="password"
            label="Contraseña"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
