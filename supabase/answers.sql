create table public.answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null check (char_length(question_id) > 0),
  correct boolean not null,
  seen_count integer not null,
  correct_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint answers_attempt_counts_check check (
    seen_count >= 1
    and correct_count >= 0
    and correct_count <= seen_count
    and (
      (correct and correct_count >= 1)
      or (not correct and correct_count < seen_count)
    )
  )
);

alter table public.answers enable row level security;

revoke all on table public.answers from anon, authenticated;

grant select, insert, update on table public.answers to authenticated;

create policy "Users read their own answers"
  on public.answers
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own answers"
  on public.answers
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own answers"
  on public.answers
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
