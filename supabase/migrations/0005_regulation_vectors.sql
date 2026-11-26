create extension if not exists vector;

create table public.regulation_embeddings (
  chunk_id uuid not null references public.regulation_chunks (id) on delete cascade,
  part integer not null default 0,
  model text not null,
  part_text text not null,
  embedding vector(1024) not null,
  primary key (chunk_id, part, model)
);

revoke insert, update, delete on public.regulation_embeddings from authenticated;
grant select on public.regulation_embeddings to authenticated;
alter table public.regulation_embeddings enable row level security;
create policy regulation_embeddings_select on public.regulation_embeddings
  for select to authenticated using (true);