-- Reglas de horario adicionales y excepciones por fecha para eventos.
-- El horario "base" del evento sigue viviendo en events.weekdays/time_start/time_end
-- (no se migra nada). Esto solo agrega:
--   1. event_availability_rules: horarios extra (ej. sábados 1-5pm, o un día suelto)
--   2. event_date_overrides: excepción puntual para una fecha exacta (horario distinto o bloqueo)

create table if not exists public.event_availability_rules (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id) on delete cascade,
  weekdays                int[] not null,          -- array de 0-6 (0=dom ... 6=sab)
  time_start              time not null,
  time_end                time not null,
  slot_duration_minutes   int not null check (slot_duration_minutes > 0),
  date_start              date,                     -- null = usa el rango del evento
  date_end                date,                     -- null = usa el rango del evento
  created_at              timestamptz default now()
);

create table if not exists public.event_date_overrides (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id) on delete cascade,
  date                    date not null,
  is_blocked              boolean not null default false,
  time_start              time,                     -- null si is_blocked = true
  time_end                time,
  slot_duration_minutes   int check (slot_duration_minutes > 0),
  created_at              timestamptz default now(),
  unique (event_id, date)
);

create index if not exists idx_event_availability_rules_event_id on public.event_availability_rules(event_id);
create index if not exists idx_event_date_overrides_event_id on public.event_date_overrides(event_id);

-- RLS: mismo patrón permisivo que events/bookings (validación en frontend)
alter table public.event_availability_rules enable row level security;
alter table public.event_date_overrides enable row level security;

create policy "event_availability_rules_select_public"
  on public.event_availability_rules for select using (true);
create policy "event_availability_rules_insert"
  on public.event_availability_rules for insert with check (true);
create policy "event_availability_rules_update"
  on public.event_availability_rules for update using (true);
create policy "event_availability_rules_delete"
  on public.event_availability_rules for delete using (true);

create policy "event_date_overrides_select_public"
  on public.event_date_overrides for select using (true);
create policy "event_date_overrides_insert"
  on public.event_date_overrides for insert with check (true);
create policy "event_date_overrides_update"
  on public.event_date_overrides for update using (true);
create policy "event_date_overrides_delete"
  on public.event_date_overrides for delete using (true);
