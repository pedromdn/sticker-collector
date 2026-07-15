# Mi Álbum Mundial 2026

MVP para llevar el control de tu colección de stickers Panini del Mundial 2026 (álbum físico).

## Stack

- SvelteKit 2 + Svelte 5
- TypeScript
- Tailwind CSS v3
- Supabase (PostgreSQL, Auth con correo + contraseña, RLS)
- `@supabase/ssr` para sesión en SSR
- Adapter: `@sveltejs/adapter-cloudflare`

## Funcionalidad del MVP

- Login con correo + contraseña (registro y acceso en la misma pantalla).
- Checklist completo (1034 stickers, 52 equipos/categorías) cargado desde `panini-wc-2026-catalog.json`.
- Marcar "tengo" / "me falta" por sticker.
- Contador de repetidos por sticker (útil para intercambios).
- Barra de progreso global y por equipo.
- Búsqueda por nombre o código, y filtro por estado.
- Los cambios se guardan al instante contra Supabase (por usuario, protegido con RLS).

## Requisitos

- Node 18.13+ (probado con Node 20).
- Un proyecto de Supabase.

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y llena las variables con las credenciales de tu proyecto de Supabase (Project Settings → API):

   ```bash
   cp .env.example .env
   ```

   ```
   PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. En el SQL Editor de Supabase, corre en orden:

   - `supabase/schema.sql` — crea las tablas `stickers` y `user_stickers` con RLS.
   - `supabase/seed.sql` — inserta el checklist completo de 1034 stickers.

   Si actualizas `panini-wc-2026-catalog.json`, puedes regenerar el seed con:

   ```bash
   npm run seed:generate
   ```

4. (Recomendado) En **Authentication → Providers → Email**, desactiva **Confirm email**. Así el registro no depende del servicio de correo de Supabase (que tiene un límite de envíos muy bajo en el plan gratuito) — la cuenta queda activa de inmediato con correo + contraseña. Si lo dejas activado, cada registro (no cada login) va a necesitar confirmar por correo, y te puedes topar con el límite de envíos.

## Desarrollo local

```bash
npm run dev
```

Abre `http://localhost:5173`, dale a "Crear cuenta" con tu correo y una contraseña.

## Build

```bash
npm run build
```

## Deploy en Cloudflare Pages

1. Build command: `npm run build`
2. Output directory: `.svelte-kit/cloudflare`
3. Agrega las mismas variables de entorno (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`) en la configuración del proyecto en Cloudflare Pages.

## Estructura relevante

```
panini-wc-2026-catalog.json   # fuente original del checklist
scripts/generate-seed.mjs     # genera supabase/seed.sql desde el catalog
supabase/schema.sql           # tablas + RLS
supabase/seed.sql             # datos del checklist (generado)
src/hooks.server.ts           # sesión de Supabase en SSR + guard de rutas
src/routes/+layout.ts         # cliente Supabase isomórfico (browser/server)
src/routes/login/             # login + registro (correo/contraseña)
src/routes/+page.server.ts    # carga stickers + estado del usuario
src/routes/+page.svelte       # UI de la colección
```

## Ideas para siguientes iteraciones

- Import/export de la colección (CSV/JSON) para respaldo o compartir.
- Vista de "intercambios": comparar tu lista de repetidos contra la de otro usuario.
- Ordenar por posición dentro del álbum en vez de orden alfabético del equipo.
- Modo offline con sincronización diferida.
