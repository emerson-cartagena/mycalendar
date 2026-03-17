import { useState } from 'react'
import { X, Calendar, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateSlots } from '../lib/slots'
import type { Booking, Event, Slot } from '../types'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Props {
  booking: Booking
  event: Event
  otherBookings: Booking[]
  onClose: () => void
  onUpdated: () => void
}

type Action = 'reschedule' | 'cancel' | null

export default function BookingActionsModal({ booking, event, otherBookings, onClose, onUpdated }: Props) {
  const { user } = useAuth()
  const [action, setAction] = useState<Action>(null)
  const [reason, setReason] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(false)

  // Validar que el usuario sea el propietario del evento o admin
  const canManage = user && (user.id === event.user_id || user.role === 'admin')

  if (!canManage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Acceso denegado</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="p-4">
            <p className="text-gray-600 text-sm">No tienes permiso para gestionar esta reserva.</p>
          </div>
        </div>
      </div>
    )
  }

  const slots = generateSlots(event, otherBookings.map(b => b.slot_datetime))
  const availableSlots = slots.filter(s => s.available && s.datetime !== booking.slot_datetime)

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot || !reason.trim()) return

    setLoading(true)
    try {
      // Crear un registro de cambio
      await supabase.from('booking_changes').insert({
        booking_id: booking.id,
        change_type: 'reschedule',
        old_slot_datetime: booking.slot_datetime,
        new_slot_datetime: selectedSlot.datetime,
        reason: reason.trim(),
        created_by: user!.id,
      })

      // Actualizar la reserva
      await supabase
        .from('bookings')
        .update({ slot_datetime: selectedSlot.datetime, status: 'rescheduled' })
        .eq('id', booking.id)

      // Obtener email del owner
      const { data: eventData } = await supabase
        .from('events')
        .select('user_id, location_url')
        .eq('id', event.id)
        .single()

      if (eventData) {
        const { data: ownerData } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('id', eventData.user_id)
          .single()

        if (ownerData) {
          // Enviar email de reprogramación
          try {
            await fetch(
              'https://vrggahqfapozygajklaj.functions.supabase.co/send-booking-email',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  ownerEmail: ownerData.email,
                  ownerName: ownerData.full_name || 'Organizador',
                  attendeeName: booking.attendee_name,
                  attendeeEmail: booking.attendee_email,
                  eventTitle: event.title,
                  eventId: event.id,
                  locationUrl: eventData.location_url,
                  type: 'reschedule',
                  reason: reason.trim(),
                  oldSlot: booking.slot_datetime,
                  newSlot: selectedSlot.datetime,
                  originatedFrom: 'owner',
                  extraGuests: booking.extra_guests,
                }),
              }
            )
          } catch (emailErr) {
            console.error('Error sending reschedule email:', emailErr)
          }
        }
      }

      toast.success('Reserva reprogramada. Se envió notificación.')
      onUpdated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Error al reprogramar')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return

    setLoading(true)
    try {
      // Crear registro de cambio
      await supabase.from('booking_changes').insert({
        booking_id: booking.id,
        change_type: 'cancel',
        old_slot_datetime: booking.slot_datetime,
        new_slot_datetime: null,
        reason: reason.trim(),
        created_by: user!.id,
      })

      // Cancelar la reserva
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_reason: reason.trim(),
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      // Obtener email del owner
      const { data: eventData } = await supabase
        .from('events')
        .select('user_id')
        .eq('id', event.id)
        .single()

      if (eventData) {
        const { data: ownerData } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('id', eventData.user_id)
          .single()

        if (ownerData) {
          // Enviar email de cancelación
          try {
            await fetch(
              'https://vrggahqfapozygajklaj.functions.supabase.co/send-booking-email',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  ownerEmail: ownerData.email,
                  ownerName: ownerData.full_name || 'Organizador',
                  attendeeName: booking.attendee_name,
                  attendeeEmail: booking.attendee_email,
                  eventTitle: event.title,
                  eventId: event.id,
                  type: 'cancel',
                  reason: reason.trim(),
                  slot: booking.slot_datetime,
                  originatedFrom: 'owner',
                  extraGuests: booking.extra_guests,
                }),
              }
            )
          } catch (emailErr) {
            console.error('Error sending cancel email:', emailErr)
          }
        }
      }

      toast.success('Reserva cancelada. Se envió notificación.')
      onUpdated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Error al cancelar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Gestionar reserva</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
            <p className="font-medium text-gray-900">{booking.attendee_name}</p>
            <p className="text-gray-600">{booking.attendee_email}</p>
            <p className="text-primary-600 mt-1">
              {format(parseISO(booking.slot_datetime), "EEE d MMM · h:mm aa", { locale: es })}
            </p>
          </div>

          {action === null && (
            <div className="space-y-3">
              <button
                onClick={() => setAction('reschedule')}
                className="w-full py-2.5 px-3 rounded-lg border border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100 font-medium text-sm flex items-center justify-center gap-2"
              >
                <Calendar size={16} /> Reprogramar
              </button>
              <button
                onClick={() => setAction('cancel')}
                className="w-full py-2.5 px-3 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-medium text-sm flex items-center justify-center gap-2"
              >
                <XCircle size={16} /> Cancelar
              </button>
            </div>
          )}

          {action === 'reschedule' && (
            <form onSubmit={handleReschedule} className="space-y-3">
              <div>
                <label className="label text-sm">Nuevo horario</label>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {availableSlots.map(s => (
                    <button
                      key={s.datetime}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className={`py-2 px-2 rounded text-xs font-medium border transition-colors flex flex-col items-center gap-1 ${
                        selectedSlot?.datetime === s.datetime
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 bg-white hover:border-primary-300'
                      }`}
                    >
                      <span className="text-xs">{format(parseISO(s.datetime), 'EEE d MMM', { locale: es })}</span>
                      <span className="font-bold">{format(parseISO(s.datetime), 'h:mm aa', { locale: es })}</span>
                    </button>
                  ))}
                </div>
                {availableSlots.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No hay horarios disponibles</p>
                )}
              </div>

              <div>
                <label className="label text-sm">Motivo <span className="text-red-500">*</span></label>
                <textarea
                  className="input text-sm resize-none"
                  rows={2}
                  placeholder="Ej: Cambio de hora del organizador..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!selectedSlot || !reason.trim() || loading}
                  className="btn-primary text-sm py-1.5 flex-1"
                >
                  {loading ? 'Guardando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAction(null); setReason(''); setSelectedSlot(null) }}
                  className="btn-secondary text-sm py-1.5 flex-1"
                >
                  Atrás
                </button>
              </div>
            </form>
          )}

          {action === 'cancel' && (
            <form onSubmit={handleCancel} className="space-y-3">
              <div>
                <label className="label text-sm">Motivo de cancelación <span className="text-red-500">*</span></label>
                <textarea
                  className="input text-sm resize-none"
                  rows={3}
                  placeholder="Ej: El evento fue pospuesto..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                />
              </div>

              <p className="text-xs text-gray-500">
                El asistente recibirá una notificación con el motivo de la cancelación.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!reason.trim() || loading}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-1.5 rounded text-sm transition-colors flex-1"
                >
                  {loading ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAction(null); setReason('') }}
                  className="btn-secondary text-sm py-1.5 flex-1"
                >
                  Atrás
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
