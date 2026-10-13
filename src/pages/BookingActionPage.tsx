import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, AlertCircle, Calendar, Clock, User, Mail, Moon, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateSlots, formatSlotDateTime } from '../lib/slots'
import { loadAvailability } from '../lib/availability'
import { usePublicTheme } from '../lib/usePublicTheme'
import type { Event, Booking, Slot } from '../types'

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Envuelve cada vista pública con el tema local (claro por defecto) y su toggle. */
function PublicThemeWrapper({ isDark, toggle, children }: { isDark: boolean; toggle: () => void; children: ReactNode }) {
  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="relative">
        <button
          onClick={toggle}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800 transition-colors"
          aria-label="Cambiar tema"
          title="Cambiar tema"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {children}
      </div>
    </div>
  )
}

export default function BookingActionPage() {
  const [searchParams] = useSearchParams()
  const { isDark, toggle } = usePublicTheme()

  const token = searchParams.get('token')
  const action = searchParams.get('action')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [booking, setBooking] = useState<Booking | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleToken, setRescheduleToken] = useState<string | null>(null)
  
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationToken, setCancellationToken] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [rescheduleReason, setRescheduleReason] = useState('')

  useEffect(() => {
    if (!token || !action) {
      setError('Token o acción no válidos. Por favor, revisa el enlace en tu correo.')
      setLoading(false)
      return
    }

    processToken()
  }, [token, action])

  async function processToken() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        'https://vrggahqfapozygajklaj.functions.supabase.co/handle-booking-token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            token,
            action,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          setError('El token no es válido, ha expirado o ya fue utilizado.')
        } else {
          setError(data.error || 'Error procesando el token.')
        }
        setLoading(false)
        return
      }

      if (action === 'cancel') {
        // Preparar para cancelación: guardar booking pero no confirmar aún
        setBooking(data.booking)
        setCancellationToken(data.token)
        setLoading(false)
      } else if (action === 'reschedule') {
        // Preparar para reprogramar: obtener evento y slots
        setBooking(data.booking)
        setRescheduleToken(data.token) // Guardar el token para usarlo después
        
        const { data: eventData } = await supabase
          .from('events')
          .select('*')
          .eq('id', data.booking.event_id)
          .single()

        if (eventData) {
          setEvent(eventData as Event)
          
          // Generar slots disponibles
          const { data: bookings } = await supabase
            .from('bookings')
            .select('*')
            .eq('event_id', eventData.id)
            .eq('status', 'confirmed')
          
          const { rules, overrides } = await loadAvailability(eventData.id)
          const availableSlots = generateSlots(
            eventData as Event,
            (bookings as Booking[]) ?? [],
            rules,
            overrides
          )
          setSlots(availableSlots)
        }

        setLoading(false)
      }
    } catch (err) {
      console.error('Error procesando token:', err)
      setError('Error del servidor. Por favor, intenta más tarde.')
      setLoading(false)
    }
  }

  async function handleRescheduleSubmit() {
    if (!selectedSlot || !booking || !event) return

    try {
      setRescheduling(true)
      setError(null)

      // Marcar el token como usado AHORA que se confirma el cambio
      if (rescheduleToken) {
        await supabase
          .from('booking_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('token', rescheduleToken)
      }

      // Actualizar la reserva con el nuevo slot
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ slot_datetime: selectedSlot })
        .eq('id', booking.id)

      if (updateError) {
        setError('Error al reprogramar. La hora podría haber sido reservada justo ahora.')
        setRescheduling(false)
        return
      }

      // Crear entrada en booking_changes
      await supabase
        .from('booking_changes')
        .insert({
          booking_id: booking.id,
          change_type: 'reschedule',
          old_slot_datetime: booking.slot_datetime,
          new_slot_datetime: selectedSlot,
          reason: rescheduleReason || 'Reprogramación desde enlace de email',
          created_by: event.user_id,
        })

      // UNA SOLA LLAMADA al endpoint con toda la información
      // El endpoint se encarga de todo: tokens, envíos, etc.
      try {
        const { data: ownerData } = await supabase
          .from('users')
          .select('email')
          .eq('id', event.user_id)
          .single()

        if (ownerData) {
          await supabase.functions.invoke('send-booking-email', {
            body: {
              ownerEmail: ownerData.email,
              ownerName: 'Organizador',
              attendeeName: booking.attendee_name,
              attendeeEmail: booking.attendee_email,
              eventTitle: event.title,
              bookingId: booking.id,
              slot: selectedSlot,
              locationUrl: event.location_url,
              type: 'reschedule',
              oldSlot: booking.slot_datetime,
              newSlot: selectedSlot,
              originatedFrom: 'attendee',
              extraGuests: booking.extra_guests,
              reason: rescheduleReason,
            },
          })
        }
      } catch (emailErr) {
        console.error('Error sending reschedule notification:', emailErr)
      }

      setSuccess(true)
      setBooking({ ...booking, slot_datetime: selectedSlot })
      setRescheduling(false)
    } catch (err) {
      console.error('Error reprogramando:', err)
      setError('Error procesando tu solicitud.')
      setRescheduling(false)
    }
  }

  async function handleCancelConfirm(e: React.FormEvent) {
    e.preventDefault()
    
    if (!cancellationReason.trim() || !booking || !cancellationToken) return

    try {
      setCancelling(true)
      setError(null)

      // Marcar TODOS los tokens de esta booking como usados
      await supabase
        .from('booking_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('booking_id', booking.id)
        .is('used_at', null)

      // Cancelar la booking
      const { error: cancelError } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_reason: cancellationReason,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      if (cancelError) {
        setError('Error al cancelar la reserva.')
        setCancelling(false)
        return
      }

      // Obtener datos del evento para notificación
      try {
        const { data: eventData } = await supabase
          .from('events')
          .select('user_id, title, location_url')
          .eq('id', booking.event_id)
          .single()

        if (eventData) {
          const { data: ownerData } = await supabase
            .from('users')
            .select('email')
            .eq('id', eventData.user_id)
            .single()

          if (ownerData) {
            await supabase.functions.invoke('send-booking-email', {
              body: {
                ownerEmail: ownerData.email,
                ownerName: 'Organizador',
                attendeeName: booking.attendee_name,
                attendeeEmail: booking.attendee_email,
                eventTitle: eventData.title,
                bookingId: booking.id,
                slot: booking.slot_datetime,
                locationUrl: eventData.location_url,
                type: 'cancel',
                originatedFrom: 'attendee',
                extraGuests: booking.extra_guests,
                reason: cancellationReason,
              },
            })
          }
        }
      } catch (emailErr) {
        console.error('Error sending cancellation notification:', emailErr)
      }

      setSuccess(true)
      setCancelling(false)
    } catch (err) {
      console.error('Error cancelando:', err)
      setError('Error procesando tu solicitud.')
      setCancelling(false)
    }
  }

  // ── LOADING ──
  if (loading) {
    return (
      <PublicThemeWrapper isDark={isDark} toggle={toggle}>
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Procesando tu solicitud...</p>
        </div>
      </div>
      </PublicThemeWrapper>
    )
  }

  // ── ERROR ──
  if (error && !success) {
    return (
      <PublicThemeWrapper isDark={isDark} toggle={toggle}>
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full dark:bg-gray-800">
          <div className="flex justify-center mb-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2 dark:text-gray-100">
            Error
          </h1>
          <p className="text-gray-600 text-center mb-6 dark:text-gray-400">{error}</p>
        </div>
      </div>
      </PublicThemeWrapper>
    )
  }

  // ── CANCELLATION SUCCESS ──
  if (success && action === 'cancel') {
    return (
      <PublicThemeWrapper isDark={isDark} toggle={toggle}>
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full dark:bg-gray-800">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2 dark:text-gray-100">
            Reserva Cancelada
          </h1>
          <p className="text-gray-600 text-center mb-6 dark:text-gray-400">
            Tu reserva ha sido cancelada exitosamente.
          </p>

          {booking && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3 dark:bg-gray-700/50">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatSlotDateTime(booking.slot_datetime, true)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <User className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Mail className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_email}</span>
              </div>
            </div>
          )}

          <p className="text-gray-600 text-sm text-center mb-6 dark:text-gray-400">
            Se ha enviado una confirmación de cancelación a tu correo.
          </p>
        </div>
      </div>
      </PublicThemeWrapper>
    )
  }

  // ── CANCELLATION FORM ──
  if (action === 'cancel' && booking && !success) {
    if (cancelling) {
      return (
        <PublicThemeWrapper isDark={isDark} toggle={toggle}>
        <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Cancelando reserva...</p>
          </div>
        </div>
        </PublicThemeWrapper>
      )
    }

    return (
      <PublicThemeWrapper isDark={isDark} toggle={toggle}>
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full dark:bg-gray-800">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2 dark:text-gray-100">
            Cancelar Reserva
          </h1>

          <p className="text-gray-600 text-center mb-6 dark:text-gray-400">
            ¿Está seguro que desea cancelar esta reserva?
          </p>

          {booking && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3 dark:bg-gray-700/50">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatSlotDateTime(booking.slot_datetime, true)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <User className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_name}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleCancelConfirm} className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-semibold text-gray-800 mb-2 dark:text-gray-200">
                Razón de cancelación <span className="text-red-500">*</span>
              </label>
              <textarea
                id="reason"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                rows={3}
                placeholder="Cuéntanos por qué necesitas cancelar. Esto nos ayuda a mejorar..."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:bg-red-950/40 dark:border-red-900">
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={!cancellationReason.trim() || cancelling}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition dark:disabled:bg-gray-700"
              >
                {cancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
              <button
                type="button"
                onClick={() => window.close()}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
              >
                Cerrar
              </button>
            </div>
          </form>
        </div>
      </div>
      </PublicThemeWrapper>
    )
  }

  // ── RESCHEDULE VIEW ──
  if (action === 'reschedule' && booking && event) {
    if (rescheduling) {
      return (
        <PublicThemeWrapper isDark={isDark} toggle={toggle}>
        <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Guardando los cambios...</p>
          </div>
        </div>
        </PublicThemeWrapper>
      )
    }

    if (success) {
      return (
        <PublicThemeWrapper isDark={isDark} toggle={toggle}>
        <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full dark:bg-gray-800">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-center text-gray-900 mb-2 dark:text-gray-100">
              Reprogramación Exitosa
            </h1>
            <p className="text-gray-600 text-center mb-6 dark:text-gray-400">
              Tu reserva ha sido reprogramada exitosamente.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3 dark:bg-gray-700/50">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatSlotDateTime(booking.slot_datetime, true)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <User className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_name}</span>
              </div>
            </div>

            <p className="text-gray-600 text-sm text-center mb-6 dark:text-gray-400">
              Se ha enviado una confirmación de reprogramación a tu correo con los nuevos detalles.
            </p>
          </div>
        </div>
        </PublicThemeWrapper>
      )
    }

    // Show slot selection
    return (
      <PublicThemeWrapper isDark={isDark} toggle={toggle}>
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white dark:from-gray-900 dark:to-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg p-8 dark:bg-gray-800">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-gray-100">
              Reprogramar Reserva
            </h1>
            <p className="text-gray-600 mb-6 dark:text-gray-400">
              Selecciona una nueva fecha y hora para tu reserva con {event.title}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 p-4 bg-gray-50 rounded-lg dark:bg-gray-700/50">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1 dark:text-gray-400">
                  Hora Actual
                </p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatSlotDateTime(booking.slot_datetime, true)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1 dark:text-gray-400">
                  Asistente
                </p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {booking.attendee_name}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 dark:text-gray-100">
                Selecciona una Nueva Hora
              </h2>

              {slots.filter(s => s.available).length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No hay horarios disponibles en este momento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {slots.filter(s => s.available).map((slot) => (
                    <button
                      key={slot.datetime}
                      onClick={() => setSelectedSlot(slot.datetime)}
                      className={`p-3 rounded-lg border-2 transition font-medium ${
                        selectedSlot === slot.datetime
                          ? 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-primary-950/40 dark:text-primary-200'
                          : 'border-gray-200 hover:border-primary-300 text-gray-900 dark:border-gray-700 dark:hover:border-primary-600 dark:text-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" />
                        {slot.label}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-6">
                <label htmlFor="reschedule-reason" className="block text-sm font-semibold text-gray-800 mb-2 dark:text-gray-200">
                  Razón de cambio (opcional)
                </label>
                <textarea
                  id="reschedule-reason"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                  rows={2}
                  placeholder="Ej: Cambio de horario de trabajo..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              </div>

              <button
                onClick={handleRescheduleSubmit}
                disabled={!selectedSlot}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition ${
                  selectedSlot
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                }`}
              >
                Confirmar Nueva Fecha
              </button>
            </div>
          </div>
        </div>
      </div>
      </PublicThemeWrapper>
    )
  }

  return null
}
