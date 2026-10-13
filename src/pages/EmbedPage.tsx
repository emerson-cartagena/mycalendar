import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateSlots } from '../lib/slots'
import { loadAvailability } from '../lib/availability'
import { usePublicTheme } from '../lib/usePublicTheme'
import BookingWidget from '../components/BookingWidget'
import type { Event, Booking, AvailabilityRule, DateOverride } from '../types'

/**
 * Versión sin header/footer, pensada para incrustar vía <iframe>.
 * También establece X-Frame-Options: ALLOWALL en vercel.json.
 */
export default function EmbedPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const { isDark, toggle } = usePublicTheme()
  const [event, setEvent] = useState<Event | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [overrides, setOverrides] = useState<DateOverride[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventSlug) return
    loadEvent()
  }, [eventSlug])

  async function loadEvent() {
    const { data: ev } = await supabase
      .from('events').select('*').eq('slug', eventSlug).single()
    if (!ev) { setLoading(false); return }
    setEvent(ev as Event)

    const { data: bk } = await supabase
      .from('bookings').select('*').eq('event_id', ev.id).eq('status', 'confirmed')
    setBookings((bk as Booking[]) ?? [])

    const { rules, overrides } = await loadAvailability(ev.id)
    setRules(rules)
    setOverrides(overrides)

    setLoading(false)

    const channel = supabase
      .channel(`bookings-embed-${ev.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bookings',
        filter: `event_id=eq.${ev.id}`,
      }, payload => { setBookings(prev => [...prev, payload.new as Booking]) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }
  if (!event) return <p className="p-4 text-gray-500 text-sm dark:text-gray-400">Evento no encontrado.</p>

  const slots = generateSlots(event, bookings.map(b => b.slot_datetime), rules, overrides)

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="bg-white min-h-screen p-4 dark:bg-gray-900">
        <div className="flex justify-end mb-2">
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-700 transition-colors"
            aria-label="Cambiar tema"
            title="Cambiar tema"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <BookingWidget
          event={event}
          slots={slots}
          onBooked={b => setBookings(prev => [...prev, b])}
          embedded
        />
      </div>
    </div>
  )
}
