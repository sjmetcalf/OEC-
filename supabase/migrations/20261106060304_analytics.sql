-- First-party analytics. Clients may insert visits and product events.
-- They cannot read them. Account creation is counted only by the auth trigger.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role, supabase_auth_admin;

create table public.visitors (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  linked_at timestamptz
);

create index visitors_user_id_idx on public.visitors (user_id);

create table public.events (
  id bigint generated always as identity primary key,
  visitor_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint events_name_check check (
    name in (
      'visit',
      'page_view',
      'sign_up',
      'sign_in',
      'sign_out',
      'study_start',
      'exam_start',
      'exam_finish',
      'chapter_open',
      'account_created'
    )
  ),
  constraint events_properties_check check (
    jsonb_typeof(properties) = 'object'
    and octet_length(properties::text) <= 80
    and (
      (
        name = 'page_view'
        and (properties - 'screen') = '{}'::jsonb
        and properties ? 'screen'
        and jsonb_typeof(properties -> 'screen') = 'string'
        and properties ->> 'screen' in ('home', 'study', 'exam', 'read', 'exam-setup', 'results')
      )
      or (
        name = 'exam_start'
        and (properties - 'length') = '{}'::jsonb
        and properties ? 'length'
        and jsonb_typeof(properties -> 'length') = 'number'
        and (properties ->> 'length') ~ '^[0-9]+$'
        and (properties ->> 'length')::integer between 1 and 100
      )
      or (
        name = 'chapter_open'
        and (properties - 'chapter') = '{}'::jsonb
        and properties ? 'chapter'
        and jsonb_typeof(properties -> 'chapter') = 'string'
        and properties ->> 'chapter' ~ '^[0-9]{1,2}$'
      )
      or (
        name not in ('page_view', 'exam_start', 'chapter_open')
        and properties = '{}'::jsonb
      )
    )
  )
);

create index events_user_id_idx on public.events (user_id);
create index events_visitor_id_idx on public.events (visitor_id);
create index events_created_at_idx on public.events (created_at desc);
create index events_name_created_at_idx on public.events (name, created_at desc);

alter table public.visitors enable row level security;
alter table public.events enable row level security;

revoke all on table public.visitors from public, anon, authenticated;
revoke all on table public.events from public, anon, authenticated;

grant insert on table public.visitors to anon, authenticated;
grant insert on table public.events to anon, authenticated;

grant select, insert, update, delete on table public.visitors to service_role;
grant select, insert, update, delete on table public.events to service_role;

do $$
declare
  event_id_seq regclass := pg_get_serial_sequence('public.events', 'id')::regclass;
begin
  execute format('revoke all on sequence %s from public, anon, authenticated', event_id_seq);
  execute format('grant usage on sequence %s to anon, authenticated, service_role', event_id_seq);
end $$;

create policy "Register an anonymous visitor"
  on public.visitors
  for insert
  to anon, authenticated
  with check (user_id is null and linked_at is null);

create policy "Insert allowed product events"
  on public.events
  for insert
  to anon, authenticated
  with check (
    name in (
      'visit',
      'page_view',
      'sign_up',
      'sign_in',
      'sign_out',
      'study_start',
      'exam_start',
      'exam_finish',
      'chapter_open'
    )
    and user_id is not distinct from (select auth.uid())
  );

-- The signup payload may carry a visitor id. Keep it out of user_metadata, which
-- is user-editable, and only attach it when it matches an unclaimed visitor row.
create or replace function private.capture_signup_visitor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text := coalesce(new.raw_user_meta_data ->> 'visitor_id', '');
begin
  create temporary table if not exists oec_signup_visitor (
    visitor_id text
  ) on commit drop;

  delete from pg_temp.oec_signup_visitor;
  insert into pg_temp.oec_signup_visitor (visitor_id) values (raw);

  if new.raw_user_meta_data is not null and new.raw_user_meta_data ? 'visitor_id' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'visitor_id';
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;

create or replace function private.record_account_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text;
  vid uuid;
begin
  begin
    select visitor_id into raw from pg_temp.oec_signup_visitor limit 1;
  exception
    when undefined_table then
      raw := null;
  end;

  if raw is null or raw = '' then
    raw := new.raw_user_meta_data ->> 'visitor_id';
  end if;

  if raw is not null and raw <> '' then
    begin
      vid := raw::uuid;
    exception
      when invalid_text_representation then
        vid := null;
    end;
  end if;

  if vid is not null and not exists (
    select 1
    from public.visitors
    where id = vid
      and (user_id is null or user_id = new.id)
  ) then
    vid := null;
  end if;

  begin
    if vid is not null then
      update public.visitors
        set user_id = new.id,
            linked_at = coalesce(linked_at, now())
        where id = vid
          and (user_id is null or user_id = new.id);
    end if;
  exception
    when others then
      vid := null;
  end;

  begin
    insert into public.events (visitor_id, user_id, name, properties)
    values (vid, new.id, 'account_created', '{}'::jsonb);
  exception
    when others then
      begin
        insert into public.events (visitor_id, user_id, name, properties)
        values (null, new.id, 'account_created', '{}'::jsonb);
      exception
        when others then
          null;
      end;
  end;

  return new;
end;
$$;

create or replace function private.link_visitor(p_visitor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or p_visitor is null then
    return;
  end if;

  update public.visitors
    set user_id = uid,
        linked_at = coalesce(linked_at, now())
    where id = p_visitor
      and (user_id is null or user_id = uid);
end;
$$;

create or replace function public.link_visitor(p_visitor uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.link_visitor(p_visitor);
end;
$$;

revoke all on function private.capture_signup_visitor() from public, anon, authenticated;
revoke all on function private.record_account_created() from public, anon, authenticated;
revoke all on function private.link_visitor(uuid) from public, anon, authenticated;
revoke all on function public.link_visitor(uuid) from public, anon;

grant execute on function private.capture_signup_visitor() to supabase_auth_admin;
grant execute on function private.record_account_created() to supabase_auth_admin;
grant usage on schema private to authenticated;
grant execute on function private.link_visitor(uuid) to authenticated;
grant execute on function public.link_visitor(uuid) to authenticated;

drop trigger if exists capture_signup_visitor on auth.users;
create trigger capture_signup_visitor
  before insert on auth.users
  for each row execute function private.capture_signup_visitor();

drop trigger if exists record_account_created on auth.users;
create trigger record_account_created
  after insert on auth.users
  for each row execute function private.record_account_created();

notify pgrst, 'reload schema';
