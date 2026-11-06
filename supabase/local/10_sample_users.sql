-- 가짜 샘플 계정. 비밀번호는 두지 않는다. 실제 사람 정보가 아니다.

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'staff@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, name, email, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '김민지', 'staff@example.com', 'staff'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '박관리', 'admin@example.com', 'admin')
on conflict (id) do nothing;
