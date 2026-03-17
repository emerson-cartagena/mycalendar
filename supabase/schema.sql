-- ============================================================
--  MyCalendar – Schema para Supabase (PostgreSQL)
--  Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensión para UUID
create extension if not exists "pgcrypto";

-- ── Tabla: users ────────────────────────────────────────────
-- Usuarios para login (tabla personalizada, no uses auth.users)
-- Las contraseñas se encriptan con bcryptjs en el frontend
create table if not exists public.users (
  id        uuid primary key default gen_random_uuid(),
  email     text not null unique,
  password  text not null,  -- bcryptjs hash (ej: $2b$10$...)
  full_name text,           -- nombre completo del usuario
  role      text not null check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

-- ── Tabla: events ────────────────────────────────────────────
create table if not exists public.events (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  slug                    text not null unique,
  title                   text not null,
  description             text,
  location_url            text,  -- opcional: Meet, Teams, Zoom, etc.
  date_start              date not null,
  date_end                date not null,
  time_start              time not null,        -- hora local SV (GMT-6)
  time_end                time not null,
  slot_duration_minutes   int  not null check (slot_duration_minutes > 0),
  weekdays                int[] not null,       -- array de 0-6 (0=dom, 1=lun, ..., 6=sab)
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ── Tabla: bookings ──────────────────────────────────────────
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  user_id          uuid references public.users(id),  -- quien hizo la reserva (puede ser null si es anónimo)
  slot_datetime    text not null,               -- "2026-03-17T17:00:00" (local SV, ISO 8601)
  attendee_name    text not null,
  attendee_email   text not null,
  extra_guests     text[] not null default '{}',  -- array de emails adicionales
  status           text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'rescheduled')),
  cancelled_reason text,
  cancelled_at     timestamptz,
  created_at       timestamptz default now()
);

-- Índice único parcial: email único por evento (solo para reservas confirmadas)
-- Esto evita que el mismo email reserve 2 veces el mismo evento
create unique index if not exists idx_unique_email_per_event 
  on public.bookings(event_id, attendee_email) 
  where status = 'confirmed';

-- ── Tabla: booking_changes ────────────────────────────────────────────
-- Historial de reprogramaciones/cancelaciones de reservas
create table if not exists public.booking_changes (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  change_type       text not null check (change_type in ('reschedule', 'cancel')),
  old_slot_datetime text not null,  -- slot anterior
  new_slot_datetime text,            -- slot nuevo (null si es cancel)
  reason            text not null,   -- razón de la reprogramación/cancelación
  created_by        uuid not null references public.users(id),  -- quién hizo el cambio
  created_at        timestamptz default now()
);

-- ── Tabla: booking_tokens ────────────────────────────────────────────
-- Tokens seguros para acciones desde email (cancel/reschedule)
create table if not exists public.booking_tokens (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  token            text not null unique,           -- hash aleatorio seguro
  action_type      text not null check (action_type in ('cancel', 'reschedule')),
  expires_at       timestamptz not null,           -- válido por 30 días
  used_at          timestamptz,                    -- NULL hasta que se usa
  created_at       timestamptz default now()
);

-- ── Índices útiles ──────────────────────────────────────────
create index if not exists idx_bookings_event_id on public.bookings(event_id);
create index if not exists idx_bookings_email on public.bookings(attendee_email);
create index if not exists idx_events_user_id on public.events(user_id);
create index if not exists idx_events_slug on public.events(slug);
create index if not exists idx_booking_changes_booking_id on public.booking_changes(booking_id);
create index if not exists idx_booking_tokens_token on public.booking_tokens(token);
create index if not exists idx_booking_tokens_booking_id on public.booking_tokens(booking_id);

-- ── Row Level Security (RLS) ────────────────────────────────
-- RLS deshabilitado en users (tabla completamente pública en lectura)
-- Habilitado en las otras tablas para seguridad
alter table public.users disable row level security;

-- Crear política pública de lectura para users (por si acaso)
drop policy if exists "users_select_public" on public.users;
create policy "users_select_public" on public.users
  for select using (true);

alter table public.events enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_changes enable row level security;
alter table public.booking_tokens enable row level security;

-- USERS: Sin RLS (validación en frontend con AuthContext)

-- EVENTS:
--   - SELECT: Público (necesario para /book/:slug), o propietario, o admin
--   - INSERT: Permitido para cualquiera (frontend valida user_id)
--   - UPDATE: Solo propietario o admin
--   - DELETE: Permitido para cualquiera (frontend valida permisos)
create policy "events_select_public"
  on public.events for select
  using (true);  -- Público puede ver todos los eventos para /book/:slug

create policy "events_insert"
  on public.events for insert
  with check (true);  -- Frontend valida user_id

create policy "events_update_owner"
  on public.events for update
  using (true);  -- Frontend valida permisos

create policy "events_delete_owner"
  on public.events for delete
  using (true);  -- Frontend valida permisos

-- BOOKINGS:
--   - SELECT: Público para calcular disponibilidad, o propietario del evento, o admin
--   - INSERT: Público (cualquiera puede reservar)
--   - UPDATE: Solo propietario del evento o admin
create policy "bookings_select_public"
  on public.bookings for select
  using (true);  -- Público para calcular slots disponibles

create policy "bookings_insert_public"
  on public.bookings for insert
  with check (true);  -- Público puede crear reservas

create policy "bookings_update_public"
  on public.bookings for update
  using (true);  -- Permisivo: validación en frontend

-- BOOKING_CHANGES:
--   - SELECT: Público (validación en frontend)
--   - INSERT: Público (validación en frontend)
create policy "booking_changes_select"
  on public.booking_changes for select
  using (true);  -- Permisivo: validación en frontend

create policy "booking_changes_insert"
  on public.booking_changes for insert
  with check (true);  -- Permisivo: validación en frontend

-- BOOKING_TOKENS:
--   - SELECT/UPDATE/INSERT: Público (se accede por token, validación en backend)
create policy "booking_tokens_select"
  on public.booking_tokens for select
  using (true);  -- Público: validación en Edge Function

create policy "booking_tokens_insert"
  on public.booking_tokens for insert
  with check (true);  -- Público: validación en Edge Function

create policy "booking_tokens_update"
  on public.booking_tokens for update
  using (true);  -- Público: validación en Edge Function

-- ── Realtime ─────────────────────────────────────────────────
-- Habilitar realtime para que los clientes vean cambios en tiempo real
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_changes;

-- ============================================================
--  INSTRUCCIONES: Crear usuario admin
-- ============================================================
-- Después de ejecutar este script, copia y ejecuta lo siguiente
-- para crear el usuario admin (reemplaza el hash si quieres otra contraseña):
--
-- INSERT INTO public.users (email, password, role)
-- VALUES ('admin@mycalendar.com', '$2b$10$wJhrk45QrN7ORnJ6Y34Z3.nXmyXOiH1tMfFSLJe8/ctWGgEWwdZIy', 'admin')
-- ON CONFLICT (email) DO UPDATE SET password = '$2b$10$wJhrk45QrN7ORnJ6Y34Z3.nXmyXOiH1tMfFSLJe8/ctWGgEWwdZIy';
--
-- Usuario: admin@mycalendar.com
-- Contraseña: admin123
--
-- Para generar un nuevo hash de contraseña, ejecuta en terminal:
-- node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('tucontraseña', 10));"

