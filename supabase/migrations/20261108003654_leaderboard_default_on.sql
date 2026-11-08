-- A saved display name belongs on the board. No separate opt-in.

alter table public.profiles
  alter column show_on_leaderboard set default true;

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
  else
    new.show_on_leaderboard := true;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.normalize_profile() from public, anon;
grant execute on function private.normalize_profile() to authenticated;

update public.profiles
set show_on_leaderboard = true
where display_name is not null
  and show_on_leaderboard = false;
