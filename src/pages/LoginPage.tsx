import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success('¡Sesión iniciada!')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Calendar className="text-primary-600" size={32} />
          <span className="text-2xl font-bold text-gray-900">MyCalendar</span>
        </div>

        {/* Card */}
        <div className="card">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo</label>
              <input
                className="input"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>
          
        </div>
      </div>
    </div>
  )
}
