begin;
select plan(39);

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.events'::regclass),
  'events has row level security'
);
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.visitors'::regclass),
  'visitors has row level security'
);

select ok(not has_table_privilege('anon', 'public.events', 'SELECT'), 'anon cannot select events');
select ok(not has_table_privilege('anon', 'public.events', 'UPDATE'), 'anon cannot update events');
select ok(not has_table_privilege('anon', 'public.events', 'DELETE'), 'anon cannot delete events');
select ok(has_table_privilege('anon', 'public.events', 'INSERT'), 'anon can insert events');

select ok(not has_table_privilege('authenticated', 'public.events', 'SELECT'), 'authenticated cannot select events');
select ok(not has_table_privilege('authenticated', 'public.events', 'UPDATE'), 'authenticated cannot update events');
select ok(not has_table_privilege('authenticated', 'public.events', 'DELETE'), 'authenticated cannot delete events');
select ok(has_table_privilege('authenticated', 'public.events', 'INSERT'), 'authenticated can insert events');

select ok(not has_table_privilege('anon', 'public.visitors', 'SELECT'), 'anon cannot select visitors');
select ok(not has_table_privilege('anon', 'public.visitors', 'UPDATE'), 'anon cannot update visitors');
select ok(not has_table_privilege('anon', 'public.visitors', 'DELETE'), 'anon cannot delete visitors');
select ok(has_table_privilege('anon', 'public.visitors', 'INSERT'), 'anon can insert visitors');

select ok(not has_table_privilege('authenticated', 'public.visitors', 'SELECT'), 'authenticated cannot select visitors');
select ok(not has_table_privilege('authenticated', 'public.visitors', 'UPDATE'), 'authenticated cannot update visitors');
select ok(not has_table_privilege('authenticated', 'public.visitors', 'DELETE'), 'authenticated cannot delete visitors');
select ok(has_table_privilege('authenticated', 'public.visitors', 'INSERT'), 'authenticated can insert visitors');

select ok(
  not has_function_privilege('anon', 'public.link_visitor(uuid)', 'EXECUTE'),
  'anon cannot link a visitor'
);
select ok(
  has_function_privilege('authenticated', 'public.link_visitor(uuid)', 'EXECUTE'),
  'authenticated can link a visitor'
);
select ok(
  (
    select count(*) = 3 and bool_and(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('link_visitor', 'record_account_created', 'capture_signup_visitor')
  ),
  'privileged analytics functions are security definer in private'
);
select ok(
  not (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'link_visitor'
  ),
  'the exposed link_visitor function is not security definer'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'capture_signup_visitor' and not tgisinternal and tgrelid = 'auth.users'::regclass
  ),
  'signup captures a visitor id before the user row is stored'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'record_account_created' and not tgisinternal and tgrelid = 'auth.users'::regclass
  ),
  'account creation is recorded by a trigger'
);

set local role anon;

select lives_ok(
  $$insert into public.visitors (id) values ('11111111-1111-4111-8111-111111111111')$$,
  'anon registers a visitor'
);
select throws_ok(
  $$insert into public.visitors (id) values ('11111111-1111-4111-8111-111111111111')$$,
  '23505',
  null,
  'a visitor id is registered once'
);
select throws_ok(
  $$insert into public.visitors (id, linked_at) values ('22222222-2222-4222-8222-222222222222', now())$$,
  '42501',
  null,
  'anon cannot mark a visitor as linked'
);
select lives_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'visit', '{}'::jsonb)$$,
  'anon records a visit'
);
select lives_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'page_view', '{"screen":"home"}'::jsonb)$$,
  'anon records a page view'
);
select lives_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'exam_start', '{"length":25}'::jsonb)$$,
  'anon records an exam start'
);
select lives_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'chapter_open', '{"chapter":"1"}'::jsonb)$$,
  'anon records a chapter open'
);
select throws_ok(
  $$select id from public.events$$,
  '42501',
  null,
  'anon cannot read events'
);
select throws_ok(
  $$select id from public.visitors$$,
  '42501',
  null,
  'anon cannot read visitors'
);
select throws_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'account_created', '{}'::jsonb)$$,
  '42501',
  null,
  'anon cannot write account_created'
);

set local role authenticated;

select throws_ok(
  $$insert into public.events (visitor_id, user_id, name, properties)
    values ('11111111-1111-4111-8111-111111111111', null, 'account_created', '{}'::jsonb)$$,
  '42501',
  null,
  'authenticated cannot write account_created'
);

reset role;

select throws_ok(
  $$insert into public.events (name, properties) values ('password_reset', '{}'::jsonb)$$,
  '23514',
  null,
  'unknown event names are rejected'
);
select throws_ok(
  $$insert into public.events (name, properties)
    values ('page_view', '{"screen":"home","prompt":"question text"}'::jsonb)$$,
  '23514',
  null,
  'event properties cannot carry extra fields'
);
select throws_ok(
  $$insert into public.events (name, properties) values ('exam_start', '{"length":10}'::jsonb)$$,
  '23514',
  null,
  'exam length must be 25, 50, or 100'
);
select results_eq(
  $$select count(*)::int from public.events where name = 'visit'$$,
  array[1],
  'the table owner can read the visit'
);

select * from finish();
rollback;
