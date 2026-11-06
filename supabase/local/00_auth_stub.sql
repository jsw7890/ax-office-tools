-- 로컬 검증용 인증 뼈대. Supabase에는 auth.users와 authenticated 역할이 이미 있으므로
-- 클라우드 마이그레이션에는 넣지 않는다.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin nobypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
grant execute on function auth.uid() to authenticated;
