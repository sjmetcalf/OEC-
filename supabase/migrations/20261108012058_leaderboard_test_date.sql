-- The best-test row already chosen for the board also carries its taken_at.
-- Return types change, so the functions are replaced rather than altered in place.

drop function if exists public.leaderboard();
drop function if exists private.leaderboard_standings();
drop function if exists private.leaderboard_rows();

create or replace function private.leaderboard_rows()
returns table (
  user_id uuid,
  display_name text,
  percent integer,
  length integer,
  taken_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (test.user_id)
      test.user_id,
      profile.display_name,
      round((test.correct::numeric / test.length) * 100)::integer as percent,
      test.length,
      test.taken_at
    from public.practice_tests as test
    join public.profiles as profile on profile.user_id = test.user_id
    where profile.show_on_leaderboard
      and profile.display_name is not null
    order by
      test.user_id,
      (test.correct::numeric / test.length) desc,
      test.length desc,
      test.taken_at asc
  )
  select best.user_id, best.display_name, best.percent, best.length, best.taken_at
  from best;
$$;

revoke all on function private.leaderboard_rows() from public, anon, authenticated;
grant execute on function private.leaderboard_rows() to current_user;

create or replace function private.leaderboard_standings()
returns table (
  rank integer,
  display_name text,
  percent integer,
  length integer,
  taken_at timestamptz,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rank() over (order by entry.percent desc, entry.length desc)::integer as rank,
    entry.display_name,
    entry.percent,
    entry.length,
    entry.taken_at,
    coalesce((select auth.uid()) = entry.user_id, false) as is_self
  from private.leaderboard_rows() as entry
  order by rank, entry.display_name;
$$;

revoke all on function private.leaderboard_standings() from public;
grant execute on function private.leaderboard_standings() to anon, authenticated;

create or replace function public.leaderboard()
returns table (
  rank integer,
  display_name text,
  percent integer,
  length integer,
  taken_at timestamptz,
  is_self boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    standings.rank,
    standings.display_name,
    standings.percent,
    standings.length,
    standings.taken_at,
    standings.is_self
  from private.leaderboard_standings() as standings;
$$;

revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to anon, authenticated;

notify pgrst, 'reload schema';
