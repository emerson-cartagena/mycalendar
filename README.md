# MyCalendar

Plataforma de reservas online para profesionales.  
Crea tu agenda, comparte tu enlace y deja que tus clientes elijan su horario.

Stack: **React + Vite + TypeScript + Supabase + Tailwind CSS**, deploy en **Vercel**.

---

## Funcionalidades

| Feature | Descripción |
|---------|-------------|
| Autenticación | Login con bcrypt server-side vía Edge Function, sesión en localStorage |
| Crear evento | Título, descripción, enlace de reunión, rango de fechas, horario diario, días de semana y duración de slot |
| Página pública | Cualquiera puede ver los horarios disponibles y reservar con nombre + correo |
| Invitados | El reservador puede agregar correos de invitados adicionales |
| Emails automáticos | Confirmación, reprogramación y cancelación enviados con Resend |
| Tiempo real | Los slots reservados desaparecen al instante para todos los visitantes |
| Anti-colisión | Se verifica disponibilidad antes de guardar para evitar doble reserva |
| Panel del organizador | Ver todas las reservas, estadísticas, enlace público y código iframe |
| Embebible | Ruta `/embed/:slug` lista para poner en Moodle u otra página externa |
| Anti-bot | Cloudflare Turnstile en el login (omitido en desarrollo automáticamente) |

---

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/login` | Inicio de sesión |
| `/dashboard` | Panel principal con eventos del usuario |
| `/create` | Crear nuevo evento |
| `/edit/:id` | Editar evento existente |
| `/manage/:id` | Panel del organizador con reservas y links |
| `/book/:slug` | Página pública de reserva |
| `/embed/:slug` | Versión sin header para incrustar en iframe |
| `/booking-action` | Cancelar o reprogramar desde un link de email |

---

## Setup local

### 1. Clonar y instalar

```bash
git clone <repo>
cd mycalendar
npm install
```

### 2. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto gratuito.
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase/schema.sql`.
3. Ejecuta también las migraciones en `supabase/migrations/` en orden cronológico.
4. En **Project Settings → API** copia la `Project URL` y la `anon public` key.

### 3. Configurar Cloudflare Turnstile

1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → **Add site**.
2. Agrega tu dominio de producción (ej. `mycalendar.pro`).
3. Copia el **Site key** y el **Secret key**.

> En desarrollo (`npm run dev`) el widget de Turnstile se omite automáticamente,
> no es necesario configurar nada extra para trabajar en local.

### 4. Configurar Resend

1. Crea una cuenta en [resend.com](https://resend.com).
2. Verifica tu dominio de envío.
3. Genera una **API Key** desde el dashboard.

### 5. Variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
VITE_SUPABASE_URL=https://TUPROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_TURNSTILE_SITE_KEY=0x4AAAA...
```

### 6. Deploy de Edge Functions

Las Edge Functions están en `supabase/functions/`. Despliégalas con:

```bash
export SUPABASE_ACCESS_TOKEN=tu_access_token

# Desplegar todas las funciones
npx supabase functions deploy login --project-ref TU_PROJECT_REF
npx supabase functions deploy verify-turnstile --project-ref TU_PROJECT_REF
npx supabase functions deploy send-booking-email --project-ref TU_PROJECT_REF
npx supabase functions deploy handle-booking-token --project-ref TU_PROJECT_REF
```

Luego configura los secrets que usan las funciones:

```bash
npx supabase secrets set TURNSTILE_SECRET_KEY=tu_secret_key --project-ref TU_PROJECT_REF
npx supabase secrets set RESEND_API_KEY=re_... --project-ref TU_PROJECT_REF
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son inyectados
> automáticamente por Supabase en todas las Edge Functions.

### 7. Correr en desarrollo

```bash
npm run dev
```

Abre http://localhost:5173

---

## Deploy en Vercel

1. Sube el proyecto a GitHub.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TURNSTILE_SITE_KEY`
4. Framework preset: **Vite**. Click **Deploy**.

El archivo `vercel.json` ya maneja:
- Rewrite de todas las rutas a `index.html` (SPA routing).
- Headers para permitir iframe en `/embed/*`.

---

## Incrustar en Moodle

Desde el panel `/manage/:id` copia el código iframe y pégalo en cualquier recurso HTML de Moodle:

```html
<iframe src="https://tuapp.vercel.app/embed/mi-evento-abc12"
        width="100%" height="700" frameborder="0" allow="fullscreen">
</iframe>
```

---

## Crear usuario administrador

Después de ejecutar `schema.sql`, crea el primer admin desde el **SQL Editor** de Supabase:

```sql
-- Genera un hash bcrypt de tu contraseña con:
-- node -e "const b = require('bcryptjs'); console.log(b.hashSync('tucontraseña', 10));"

INSERT INTO public.users (email, password, role)
VALUES ('admin@tudominio.com', '$2b$10$HASH_AQUI', 'admin')
ON CONFLICT (email) DO NOTHING;
```
