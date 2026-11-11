create table if not exists public.user_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  room_reminder_10m boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('helpdesk_reply', 'helpdesk_status', 'room_reminder')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

alter table public.user_prefs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists user_prefs_select on public.user_prefs;
drop policy if exists user_prefs_write on public.user_prefs;
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;

create policy user_prefs_select on public.user_prefs
  for select to authenticated
  using (user_id = auth.uid());

create policy user_prefs_write on public.user_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
