import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateSlots } from '../lib/slots'
import { loadAvailability } from '../lib/availability'
import BookingWidget from '../components/BookingWidget'
import type { Event, Booking, AvailabilityRule, DateOverride } from '../types'

export default function BookingPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [overrides, setOverrides] = useState<DateOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!eventSlug) return
    loadEvent()
  }, [eventSlug])

  async function loadEvent() {
    setLoading(true)
    const { data: ev, error } = await supabase
      .from('events')
      .select('*')
      .eq('slug', eventSlug)
      .single()

    if (error || !ev) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setEvent(ev as Event)

    const { data: bk } = await supabase
      .from('bookings')
      .select('*')
      .eq('event_id', ev.id)
      .eq('status', 'confirmed')
    setBookings((bk as Booking[]) ?? [])

    const { rules, overrides } = await loadAvailability(ev.id)
    setRules(rules)
    setOverrides(overrides)

    setLoading(false)

    // Suscripción en tiempo real: si alguien reserva mientras estamos en la página
    const channel = supabase
      .channel(`bookings-public-${ev.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `event_id=eq.${ev.id} AND status=eq.confirmed`,
      }, payload => {
        setBookings(prev => [...prev, payload.new as Booking])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `event_id=eq.${ev.id}`,
      }, payload => {
        const booking = payload.new as Booking
        if (booking.status === 'confirmed') {
          setBookings(prev => [...prev, booking])
        } else if (booking.status === 'cancelled' || booking.status === 'rescheduled') {
          setBookings(prev => prev.filter(b => b.id !== booking.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }

  function onBooked(booking: Booking) {
    setBookings(prev => [...prev, booking])
  }

  if (loading) return <PageLoader />
  if (notFound || !event) return <NotFound />

  const slots = generateSlots(event, bookings.map(b => b.slot_datetime), rules, overrides)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <Calendar className="text-primary-600" size={22} />
          <span className="font-bold text-lg text-gray-900">MyCalendar</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <BookingWidget event={event} slots={slots} onBooked={onBooked} />
      </main>
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
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Este evento no existe o ha vencido.</p>
    </div>
  )
}
