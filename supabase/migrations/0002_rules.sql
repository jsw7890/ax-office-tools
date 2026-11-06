create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.reservations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  start_local timestamp;
  end_local timestamp;
begin
  if tg_op = 'UPDATE' then
    if new.room_id is distinct from old.room_id
       or new.user_id is distinct from old.user_id
       or new.title is distinct from old.title
       or new.start_at is distinct from old.start_at
       or new.end_at is distinct from old.end_at
       or new.created_at is distinct from old.created_at
    then
      raise exception 'reservation fields are immutable';
    end if;
    if old.status = 'cancelled' and new.status is distinct from 'cancelled' then
      raise exception 'cancelled reservation cannot be restored';
    end if;
    if new.status not in ('active', 'cancelled') then
      raise exception 'invalid reservation status';
    end if;
    return new;
  end if;

  if new.status <> 'active' then
    raise exception 'new reservations must be active';
  end if;
  if new.end_at <= new.start_at then
    raise exception 'end must be after start';
  end if;

  start_local := new.start_at at time zone 'Asia/Seoul';
  end_local := new.end_at at time zone 'Asia/Seoul';

  if start_local::date <> end_local::date then
    raise exception 'reservation must be within one day';
  end if;
  if start_local::time < time '09:00' or end_local::time > time '18:00' then
    raise exception 'outside office hours';
  end if;
  if start_local <> date_trunc('minute', start_local)
     or end_local <> date_trunc('minute', end_local)
     or mod(extract(minute from start_local)::int, 30) <> 0
     or mod(extract(minute from end_local)::int, 30) <> 0
  then
    raise exception 'must be 30 minute slots';
  end if;
  if new.start_at <= now() then
    raise exception 'past time cannot be reserved';
  end if;
  if not exists (
    select 1 from public.rooms where id = new.room_id and active = true
  ) then
    raise exception 'room is not available';
  end if;
  return new;
end;
$$;

create trigger reservations_guard
before insert or update on public.reservations
for each row execute function public.reservations_guard();

create or replace function public.tickets_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'received' or new.done_at is not null then
      raise exception 'new tickets start as received';
    end if;
    return new;
  end if;

  if new.requester_id is distinct from old.requester_id
     or new.category is distinct from old.category
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.urgency is distinct from old.urgency
     or new.created_at is distinct from old.created_at
  then
    raise exception 'ticket fields are immutable';
  end if;

  if new.status = old.status then
    if new.done_at is distinct from old.done_at then
      raise exception 'done_at cannot be edited directly';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'done' then
    raise exception 'completed tickets cannot change';
  end if;
  if old.status = 'received' and new.status <> 'in_progress' then
    raise exception 'invalid status transition';
  end if;
  if old.status = 'in_progress' and new.status <> 'done' then
    raise exception 'invalid status transition';
  end if;

  if new.status = 'done' then
    new.done_at := now();
  else
    new.done_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tickets_guard
before insert or update on public.tickets
for each row execute function public.tickets_guard();

create or replace function public.chat_logs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.chat_logs
    where user_id = new.user_id
      and (created_at at time zone 'Asia/Seoul')::date
        = (now() at time zone 'Asia/Seoul')::date
  ) >= 20 then
    raise exception 'daily question limit';
  end if;
  return new;
end;
$$;

create trigger chat_logs_guard
before insert on public.chat_logs
for each row execute function public.chat_logs_guard();

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke insert, update, delete on public.regulation_docs from authenticated;
revoke insert, update, delete on public.regulation_chunks from authenticated;
revoke update, delete on public.chat_logs from authenticated;
revoke delete on public.reservations from authenticated;
revoke delete on public.tickets from authenticated;
revoke update, delete on public.ticket_comments from authenticated;
revoke insert, delete on public.profiles from authenticated;

alter table public.profiles enable row level security;
alter table public.regulation_docs enable row level security;
alter table public.regulation_chunks enable row level security;
alter table public.chat_logs enable row level security;
alter table public.rooms enable row level security;
alter table public.reservations enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (auth.uid() is not null);

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy regulation_docs_select on public.regulation_docs
  for select to authenticated
  using (auth.uid() is not null);

create policy regulation_chunks_select on public.regulation_chunks
  for select to authenticated
  using (auth.uid() is not null);

create policy chat_logs_select on public.chat_logs
  for select to authenticated
  using (user_id = auth.uid());

create policy chat_logs_insert on public.chat_logs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy rooms_select on public.rooms
  for select to authenticated
  using (auth.uid() is not null);

create policy rooms_write on public.rooms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy reservations_select on public.reservations
  for select to authenticated
  using (auth.uid() is not null);

create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'active');

create policy reservations_update on public.reservations
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy tickets_select on public.tickets
  for select to authenticated
  using (requester_id = auth.uid() or public.is_admin());

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'received');

create policy tickets_update on public.tickets
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy ticket_comments_select on public.ticket_comments
  for select to authenticated
  using (
    exists (
      select 1
      from public.tickets
      where tickets.id = ticket_comments.ticket_id
        and (tickets.requester_id = auth.uid() or public.is_admin())
    )
  );

create policy ticket_comments_insert on public.ticket_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.tickets
      where tickets.id = ticket_comments.ticket_id
        and (tickets.requester_id = auth.uid() or public.is_admin())
    )
  );
