import { supabase } from './supabase'
import type { AvailabilityRule, DateOverride } from '../types'

/** Carga las reglas de horario adicionales y las excepciones por fecha de un evento. */
export async function loadAvailability(eventId: string): Promise<{
  rules: AvailabilityRule[]
  overrides: DateOverride[]
}> {
  const [rulesRes, overridesRes] = await Promise.all([
    supabase.from('event_availability_rules').select('*').eq('event_id', eventId),
    supabase.from('event_date_overrides').select('*').eq('event_id', eventId),
  ])

  return {
    rules: (rulesRes.data as AvailabilityRule[]) ?? [],
    overrides: (overridesRes.data as DateOverride[]) ?? [],
  }
}
