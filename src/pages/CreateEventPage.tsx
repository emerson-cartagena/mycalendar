import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Calendar, Link2, Clock, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import { slugify, WEEKDAY_LABELS, SLOT_DURATIONS } from '../lib/slots'
import type { Weekday } from '../types'

interface FormState {
  title: string
  description: string
  location_url: string
  date_start: string
  date_end: string
  time_start: string
  time_end: string
  slot_duration_minutes: number
  weekdays: Weekday[]
}

const INITIAL: FormState = {
  title: '',
  description: '',
  location_url: '',
  date_start: '',
  date_end: '',
  time_start: '08:00',
  time_end: '17:00',
  slot_duration_minutes: 30,
  weekdays: [1, 2, 3, 4, 5], // lunes a viernes por defecto
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(false)

  if (!user) {
    navigate('/login')
    return null
  }

  const currentUser = user

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleWeekday(day: Weekday) {
    setForm(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.title.trim()) return toast.error('El título es obligatorio')
    if (!form.date_start || !form.date_end) return toast.error('Las fechas son obligatorias')
    if (form.date_start > form.date_end) return toast.error('La fecha de inicio debe ser antes del fin')
    if (form.time_start >= form.time_end) return toast.error('La hora de inicio debe ser antes de la hora fin')
    if (form.weekdays.length === 0) return toast.error('Selecciona al menos un día de la semana')

    setLoading(true)
    try {
      const baseSlug = slugify(form.title)
      // Añadir sufijo aleatorio para evitar colisiones
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: currentUser.id,
          slug,
          title: form.title.trim(),
          description: form.description.trim() || null,
          location_url: form.location_url.trim() || null,
          date_start: form.date_start,
          date_end: form.date_end,
          time_start: form.time_start,
          time_end: form.time_end,
          slot_duration_minutes: form.slot_duration_minutes,
          weekdays: form.weekdays,
        })
        .select('id')
        .single()

      if (error) throw error
      toast.success('¡Evento creado!')
      navigate(`/manage/${data.id}`)
    } catch (err) {
      console.error(err)
      toast.error('Error al crear el evento. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={18} /> Volver al dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Crear nuevo evento</h1>
          <p className="text-gray-500 mt-1">Configura tu evento y comparte el enlace para que otros reserven.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información básica */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Calendar size={18} className="text-primary-600" /> Información del evento
            </h2>

            <div>
              <label className="label">Título <span className="text-red-500">*</span></label>
              <input
                className="input"
                placeholder="Ej. Reunión de consulta"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                maxLength={100}
              />
            </div>

            <div>
              <label className="label">Descripción</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Describe de qué trata el evento..."
                value={form.description}
                onChange={e => set('description', e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <label className="label flex items-center gap-1">
                <Link2 size={14} /> Enlace de la reunión (Meet, Teams, Zoom…) <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                className="input"
                type="url"
                placeholder="https://meet.google.com/abc-xyz"
                value={form.location_url}
                onChange={e => set('location_url', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Este enlace se enviará a todos los que reserven.</p>
            </div>
          </div>

          {/* Fechas y horario */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Clock size={18} className="text-primary-600" /> Fechas y horario
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha inicio <span className="text-red-500">*</span></label>
                <input
                  className="input"
                  type="date"
                  value={form.date_start}
                  onChange={e => set('date_start', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Fecha fin <span className="text-red-500">*</span></label>
                <input
                  className="input"
                  type="date"
                  value={form.date_end}
                  min={form.date_start}
                  onChange={e => set('date_end', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Hora inicio disponible</label>
                <input
                  className="input"
                  type="time"
                  value={form.time_start}
                  onChange={e => set('time_start', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Hora fin disponible</label>
                <input
                  className="input"
                  type="time"
                  value={form.time_end}
                  onChange={e => set('time_end', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Duración de cada reunión</label>
              <select
                className="input"
                value={form.slot_duration_minutes}
                onChange={e => set('slot_duration_minutes', Number(e.target.value))}
              >
                {SLOT_DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Días de la semana disponibles</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {WEEKDAY_LABELS.map((label, i) => {
                  const day = i as Weekday
                  const active = form.weekdays.includes(day)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'Creando evento...' : 'Crear evento'}
          </button>
        </form>
      </main>
    </div>
  )
}
