import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { Turnstile } from '@marsidev/react-turnstile'
import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string
const IS_DEV = import.meta.env.DEV

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!IS_DEV && !turnstileToken) {
      toast.error('Completa la verificación de seguridad')
      return
    }

    setLoading(true)
    try {
      if (!IS_DEV) {
        const { data, error } = await supabase.functions.invoke('verify-turnstile', {
          body: { token: turnstileToken },
        })

        if (error || !data?.success) {
          turnstileRef.current?.reset()
          setTurnstileToken(null)
          throw new Error('Verificación de seguridad fallida. Inténtalo de nuevo.')
        }
      }

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
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <Calendar className="text-primary-600" size={32} />
            <span className="text-2xl font-bold text-gray-900">MyCalendar</span>
          </div>
          <p className="text-sm text-gray-500">Reservas online para profesionales</p>
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

            {!IS_DEV && TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => {
                    setTurnstileToken(null)
                    toast.error('Error en la verificación de seguridad')
                  }}
                  options={{ theme: 'light', language: 'es' }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!IS_DEV && !!TURNSTILE_SITE_KEY && !turnstileToken)}
              className="btn-primary w-full py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>
          
        </div>
      </div>
    </div>
  )
}
