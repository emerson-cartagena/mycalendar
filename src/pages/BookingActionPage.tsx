import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertCircle, Calendar, Clock, User, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateSlots, formatSlotDateTime } from '../lib/slots'
import type { Event, Booking, Slot } from '../types'

export default function BookingActionPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
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
        // Cancelación completada
        setSuccess(true)
        setBooking(data.booking)
        setLoading(false)
      } else if (action === 'reschedule') {
        // Preparar para reprogramar: obtener evento y slots
        setBooking(data.booking)
        
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
          
          const availableSlots = generateSlots(
            eventData as Event,
            (bookings as Booking[]) ?? []
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
          reason: 'Reprogramación desde enlace de email',
          created_by: event.user_id,
        })

      // TODO: Enviar email de confirmación de reprogramación

      setSuccess(true)
      setBooking({ ...booking, slot_datetime: selectedSlot })
      setRescheduling(false)
    } catch (err) {
      console.error('Error reprogramando:', err)
      setError('Error procesando tu solicitud.')
      setRescheduling(false)
    }
  }

  // ── LOADING ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Procesando tu solicitud...</p>
        </div>
      </div>
    )
  }

  // ── ERROR ──
  if (error && !success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex justify-center mb-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Error
          </h1>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/login')}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Ir al Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CANCELLATION SUCCESS ──
  if (success && action === 'cancel') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Reserva Cancelada
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Tu reserva ha sido cancelada exitosamente.
          </p>
          
          {booking && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatSlotDateTime(booking.slot_datetime, true)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_email}</span>
              </div>
            </div>
          )}

          <p className="text-gray-600 text-sm text-center mb-6">
            Se ha enviado una confirmación de cancelación a tu correo.
          </p>

          <button
            onClick={() => navigate('/')}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Volver al Inicio
          </button>
        </div>
      </div>
    )
  }

  // ── RESCHEDULE VIEW ──
  if (action === 'reschedule' && booking && event) {
    if (rescheduling) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Guardando los cambios...</p>
          </div>
        </div>
      )
    }

    if (success) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Reprogramación Exitosa
            </h1>
            <p className="text-gray-600 text-center mb-6">
              Tu reserva ha sido reprogramada exitosamente.
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatSlotDateTime(booking.slot_datetime, true)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="w-4 h-4 text-gray-500" />
                <span>{booking.attendee_name}</span>
              </div>
            </div>

            <p className="text-gray-600 text-sm text-center mb-6">
              Se ha enviado una confirmación de reprogramación a tu correo con los nuevos detalles.
            </p>

            <button
              onClick={() => navigate('/')}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      )
    }

    // Show slot selection
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Reprogramar Reserva
            </h1>
            <p className="text-gray-600 mb-6">
              Selecciona una nueva fecha y hora para tu reserva con {event.title}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                  Hora Actual
                </p>
                <p className="font-semibold text-gray-900">
                  {formatSlotDateTime(booking.slot_datetime, true)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                  Asistente
                </p>
                <p className="font-semibold text-gray-900">
                  {booking.attendee_name}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Selecciona una Nueva Hora
              </h2>
              
              {slots.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                  <p className="text-gray-600">
                    No hay horarios disponibles en este momento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {slots.map((slot) => (
                    <button
                      key={slot.datetime}
                      onClick={() => setSelectedSlot(slot.datetime)}
                      className={`p-3 rounded-lg border-2 transition font-medium ${
                        selectedSlot === slot.datetime
                          ? 'border-primary-600 bg-primary-50 text-primary-900'
                          : 'border-gray-200 hover:border-primary-300 text-gray-900'
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

              <button
                onClick={handleRescheduleSubmit}
                disabled={!selectedSlot}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition ${
                  selectedSlot
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Confirmar Nueva Fecha
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
