create extension if not exists btree_gist;

create table public.profiles (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 40),
  email text not null unique check (char_length(email) between 3 and 200),
  role text not null check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

create table public.regulation_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  publisher text not null check (char_length(publisher) between 1 and 200),
  source_url text not null check (char_length(source_url) between 1 and 500),
  base_date date not null,
  is_sample boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.regulation_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.regulation_docs (id) on delete cascade,
  article_no text not null check (char_length(article_no) between 1 and 40),
  heading text not null check (char_length(heading) between 1 and 200),
  content text not null check (char_length(content) between 1 and 40000),
  sort_order integer not null,
  unique (doc_id, article_no)
);

create table public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  question text not null check (char_length(question) between 1 and 500),
  answer text not null check (char_length(answer) between 1 and 8000),
  cited_chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  capacity integer not null check (capacity between 1 and 500),
  location text not null check (char_length(location) between 1 and 40),
  active boolean not null default true
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  user_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 80),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status = 'active');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  category text not null check (category in ('pc', 'account', 'printer_network', 'etc')),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 4000),
  urgency text not null check (urgency in ('normal', 'urgent')),
  status text not null default 'received' check (status in ('received', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index reservations_room_idx on public.reservations (room_id, start_at);
create index reservations_user_idx on public.reservations (user_id);
create index tickets_requester_idx on public.tickets (requester_id, created_at desc);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);
create index chat_logs_user_created_idx on public.chat_logs (user_id, created_at);
create index regulation_chunks_doc_idx on public.regulation_chunks (doc_id, sort_order);
