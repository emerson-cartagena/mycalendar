import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Plus, Trash2, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import { getEditRestrictions, canEditEvent } from '../lib/date'
import { WEEKDAY_LABELS, SLOT_DURATIONS } from '../lib/slots'
import { loadAvailability } from '../lib/availability'
import type { Event, Weekday, AvailabilityRule, DateOverride } from '../types'

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restrictions, setRestrictions] = useState<any>(null)

  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [overrides, setOverrides] = useState<DateOverride[]>([])

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

    const { rules, overrides } = await loadAvailability(ev.id)
    setRules(rules)
    setOverrides(overrides)

    setLoading(false)
  }

  async function reloadAvailability() {
    if (!eventId) return
    const { rules, overrides } = await loadAvailability(eventId)
    setRules(rules)
    setOverrides(overrides)
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

  async function handleAddRule(rule: Omit<AvailabilityRule, 'id' | 'event_id' | 'created_at'>) {
    if (!eventId) return
    const { error } = await supabase.from('event_availability_rules').insert({
      event_id: eventId,
      ...rule,
    })
    if (error) {
      toast.error('Error al agregar el horario')
      return
    }
    toast.success('Horario agregado')
    reloadAvailability()
  }

  async function handleDeleteRule(id: string) {
    const { error } = await supabase.from('event_availability_rules').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar el horario')
      return
    }
    reloadAvailability()
  }

  async function handleAddOverride(override: Omit<DateOverride, 'id' | 'event_id' | 'created_at'>) {
    if (!eventId) return
    const { error } = await supabase
      .from('event_date_overrides')
      .upsert({ event_id: eventId, ...override }, { onConflict: 'event_id,date' })
    if (error) {
      toast.error('Error al guardar la excepción')
      return
    }
    toast.success('Excepción guardada')
    reloadAvailability()
  }

  async function handleDeleteOverride(id: string) {
    const { error } = await supabase.from('event_date_overrides').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar la excepción')
      return
    }
    reloadAvailability()
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

          <AvailabilityRulesSection
            eventDateStart={form.date_start}
            eventDateEnd={form.date_end}
            defaultDuration={form.slot_duration_minutes}
            rules={rules}
            onAdd={handleAddRule}
            onDelete={handleDeleteRule}
          />

          <DateOverridesSection
            eventDateStart={form.date_start}
            eventDateEnd={form.date_end}
            defaultDuration={form.slot_duration_minutes}
            overrides={overrides}
            onAdd={handleAddOverride}
            onDelete={handleDeleteOverride}
          />

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

// ────────────────────────────────────────────────────────────
// Horarios adicionales (ej. "sábados 1-5pm", o un día suelto)
// ────────────────────────────────────────────────────────────
interface RuleFormState {
  weekdays: Weekday[]
  time_start: string
  time_end: string
  slot_duration_minutes: number
  scope: 'range' | 'date'
  date: string
}

