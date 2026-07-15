-- Panini World Cup 2026 sticker collector schema

-- Reference table: the full sticker checklist (same for every user).
create table if not exists public.stickers (
	code text primary key,
	name text not null,
	team text not null,
	sort_order integer generated always as identity
);

alter table public.stickers enable row level security;

-- Anyone authenticated can read the checklist (it's not user-specific data).
create policy "stickers are readable by authenticated users"
	on public.stickers for select
	to authenticated
	using (true);

-- Per-user ownership state for each sticker.
-- quantity = 0  -> falta (missing)
-- quantity = 1  -> tengo, sin repetidos
-- quantity >= 2 -> tengo, (quantity - 1) repetidos
create table if not exists public.user_stickers (
	user_id uuid not null references auth.users (id) on delete cascade,
	sticker_code text not null references public.stickers (code) on delete cascade,
	quantity integer not null default 0 check (quantity >= 0),
	updated_at timestamptz not null default now(),
	primary key (user_id, sticker_code)
);

alter table public.user_stickers enable row level security;

create policy "users read their own sticker rows"
	on public.user_stickers for select
	to authenticated
	using (auth.uid() = user_id);

create policy "users insert their own sticker rows"
	on public.user_stickers for insert
	to authenticated
	with check (auth.uid() = user_id);

create policy "users update their own sticker rows"
	on public.user_stickers for update
	to authenticated
	using (auth.uid() = user_id)
	with check (auth.uid() = user_id);

create policy "users delete their own sticker rows"
	on public.user_stickers for delete
	to authenticated
	using (auth.uid() = user_id);

-- Keep updated_at fresh on every change.
create or replace function public.set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

drop trigger if exists user_stickers_set_updated_at on public.user_stickers;
create trigger user_stickers_set_updated_at
	before update on public.user_stickers
	for each row
	execute function public.set_updated_at();

create index if not exists user_stickers_user_id_idx on public.user_stickers (user_id);
create index if not exists stickers_team_idx on public.stickers (team);
