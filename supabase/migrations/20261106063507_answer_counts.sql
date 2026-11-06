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

notify pgrst, 'reload schema';