function AvailabilityRulesSection({
  eventDateStart,
  eventDateEnd,
  defaultDuration,
  rules,
  onAdd,
  onDelete,
}: {
  eventDateStart: string
  eventDateEnd: string
  defaultDuration: number
  rules: AvailabilityRule[]
  onAdd: (rule: Omit<AvailabilityRule, 'id' | 'event_id' | 'created_at'>) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<RuleFormState>({
    weekdays: [],
    time_start: '08:00',
    time_end: '12:00',
    slot_duration_minutes: defaultDuration,
    scope: 'range',
    date: eventDateStart,
  })

  function toggleDay(day: Weekday) {
    setDraft(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter(d => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }))
  }

  function handleAdd() {
    if (draft.weekdays.length === 0) {
      toast.error('Selecciona al menos un día')
      return
    }
    if (draft.time_start >= draft.time_end) {
      toast.error('La hora de inicio debe ser antes de la hora fin')
      return
    }
    if (draft.scope === 'date' && !draft.date) {
      toast.error('Selecciona la fecha')
      return
    }

    onAdd({
      weekdays: draft.weekdays,
      time_start: draft.time_start,
      time_end: draft.time_end,
      slot_duration_minutes: draft.slot_duration_minutes,
      date_start: draft.scope === 'date' ? draft.date : null,
      date_end: draft.scope === 'date' ? draft.date : null,
    })

    setDraft(prev => ({ ...prev, weekdays: [], time_start: '08:00', time_end: '12:00' }))
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">Horarios adicionales</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Agrega bloques de horario extra dentro del rango del evento (ej. sábados en otro horario,
          o un día suelto fuera del patrón semanal).
        </p>
      </div>

      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-700">
                <span className="font-medium">{r.weekdays.map(d => WEEKDAY_LABELS[d]).join(', ')}</span>
                {' · '}{r.time_start} – {r.time_end}
                {r.date_start && (
                  <span className="text-gray-500"> · solo {r.date_start}{r.date_end !== r.date_start ? ` a ${r.date_end}` : ''}</span>
                )}
              </div>
              <button type="button" onClick={() => onDelete(r.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div>
          <label className="label">Días</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i as Weekday
              const active = draft.weekdays.includes(day)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(day)}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Hora inicio</label>
            <input
              className="input"
              type="time"
              value={draft.time_start}
              onChange={e => setDraft(prev => ({ ...prev, time_start: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Hora fin</label>
            <input
              className="input"
              type="time"
              value={draft.time_end}
              onChange={e => setDraft(prev => ({ ...prev, time_end: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="label">Duración de reunión</label>
          <select
            className="input"
            value={draft.slot_duration_minutes}
            onChange={e => setDraft(prev => ({ ...prev, slot_duration_minutes: Number(e.target.value) }))}
          >
            {SLOT_DURATIONS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Repetir</label>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setDraft(prev => ({ ...prev, scope: 'range' }))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                draft.scope === 'range'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              Todo el rango del evento
            </button>
            <button
              type="button"
              onClick={() => setDraft(prev => ({ ...prev, scope: 'date' }))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                draft.scope === 'date'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              Solo una fecha específica
            </button>
          </div>
        </div>

        {draft.scope === 'date' && (
          <div>
            <label className="label">Fecha</label>
            <input
              className="input"
              type="date"
              min={eventDateStart}
              max={eventDateEnd}
              value={draft.date}
              onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>
        )}

        <button type="button" onClick={handleAdd} className="btn-secondary text-sm flex items-center gap-1">
          <Plus size={14} /> Agregar horario
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Excepciones por fecha (ej. "miércoles particular 9-10", o bloquear un día)
// ────────────────────────────────────────────────────────────
function DateOverridesSection({
  eventDateStart,
  eventDateEnd,
  defaultDuration,
  overrides,
  onAdd,
  onDelete,
}: {
  eventDateStart: string
  eventDateEnd: string
  defaultDuration: number
  overrides: DateOverride[]
  onAdd: (override: Omit<DateOverride, 'id' | 'event_id' | 'created_at'>) => void
  onDelete: (id: string) => void
}) {
  const [date, setDate] = useState(eventDateStart)
  const [mode, setMode] = useState<'custom' | 'blocked'>('custom')
  const [timeStart, setTimeStart] = useState('09:00')
  const [timeEnd, setTimeEnd] = useState('10:00')
  const [duration, setDuration] = useState(defaultDuration)

  function handleAdd() {
    if (!date) {
      toast.error('Selecciona la fecha')
      return
    }
    if (mode === 'custom' && timeStart >= timeEnd) {
      toast.error('La hora de inicio debe ser antes de la hora fin')
      return
    }

    onAdd({
      date,
      is_blocked: mode === 'blocked',
      time_start: mode === 'custom' ? timeStart : null,
      time_end: mode === 'custom' ? timeEnd : null,
      slot_duration_minutes: mode === 'custom' ? duration : null,
    })
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">Excepciones por fecha</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Para un día en concreto ya cubierto por el patrón, define un horario distinto o bloquéalo por completo.
        </p>
      </div>

      {overrides.length > 0 && (
        <div className="space-y-2">
          {overrides.map(o => (
            <div key={o.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-700 flex items-center gap-2">
                <span className="font-medium">{o.date}</span>
                {o.is_blocked ? (
                  <span className="text-red-600 flex items-center gap-1"><Ban size={14} /> Bloqueado</span>
                ) : (
                  <span>{o.time_start} – {o.time_end}</span>
                )}
              </div>
              <button type="button" onClick={() => onDelete(o.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div>
          <label className="label">Fecha</label>
          <input
            className="input"
            type="date"
            min={eventDateStart}
            max={eventDateEnd}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              mode === 'custom'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            Horario personalizado
          </button>
          <button
            type="button"
            onClick={() => setMode('blocked')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              mode === 'blocked'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            Bloquear día
          </button>
        </div>

        {mode === 'custom' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Hora inicio</label>
                <input className="input" type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Hora fin</label>
                <input className="input" type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Duración de reunión</label>
              <select className="input" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                {SLOT_DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <button type="button" onClick={handleAdd} className="btn-secondary text-sm flex items-center gap-1">
          <Plus size={14} /> Guardar excepción
        </button>
      </div>
    </div>
  )
}
