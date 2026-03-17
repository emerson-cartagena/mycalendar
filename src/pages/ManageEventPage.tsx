import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, Users, Clock, CheckCircle, MoreVertical, Edit2, ArrowLeft, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import { generateSlots, WEEKDAY_LABELS } from '../lib/slots'
import BookingActionsModal from '../components/BookingActionsModal'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Event, Booking } from '../types'

interface UserInfo {
  id: string
  email: string
}

export default function ManageEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [eventOwner, setEventOwner] = useState<UserInfo | null>(null)

  const publicUrl = event ? `${window.location.origin}/book/${event.slug}` : ''
  const embedUrl  = event ? `${window.location.origin}/embed/${event.slug}` : ''
  const embedCode = event ? `<iframe src="${embedUrl}" width="100%" height="700" frameborder="0" allow="fullscreen"></iframe>` : ''

  useEffect(() => {
    if (!eventId || !user) return
    loadData()
    const channel = supabase
      .channel(`bookings-manage-${eventId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `event_id=eq.${eventId}`,
      }, payload => {
        setBookings(prev => [...prev, payload.new as Booking])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `event_id=eq.${eventId}`,
      }, payload => {
        setBookings(prev => prev.map(b => b.id === payload.new.id ? (payload.new as Booking) : b))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, user])

  async function loadData() {
    setLoading(true)
    const [{ data: ev }, { data: bk }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('bookings').select('*').eq('event_id', eventId).order('slot_datetime'),
    ])
    
    if (ev) {
      const event = ev as Event
      // Verificar permisos
      if (user?.role !== 'admin' && event.user_id !== user?.id) {
        toast.error('No tienes permiso')
        setEvent(null)
      } else {
        setEvent(event)
        // Cargar info del owner si eres admin
        if (user?.role === 'admin') {
          const { data: ownerData } = await supabase
            .from('users')
            .select('id, email')
            .eq('id', event.user_id)
            .single()
          if (ownerData) {
            setEventOwner(ownerData as UserInfo)
          }
        }
      }
    }
    if (bk) setBookings(bk as Booking[])
    setLoading(false)
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  }

  async function handleDeleteEvent() {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

      if (error) throw error
      toast.success('Evento eliminado')
      navigate('/dashboard')
    } catch (err) {
      console.error(err)
      toast.error('Error al eliminar evento')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <PageLoader />
  if (!event) return <NotFound />

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed')
  const slots      = generateSlots(event, confirmedBookings.map(b => b.slot_datetime))
  const totalSlots = slots.length
  const booked     = confirmedBookings.length

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
        >
          <ArrowLeft size={18} /> Volver a dashboard
        </button>

        {/* Título y resumen */}
        <div className="card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
              {event.description && <p className="text-gray-500 mt-1">{event.description}</p>}
              {user?.role === 'admin' && (
                <p className="text-sm text-gray-500 mt-2">
                  Organizado por: <span className="font-medium">{eventOwner?.email || event.user_id}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {format(parseISO(event.date_start), 'd MMM', { locale: es })} –{' '}
                  {format(parseISO(event.date_end), 'd MMM yyyy', { locale: es })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} />{event.time_start} – {event.time_end}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} />{event.slot_duration_minutes} min por reunión
                </span>
                <span>
                  Días: {event.weekdays.map(d => WEEKDAY_LABELS[d]).join(', ')}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="flex gap-2">
                <Stat label="Slots totales" value={totalSlots} />
                <Stat label="Reservados" value={booked} color="text-primary-600" />
                <Stat label="Disponibles" value={totalSlots - booked} color="text-green-600" />
              </div>
              <div className="flex gap-2">
                <Link to={`/edit/${eventId}`} className="btn-secondary text-sm flex items-center gap-1 whitespace-nowrap">
                  <Edit2 size={14} /> Editar
                </Link>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Links para compartir */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">Compartir evento</h2>

          <LinkRow label="Enlace público" value={publicUrl}
            onCopy={() => copy(publicUrl, 'Enlace')}
            href={publicUrl} />

          <div>
            <p className="text-sm text-gray-600 mb-1 font-medium">Código para incrustar (iframe)</p>
            <div className="flex gap-2 items-start">
              <textarea
                readOnly
                rows={2}
                className="input text-xs font-mono resize-none flex-1"
                value={embedCode}
              />
              <button onClick={() => copy(embedCode, 'Código iframe')} className="btn-secondary flex-shrink-0">
                <Copy size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Lista de reservas */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users size={18} className="text-primary-600" /> Reservas ({confirmedBookings.length})
          </h2>

          {confirmedBookings.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aún no hay reservas.</p>
          ) : (
            <div className="space-y-3">
              {confirmedBookings.map(b => (
                <div key={b.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg justify-between group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                      <p className="font-medium text-sm text-gray-900">{b.attendee_name}</p>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">{b.attendee_email}</p>
                    {b.extra_guests.length > 0 && (
                      <p className="text-xs text-gray-400 ml-6 mt-0.5">
                        +{b.extra_guests.length} invitado(s): {b.extra_guests.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 flex-shrink-0 text-right mr-2">
                    {format(parseISO(b.slot_datetime), "EEE d MMM · h:mm aa", { locale: es })}
                  </div>
                  <button
                    onClick={() => setSelectedBooking(b)}
                    className="text-gray-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Reservas canceladas */}
          {bookings.filter(b => b.status === 'cancelled').length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Canceladas</p>
              <div className="space-y-2">
                {bookings.filter(b => b.status === 'cancelled').map(b => (
                  <div key={b.id} className="text-xs text-gray-400 bg-gray-50 p-2 rounded line-through">
                    {b.attendee_name} • {format(parseISO(b.slot_datetime), "d MMM h:mm aa", { locale: es })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal de acciones */}
      {selectedBooking && (
        <BookingActionsModal
          booking={selectedBooking}
          event={event}
          otherBookings={bookings.filter(b => b.id !== selectedBooking.id)}
          onClose={() => setSelectedBooking(null)}
          onUpdated={loadData}
        />
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar evento?</h3>
              <p className="text-gray-600 text-sm mb-4">
                Se eliminarán el evento "{event?.title}" y todas sus reservas. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteEvent}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? '...' : <>
                    <Trash2 size={16} />
                    Eliminar
                  </>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-2 min-w-[70px]">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function LinkRow({ label, value, onCopy, href }: { label: string; value: string; onCopy: () => void; href: string }) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-1 font-medium">{label}</p>
      <div className="flex gap-2">
        <input readOnly className="input text-sm flex-1" value={value} />
        <button onClick={onCopy} className="btn-secondary"><Copy size={15} /></button>
        <a href={href} target="_blank" rel="noreferrer" className="btn-secondary">
          <ExternalLink size={15} />
        </a>
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-gray-500">Evento no encontrado.</p>
      <Link to="/" className="btn-primary">Crear nuevo evento</Link>
    </div>
  )
}
