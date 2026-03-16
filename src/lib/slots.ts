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
import type { Event, Slot, Booking } from '../types'

/**
 * Genera todos los slots disponibles para un evento dado el listado de
 * reservas ya existentes (slot_datetime strings).
 */
export function generateSlots(event: Event, bookedDatetimes: string[] | Booking[]): Slot[] {
  // Normalizar input: si es Booking[], extraer los slot_datetime
  const dateStrings = isBookingArray(bookedDatetimes)
    ? bookedDatetimes.map(b => b.slot_datetime)
    : bookedDatetimes
  
  const bookedSet = new Set(dateStrings)

  const days = eachDayOfInterval({
    start: parseISO(event.date_start),
    end: parseISO(event.date_end),
  })

  const slots: Slot[] = []

  for (const day of days) {
    const weekday = getDay(day) // 0=domingo … 6=sábado
    if (!event.weekdays.includes(weekday as 0)) continue

    const [startH, startM] = event.time_start.split(':').map(Number)
    const [endH, endM] = event.time_end.split(':').map(Number)

    const dayStr = format(day, 'yyyy-MM-dd')

    let cursor = new Date(`${dayStr}T${pad(startH)}:${pad(startM)}:00`)
    const endTime = new Date(`${dayStr}T${pad(endH)}:${pad(endM)}:00`)

    while (isBefore(cursor, endTime) || isEqual(cursor, endTime)) {
      const next = addMinutes(cursor, event.slot_duration_minutes)
      if (isBefore(endTime, next)) break // el último slot no cabe completo

      const isoLocal = format(cursor, "yyyy-MM-dd'T'HH:mm:ss")
      const label = format(cursor, "EEE d MMM · h:mm aa", { locale: es })

      slots.push({
        datetime: isoLocal,
        label,
        available: !bookedSet.has(isoLocal),
      })

      cursor = next
    }
  }

  return slots
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Type guard para verificar si es Booking[]
function isBookingArray(arr: any[]): arr is Booking[] {
  return arr.length > 0 && 'slot_datetime' in arr[0]
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
