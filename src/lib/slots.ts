import {
  eachDayOfInterval,
  parseISO,
  getDay,
  format,
  addMinutes,
  isBefore,
  isEqual,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { Event, Slot, Booking, AvailabilityRule, DateOverride } from '../types'

// Minutos mínimos antes del inicio para permitir una reserva
const BOOKING_ADVANCE_MINUTES = 5

interface TimeRange {
  time_start: string
  time_end: string
  slot_duration_minutes: number
}

/**
 * Genera todos los slots disponibles para un evento dado el listado de
 * reservas ya existentes (slot_datetime strings), reglas de horario
 * adicionales y excepciones por fecha.
 * No muestra slots que ya han comenzado o que faltan menos de BOOKING_ADVANCE_MINUTES para comenzar.
 */
export function generateSlots(
  event: Event,
  bookedDatetimes: string[] | Booking[],
  rules: AvailabilityRule[] = [],
  overrides: DateOverride[] = []
): Slot[] {
  // Normalizar input: si es Booking[], extraer los slot_datetime
  const dateStrings = isBookingArray(bookedDatetimes)
    ? bookedDatetimes.map(b => b.slot_datetime)
    : bookedDatetimes

  const bookedSet = new Set(dateStrings)
  const now = new Date()

  const days = eachDayOfInterval({
    start: parseISO(event.date_start),
    end: parseISO(event.date_end),
  })

  const overrideByDate = new Map(overrides.map(o => [o.date, o]))

  const slots: Slot[] = []

  for (const day of days) {
    const weekday = getDay(day) as 0 | 1 | 2 | 3 | 4 | 5 | 6
    const dayStr = format(day, 'yyyy-MM-dd')

    const override = overrideByDate.get(dayStr)

    let ranges: TimeRange[]

    if (override) {
      if (override.is_blocked) continue
      ranges = [{
        time_start: override.time_start!,
        time_end: override.time_end!,
        slot_duration_minutes: override.slot_duration_minutes ?? event.slot_duration_minutes,
      }]
    } else {
      ranges = []

      // Regla base del evento
      if (event.weekdays.includes(weekday)) {
        ranges.push({
          time_start: event.time_start,
          time_end: event.time_end,
          slot_duration_minutes: event.slot_duration_minutes,
        })
      }

      // Reglas adicionales que apliquen a este día
      for (const rule of rules) {
        if (!rule.weekdays.includes(weekday)) continue
        if (rule.date_start && dayStr < rule.date_start) continue
        if (rule.date_end && dayStr > rule.date_end) continue
        ranges.push({
          time_start: rule.time_start,
          time_end: rule.time_end,
          slot_duration_minutes: rule.slot_duration_minutes,
        })
      }
    }

    for (const range of ranges) {
      slots.push(...slotsForRange(dayStr, range, bookedSet, now))
    }
  }

  slots.sort((a, b) => a.datetime.localeCompare(b.datetime))

  return slots
}

function slotsForRange(
  dayStr: string,
  range: TimeRange,
  bookedSet: Set<string>,
  now: Date
): Slot[] {
  const [startH, startM] = range.time_start.split(':').map(Number)
  const [endH, endM] = range.time_end.split(':').map(Number)

  let cursor = new Date(`${dayStr}T${pad(startH)}:${pad(startM)}:00`)
  const endTime = new Date(`${dayStr}T${pad(endH)}:${pad(endM)}:00`)

  const out: Slot[] = []

  while (isBefore(cursor, endTime) || isEqual(cursor, endTime)) {
    const next = addMinutes(cursor, range.slot_duration_minutes)
    if (isBefore(endTime, next)) break // el último slot no cabe completo

    const minTimeToBook = addMinutes(now, BOOKING_ADVANCE_MINUTES)
    const isPast = isBefore(cursor, minTimeToBook)

    const isoLocal = format(cursor, "yyyy-MM-dd'T'HH:mm:ss")
    const label = format(cursor, "EEE d MMM · h:mm aa", { locale: es })

    out.push({
      datetime: isoLocal,
      label,
      available: !bookedSet.has(isoLocal) && !isPast,
    })

    cursor = next
  }

  return out
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Type guard para verificar si es Booking[]
function isBookingArray(arr: any[]): arr is Booking[] {
  if (!Array.isArray(arr) || arr.length === 0) return false
  const first = arr[0]
  return typeof first === 'object' && first !== null && 'slot_datetime' in first
}

/** Genera un slug URL-friendly a partir de un título */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

export const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export const SLOT_DURATIONS = [
  { label: '15 minutos', value: 15 },
  { label: '30 minutos', value: 30 },
  { label: '45 minutos', value: 45 },
  { label: '1 hora', value: 60 },
  { label: '1.5 horas', value: 90 },
  { label: '2 horas', value: 120 },
  { label: '3 horas', value: 180 },
]

/**
 * Formatea un slot_datetime ISO a un string legible
 * Ejemplos:
 * - detailed=true: "Mar 17 Mar · 5:00 PM"
 * - detailed=false: "5:00 PM"
 */
export function formatSlotDateTime(isoString: string, detailed: boolean = true): string {
  try {
    const date = parseISO(isoString)
    if (detailed) {
      return format(date, "EEE d MMM · h:mm aa", { locale: es })
    } else {
      return format(date, "h:mm aa", { locale: es })
    }
  } catch (e) {
    return isoString
  }
}
