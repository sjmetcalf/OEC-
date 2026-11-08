-- Public display names and one opt-in leaderboard.
-- Scores come from practice_tests. The client cannot write a rank.
-- The security-definer reader stays in private, which is not an exposed API schema.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to anon, authenticated;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  show_on_leaderboard boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check check (
    display_name is null
    or (
      char_length(display_name) between 2 and 24
      and display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$'
    )
  ),
  constraint profiles_board_needs_name check (
    show_on_leaderboard = false or display_name is not null
  )
);

create unique index if not exists profiles_display_name_lower_idx
  on public.profiles (lower(display_name))
  where display_name is not null;

create index if not exists profiles_leaderboard_idx
  on public.profiles (user_id)
  where show_on_leaderboard and display_name is not null;

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "Read own profile" on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;

create policy "Read own profile"
  on public.profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Update own profile"
  on public.profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function private.normalize_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is not null then
    new.display_name := regexp_replace(btrim(new.display_name), '[[:space:]]+', ' ', 'g');
    if new.display_name = '' then
      new.display_name := null;
    end if;
  end if;
  if new.display_name is null then
    new.show_on_leaderboard := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.normalize_profile() from public, anon;
grant execute on function private.normalize_profile() to authenticated;

drop trigger if exists profiles_normalize on public.profiles;
create trigger profiles_normalize
  before insert or update on public.profiles
  for each row
  execute function private.normalize_profile();

-- Best saved practice test for each person who opted in.
-- Runs as the owner so it can read practice_tests without opening that table.
create or replace function private.leaderboard_rows()
returns table (
  user_id uuid,
  display_name text,
  percent integer,
  length integer
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
      test.length
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
  select best.user_id, best.display_name, best.percent, best.length
  from best;
$$;

revoke all on function private.leaderboard_rows() from public, anon, authenticated;
grant execute on function private.leaderboard_rows() to current_user;

-- Safe standings. Runs as the owner so callers never need execute on leaderboard_rows.
-- Returns no user id. is_self is false when nobody is signed in.
create or replace function private.leaderboard_standings()
returns table (
  rank integer,
  display_name text,
  percent integer,
  length integer,
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
    standings.is_self
  from private.leaderboard_standings() as standings;
$$;

revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to anon, authenticated;

notify pgrst, 'reload schema';
