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


-- Collaborative albums. Each member keeps their own rows in user_stickers, while
-- the group view aggregates those rows for shared progress.
create table if not exists public.collection_groups (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
	created_by uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

create table if not exists public.group_members (
	group_id uuid not null references public.collection_groups (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	display_name text not null,
	location_label text not null default 'Misma ubicacion',
	is_swap_local boolean not null default true,
	joined_at timestamptz not null default now(),
	primary key (group_id, user_id)
);

create or replace function public.is_group_member(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
	select exists (
		select 1
		from public.group_members gm
		where gm.group_id = target_group_id and gm.user_id = target_user_id
	);

$$;

create or replace function public.join_group_by_code(
	invite text,
	display_name text,
	location_label text,
	is_swap_local boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	target_group_id uuid;
begin
	select id into target_group_id
	from public.collection_groups
	where invite_code = lower(trim(invite));

	if target_group_id is null then
		raise exception 'group_not_found';
	end if;

	insert into public.group_members (group_id, user_id, display_name, location_label, is_swap_local)
	values (target_group_id, auth.uid(), display_name, location_label, is_swap_local)
	on conflict (group_id, user_id) do update
	set display_name = excluded.display_name,
		location_label = excluded.location_label,
		is_swap_local = excluded.is_swap_local;

	return target_group_id;
end;
$$;

alter table public.collection_groups enable row level security;
alter table public.group_members enable row level security;

create policy "members read their groups"
	on public.collection_groups for select
	to authenticated
	using (created_by = auth.uid() or public.is_group_member(id, auth.uid()));

create policy "users create groups"
	on public.collection_groups for insert
	to authenticated
	with check (created_by = auth.uid());

create policy "group creators update groups"
	on public.collection_groups for update
	to authenticated
	using (created_by = auth.uid())
	with check (created_by = auth.uid());

create policy "members read members in their groups"
	on public.group_members for select
	to authenticated
	using (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));

create policy "users add themselves to groups"
	on public.group_members for insert
	to authenticated
	with check (user_id = auth.uid());

create policy "users update their own group profile"
	on public.group_members for update
	to authenticated
	using (user_id = auth.uid())
	with check (user_id = auth.uid());

create policy "users leave groups"
	on public.group_members for delete
	to authenticated
	using (user_id = auth.uid());

create index if not exists collection_groups_invite_code_idx on public.collection_groups (invite_code);
create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_id_idx on public.group_members (group_id);

create policy "group members read each others sticker rows"
	on public.user_stickers for select
	to authenticated
	using (
		auth.uid() = user_id
		or exists (
			select 1
			from public.group_members mine
			join public.group_members theirs on theirs.group_id = mine.group_id
			where mine.user_id = auth.uid()
				and theirs.user_id = user_stickers.user_id
		)
	);
