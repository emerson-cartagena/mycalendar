import { parseISO, isBefore, isAfter, startOfDay } from 'date-fns'
import type { Event, EventStatus } from '../types'

export function getEventStatus(event: Event): EventStatus {
  const now = new Date()
  const today = startOfDay(now)
  const startDate = startOfDay(parseISO(event.date_start))
  // Combinar fecha y hora de fin para comparar el momento exacto
  const endDateTime = new Date(`${event.date_end}T${event.time_end}`)

  if (isBefore(endDateTime, now)) {
    return 'past'
  }

  if (isAfter(startDate, today)) {
    return 'future'
  }

  return 'active'
}

export function canEditEvent(event: Event): boolean {
  const status = getEventStatus(event)
  return status !== 'past'
}

export function getEditRestrictions(event: Event) {
  const status = getEventStatus(event)

  if (status === 'future') {
    return {
      canChangeStartDate: true,
      canChangeEndDate: true,
      canChangeWeekdays: true,
      affectsExisting: false,
      message: ''
    }
  }

  if (status === 'active') {
    return {
      canChangeStartDate: false,
      canChangeEndDate: true,
      canChangeWeekdays: true,
      affectsExisting: true,
      message: '⚠️ Cambios en fechas y días solo afectarán a reservas futuras, no a las existentes. Debes reprogramar manualmente si quieres cambiar reservas actuales.'
    }
  }

  return {
    canChangeStartDate: false,
    canChangeEndDate: false,
    canChangeWeekdays: false,
    affectsExisting: false,
    message: 'Este evento ya pasó y no puede ser editado.'
  }
}
