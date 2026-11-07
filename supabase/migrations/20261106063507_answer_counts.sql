-- Attempt totals for each saved answer. `correct` stays the last result.
-- Existing rows were one attempt: a correct answer is 1 of 1, a miss is 0 of 1.
-- RLS policies already limit every command to the signed-in user. No email column.

alter table public.answers
  add column if not exists seen_count integer,
  add column if not exists correct_count integer;

update public.answers
set
  seen_count = 1,
  correct_count = case when correct then 1 else 0 end
where seen_count is null
   or correct_count is null;

alter table public.answers
  alter column seen_count set not null,
  alter column correct_count set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'answers_attempt_counts_check'
      and conrelid = 'public.answers'::regclass
  ) then
    alter table public.answers
      add constraint answers_attempt_counts_check
      check (
        seen_count >= 1
        and correct_count >= 0
        and correct_count <= seen_count
        and (
          (correct and correct_count >= 1)
          or (not correct and correct_count < seen_count)
        )
      );
  end if;
end $$;

-- Upsert updates an existing row, so the signed-in role needs update as well as insert.
grant select, insert, update on table public.answers to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'answers'
      and cmd = 'SELECT'
  ) then
    create policy "Users read their own answers"
      on public.answers
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'answers'
      and cmd = 'INSERT'
  ) then
    create policy "Users insert their own answers"
      on public.answers
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'answers'
      and cmd = 'UPDATE'
  ) then
    create policy "Users update their own answers"
      on public.answers
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';
