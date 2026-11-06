create table public.practice_tests (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  length integer not null,
  correct integer not null,
  constraint practice_tests_length_check check (length between 1 and 100),
  constraint practice_tests_correct_check check (correct >= 0 and correct <= length)
);

create index practice_tests_user_taken_idx on public.practice_tests (user_id, taken_at);

alter table public.practice_tests enable row level security;

revoke all on table public.practice_tests from public, anon, authenticated;
grant select, insert on table public.practice_tests to authenticated;

create policy "Read own practice tests"
  on public.practice_tests
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Record own practice tests"
  on public.practice_tests
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
