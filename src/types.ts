export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0=domingo, 1=lunes ... 6=sábado
export type UserRole = 'admin' | 'user'
export type BookingStatus = 'confirmed' | 'cancelled' | 'rescheduled'
export type ChangeType = 'reschedule' | 'cancel'

export interface User {
  id: string
  email: string
  role: UserRole
  created_at: string
}

export interface Event {
  id: string
  user_id: string
  slug: string
  title: string
  description: string | null
  location_url: string | null
  date_start: string            // YYYY-MM-DD
  date_end: string              // YYYY-MM-DD
  time_start: string            // HH:mm  (hora local SV, GMT-6)
  time_end: string              // HH:mm
  slot_duration_minutes: number
  weekdays: Weekday[]
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  event_id: string
  user_id: string | null
  slot_datetime: string         // ISO datetime local SV  e.g. "2026-03-17T17:00:00"
  attendee_name: string
  attendee_email: string
  extra_guests: string[]
  status: BookingStatus
  cancelled_reason: string | null
  cancelled_at: string | null
  created_at: string
}

// Horario adicional de un evento (ej. "sábados 1-5pm" o "solo este domingo 8-12")
export interface AvailabilityRule {
  id: string
  event_id: string
  weekdays: Weekday[]
  time_start: string            // HH:mm
  time_end: string              // HH:mm
  slot_duration_minutes: number
  date_start: string | null     // YYYY-MM-DD, null = usa el rango del evento
  date_end: string | null       // YYYY-MM-DD, null = usa el rango del evento
  created_at: string
}

// Excepción para una fecha exacta: horario distinto, o bloqueo total del día
export interface DateOverride {
  id: string
  event_id: string
  date: string                  // YYYY-MM-DD
  is_blocked: boolean
  time_start: string | null     // null si is_blocked
  time_end: string | null
  slot_duration_minutes: number | null
  created_at: string
}

export interface BookingChange {
  id: string
  booking_id: string
  change_type: ChangeType
  old_slot_datetime: string
  new_slot_datetime: string | null
  reason: string
  created_by: string
  created_at: string
}

// Slot calculado en el frontend (no guardado en BD directamente)
export interface Slot {
  datetime: string   // "2026-03-17T17:00:00"
  label: string      // "Mar 17 Mar · 5:00 PM"
  available: boolean
}

// Estados de un evento (calculado según fecha)
export type EventStatus = 'past' | 'active' | 'future'
