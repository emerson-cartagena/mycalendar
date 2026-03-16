import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import { getEditRestrictions, canEditEvent } from '../lib/date'
import { WEEKDAY_LABELS, SLOT_DURATIONS } from '../lib/slots'
import type { Event, Weekday } from '../types'

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restrictions, setRestrictions] = useState<any>(null)

  useEffect(() => {
    if (!eventId) return
    loadEvent()
  }, [eventId])

  async function loadEvent() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (error || !data) {
      toast.error('Evento no encontrado')
      navigate('/dashboard')
      return
    }

    const ev = data as Event
    // Verificar permisos
    if (user?.role !== 'admin' && ev.user_id !== user?.id) {
      toast.error('No tienes permiso para editar este evento')
      navigate('/dashboard')
      return
    }

    setEvent(ev)
    setForm(ev)
    setRestrictions(getEditRestrictions(ev))
    setLoading(false)
  }

  function set<K extends keyof Event>(key: K, value: Event[K]) {
    if (!form) return
    setForm(prev => ({ ...prev!, [key]: value }))
  }

  function toggleWeekday(day: Weekday) {
    if (!form) return
    setForm(prev => ({
      ...prev!,
      weekdays: prev!.weekdays.includes(day)
        ? prev!.weekdays.filter(d => d !== day)
        : [...prev!.weekdays, day].sort((a, b) => a - b),
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !form) return

    const restr = restrictions
    if (!restr.canChangeStartDate && form.date_start !== event.date_start) {
      toast.error('No puedes cambiar la fecha de inicio en eventos activos')
      return
    }

    if (!restr.canChangeEndDate && form.date_end !== event.date_end) {
      toast.error('No puedes cambiar la fecha de fin en eventos pasados')
      return
    }

    // Advertencia si hay cambios que afecten futuras
    if (
      restr.affectsExisting &&
      (form.weekdays !== event.weekdays || form.date_end !== event.date_end)
    ) {
      const confirmed = window.confirm(
        restr.message + '\n\n¿Deseas continuar?'
      )
      if (!confirmed) return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({
          title: form.title,
          description: form.description,
          location_url: form.location_url,
          date_start: form.date_start,
          date_end: form.date_end,
          time_start: form.time_start,
          time_end: form.time_end,
          slot_duration_minutes: form.slot_duration_minutes,
          weekdays: form.weekdays,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)

      if (error) throw error
      toast.success('¡Evento actualizado!')
      navigate(`/manage/${eventId}`)
    } catch (err) {
      console.error(err)
      toast.error('Error al guardar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />
  if (!form || !event || !restrictions) return null

  const canEdit = canEditEvent(event)
  if (!canEdit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md text-center">
          <p className="text-gray-500">Este evento ya pasó y no puede ser editado.</p>
          <Link to="/dashboard" className="btn-primary mt-4 inline-block">
            Volver al dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(`/manage/${eventId}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={18} /> Volver al evento
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar evento</h1>
        {restrictions.affectsExisting && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="text-yellow-700 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-yellow-700">
              <strong>Aviso:</strong> {restrictions.message}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Información</h2>
            <div>
              <label className="label">Título</label>
              <input
                className="input"
                value={form.title}
                onChange={e => set('title', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={form.description || ''}
                onChange={e => set('description', e.target.value || null)}
              />
            </div>
            <div>
              <label className="label">Enlace de reunión</label>
              <input
                className="input"
                type="url"
                value={form.location_url || ''}
                onChange={e => set('location_url', e.target.value || null)}
              />
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Fechas y horario</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Fecha inicio
                  {!restrictions.canChangeStartDate && ' (no editable)'}
                </label>
                <input
                  className={`input ${!restrictions.canChangeStartDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                  type="date"
                  value={form.date_start}
                  onChange={e => set('date_start', e.target.value)}
                  disabled={!restrictions.canChangeStartDate}
                />
              </div>
              <div>
                <label className="label">
                  Fecha fin
                  {!restrictions.canChangeEndDate && ' (no editable)'}
                </label>
                <input
                  className={`input ${!restrictions.canChangeEndDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                  type="date"
                  value={form.date_end}
                  onChange={e => set('date_end', e.target.value)}
                  disabled={!restrictions.canChangeEndDate}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Hora inicio</label>
                <input
                  className="input"
                  type="time"
                  value={form.time_start}
                  onChange={e => set('time_start', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Hora fin</label>
                <input
                  className="input"
                  type="time"
                  value={form.time_end}
                  onChange={e => set('time_end', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Duración de reunión</label>
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
              <label className="label">Días disponibles</label>
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

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary py-2.5 flex-1">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/manage/${eventId}`)}
              className="btn-secondary py-2.5"
            >
              Cancelar
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  )
}
