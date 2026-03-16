import { useState } from 'react'
import toast from 'react-hot-toast'
import { Clock, Link2, Plus, X, CheckCircle2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Event, Booking, Slot } from '../types'

interface Props {
  event: Event
  slots: Slot[]
  onBooked: (b: Booking) => void
  embedded?: boolean
}

interface BookingForm {
  name: string
  email: string
  guests: string[]
  guestInput: string
}

type Step = 'select-slot' | 'fill-form' | 'success'

export default function BookingWidget({ event, slots, onBooked, embedded = false }: Props) {
  const [selected, setSelected] = useState<Slot | null>(null)
  const [step, setStep] = useState<Step>('select-slot')
  const [form, setForm] = useState<BookingForm>({ name: '', email: '', guests: [], guestInput: '' })
  const [loading, setLoading] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null)

  function handleSelectSlot(slot: Slot) {
    if (!slot.available) return
    setSelected(slot)
    setStep('fill-form')
  }

  function addGuest() {
    const g = form.guestInput.trim().toLowerCase()
    if (!g) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g)) {
      toast.error('Correo de invitado no válido')
      return
    }
    if (form.guests.includes(g)) {
      toast.error('Ya agregaste ese correo')
      return
    }
    setForm(prev => ({ ...prev, guests: [...prev.guests, g], guestInput: '' }))
  }

  function removeGuest(email: string) {
    setForm(prev => ({ ...prev, guests: prev.guests.filter(g => g !== email) }))
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return toast.error('Correo no válido')

    setLoading(true)
    try {
      // Verificar que el email no esté ya reservado en este evento
      const { count: existingEmail } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('attendee_email', form.email.trim().toLowerCase())
        .eq('status', 'confirmed')

      if ((existingEmail ?? 0) > 0) {
        toast.error('Este correo ya tiene una reserva en este evento')
        setLoading(false)
        return
      }

      // Verificar que el slot sigue disponible (condición de carrera)
      const { count: slotBooked } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('slot_datetime', selected.datetime)
        .eq('status', 'confirmed')

      if ((slotBooked ?? 0) > 0) {
        toast.error('Ese horario acaba de ser reservado. Por favor elige otro.')
        setStep('select-slot')
        setSelected(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .insert({
          event_id: event.id,
          slot_datetime: selected.datetime,
          attendee_name: form.name.trim(),
          attendee_email: form.email.trim().toLowerCase(),
          extra_guests: form.guests,
          status: 'confirmed',
        })
        .select('*')
        .single()

      if (error) throw error

      const booking = data as Booking
      
      // Obtener email del owner del evento
      const { data: eventData } = await supabase
        .from('events')
        .select('user_id')
        .eq('id', event.id)
        .single()

      if (eventData) {
        const { data: ownerData } = await supabase
          .from('users')
          .select('email')
          .eq('id', eventData.user_id)
          .single()

        if (ownerData) {
          // Llamar a la Edge Function para enviar emails
          try {
            await fetch(
              'https://vrggahqfapozygajklaj.functions.supabase.co/send-booking-email',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZ2dhaHFmYXBvenlnYWprbGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NjM1NzEsImV4cCI6MjA4OTIzOTU3MX0.dhtfPeaINYmdMEDKm8t1g-fAQi_3G3OUwOaTl2f-0dw`,
                },
                body: JSON.stringify({
                  ownerEmail: ownerData.email,
                  attendeeName: form.name.trim(),
                  attendeeEmail: form.email.trim().toLowerCase(),
                  slot: selected.datetime,
                  eventTitle: event.title,
                  bookingId: booking.id,
                  locationUrl: event.location_url,
                  type: 'booking',
                }),
              }
            )
          } catch (emailErr) {
            console.error('Error sending email:', emailErr)
            // No lanzamos error, el booking ya se creó
          }
        }
      }

      onBooked(booking)
      setConfirmedBooking(booking)
      setStep('success')
    } catch (err) {
      console.error(err)
      toast.error('Error al guardar la reserva. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Pantalla de éxito ── */
  if (step === 'success' && confirmedBooking) {
    return (
      <div className="card text-center space-y-4 max-w-md mx-auto">
        <CheckCircle2 size={48} className="text-green-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">¡Reserva confirmada!</h2>
        <p className="text-gray-600 text-sm">
          Hola <strong>{confirmedBooking.attendee_name}</strong>, tu espacio fue reservado para:
        </p>
        <p className="text-primary-700 font-semibold">
          {format(parseISO(confirmedBooking.slot_datetime), "EEEE d 'de' MMMM · h:mm aa", { locale: es })}
        </p>
        {event.location_url && (
          <a
            href={event.location_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm"
          >
            <Link2 size={14} /> Únete a la reunión
          </a>
        )}
        <p className="text-xs text-gray-400">
          Se ha enviado una confirmación a {confirmedBooking.attendee_email}.
        </p>
        {!embedded && (
          <button
            onClick={() => { setStep('select-slot'); setSelected(null); setForm({ name: '', email: '', guests: [], guestInput: '' }) }}
            className="btn-secondary w-full text-sm"
          >
            Reservar otro horario
          </button>
        )}
      </div>
    )
  }

  /* ── Formulario de datos ── */
  if (step === 'fill-form' && selected) {
    return (
      <div className="space-y-6">
        <EventHeader event={event} />

        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Confirmar reserva</h2>
            <button onClick={() => { setStep('select-slot'); setSelected(null) }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="bg-primary-50 rounded-lg px-4 py-3 text-sm text-primary-800 font-medium">
            {format(parseISO(selected.datetime), "EEEE d 'de' MMMM · h:mm aa", { locale: es })}
          </div>

          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="label">Nombre completo <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Tu nombre" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
              <input className="input" type="email" placeholder="tu@correo.com" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Recibirás la confirmación aquí.</p>
            </div>

            {/* Invitados adicionales */}
            <div>
              <label className="label flex items-center gap-1"><Plus size={13} /> Invitar más personas (opcional)</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.guestInput}
                  onChange={e => setForm(p => ({ ...p, guestInput: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
                />
                <button type="button" onClick={addGuest} className="btn-secondary flex-shrink-0">
                  <Plus size={15} />
                </button>
              </div>
              {form.guests.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.guests.map(g => (
                    <span key={g} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full px-2.5 py-1">
                      {g}
                      <button type="button" onClick={() => removeGuest(g)} className="text-gray-400 hover:text-red-500">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Reservando...' : 'Confirmar reserva'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  /* ── Selección de slot ── */
  const available = slots.filter(s => s.available).length
  return (
    <div className="space-y-6">
      <EventHeader event={event} />

      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">
            Horarios disponibles
          </h2>
          <span className="text-sm text-gray-500">
            {available} de {slots.length} disponibles
          </span>
        </div>

        {slots.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No hay horarios para este evento.</p>
        ) : (
          <SlotGrid slots={slots} onSelect={handleSelectSlot} />
        )}
      </div>
    </div>
  )
}

/* ── Sub-componentes ── */

function EventHeader({ event }: { event: Event }) {
  return (
    <div className="card">
      <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
      {event.description && <p className="text-gray-500 text-sm mt-1">{event.description}</p>}
      <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600">
        <Clock size={14} />
        <span>{event.slot_duration_minutes} minutos por reunión</span>
      </div>
      {event.location_url && (
        <a href={event.location_url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-primary-600 hover:underline text-sm">
          <Link2 size={13} /> Ver enlace de reunión
        </a>
      )}
    </div>
  )
}

function SlotGrid({ slots, onSelect }: { slots: Slot[]; onSelect: (s: Slot) => void }) {
  // Agrupar por fecha
  const groups: Record<string, Slot[]> = {}
  for (const s of slots) {
    const day = s.datetime.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(s)
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([day, daySlots]) => (
        <div key={day}>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
            {format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {daySlots.map(slot => (
              <button
                key={slot.datetime}
                onClick={() => onSelect(slot)}
                disabled={!slot.available}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-center ${
                  slot.available
                    ? 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
                    : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                }`}
              >
                {format(parseISO(slot.datetime), 'h:mm aa', { locale: es })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
