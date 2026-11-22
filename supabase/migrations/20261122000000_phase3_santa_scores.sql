-- Applied to project zuibyfukfyouqxljgqgz on 2026-11-22. Kept here for reference / re-creating the project.
-- Phase 3 · Together (PHASE3.md): Secret Santa + friends-town scoreboards.
-- Same pattern as 20261118000000_town_spirit.sql: tables with RLS on and no policies, plus (stricter) no table privileges
-- for anon/authenticated. All access goes through the security definer RPCs at the bottom. Internal helpers (_tsb_*)
-- are not executable by clients. Errors are raised as plain exception messages (PostgREST error.message):
--   bad_town bad_secret bad_name bad_item bad_game bad_score
--   already_started not_open full not_starter too_few not_drawn revealed not_member

-- ------------------------------------------------------------------ tables
create table public.player_secrets (
  player_id uuid primary key,
  secret_hash bytea not null,                       -- sha256(p_secret::text)
  first_seen timestamptz not null default now()
);

create table public.santa_groups (
  town text not null check (town ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  season smallint not null default 2026,
  starter uuid not null,
  state text not null default 'open' check (state in ('open', 'drawn', 'cancelled')),
  created_at timestamptz not null default now(),
  drawn_at timestamptz,
  cancelled_at timestamptz,
  primary key (town, season)
);

create table public.santa_members (
  town text not null,
  season smallint not null default 2026,
  player_id uuid not null,
  name text not null check (char_length(name) between 1 and 18),
  joined_at timestamptz not null default now(),
  receiver uuid,                                    -- set by the draw
  primary key (town, season, player_id),
  foreign key (town, season) references public.santa_groups (town, season) on delete cascade
);

create table public.santa_gifts (
  town text not null,
  season smallint not null default 2026,
  giver uuid not null,
  item text not null check (char_length(item) <= 32 and item ~ '^[a-z]+\.[a-z0-9]+$'),
  chosen_at timestamptz not null default now(),
  primary key (town, season, giver),
  foreign key (town, season, giver) references public.santa_members (town, season, player_id) on delete cascade
);

create table public.town_scores (
  town text not null check (town ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  game text not null check (game ~ '^[a-z0-9_]{2,24}$'),
  player_id uuid not null,
  name text not null check (char_length(name) between 1 and 18),
  best integer not null check (best between 0 and 1000000),
  at timestamptz not null default now(),            -- when `best` was reached
  primary key (town, game, player_id)
);
create index town_scores_rank_idx on public.town_scores (town, game, best desc, at);

create table public.score_submits (               -- rate-limit log (30 / player / hour), pruned on every submit
  id bigint generated always as identity primary key,
  player_id uuid not null,
  at timestamptz not null default now()
);
create index score_submits_player_at_idx on public.score_submits (player_id, at);

alter table public.player_secrets enable row level security;
alter table public.santa_groups enable row level security;
alter table public.santa_members enable row level security;
alter table public.santa_gifts enable row level security;
alter table public.town_scores enable row level security;
alter table public.score_submits enable row level security;
revoke all on table public.player_secrets, public.santa_groups, public.santa_members, public.santa_gifts,
  public.town_scores, public.score_submits from public, anon, authenticated;

-- ------------------------------------------------------------------ internal helpers
create or replace function public._tsb_town(p_town text)
returns text language plpgsql immutable set search_path = public as $$
declare c text := upper(btrim(coalesce(p_town, '')));
begin
  if c !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then raise exception 'bad_town'; end if;
  return c;
end; $$;

-- like src/core/names.js cleanName (minus the word filter, which the client applies): NFKC, strip control /
-- markup / invisible characters, collapse whitespace, max 18 chars.
create or replace function public._tsb_name(p_name text)
returns text language plpgsql immutable set search_path = public as $$
declare s text;
begin
  s := normalize(coalesce(p_name, ''), NFKC);
  s := regexp_replace(s, '[\x01-\x1f\x7f-\x9f<>{}\[\]\\`​-‏‪-‮⁠-⁩﻿]', '', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  s := btrim(left(s, 18));
  if s = '' then raise exception 'bad_name'; end if;
  return s;
end; $$;

-- First call for a player registers sha256(secret); later calls must match.
create or replace function public._tsb_auth(p_player uuid, p_secret uuid)
returns void language plpgsql set search_path = public as $$
declare h bytea;
begin
  if p_player is null or p_secret is null then raise exception 'bad_secret'; end if;
  h := extensions.digest(p_secret::text, 'sha256');
  insert into public.player_secrets (player_id, secret_hash) values (p_player, h) on conflict (player_id) do nothing;
  if not exists (select 1 from public.player_secrets where player_id = p_player and secret_hash = h) then
    raise exception 'bad_secret';
  end if;
end; $$;

create or replace function public._tsb_santa_close() returns timestamptz language sql immutable set search_path = public as $$
  select timestamptz '2026-12-20 18:30:00+00';
$$;
create or replace function public._tsb_santa_reveal() returns timestamptz language sql immutable set search_path = public as $$
  select timestamptz '2026-12-24 18:30:00+00';
$$;

-- One random single cycle over the members (order by a v4 uuid = strong randomness; giver i → receiver i+1).
create or replace function public._tsb_santa_do_draw(p_town text)
returns integer language plpgsql set search_path = public as $$
declare ids uuid[]; n integer; i integer;
begin
  select array_agg(player_id order by gen_random_uuid()) into ids
    from public.santa_members where town = p_town and season = 2026;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then raise exception 'too_few'; end if;
  for i in 1..n loop
    update public.santa_members set receiver = ids[(i % n) + 1]
      where town = p_town and season = 2026 and player_id = ids[i];
  end loop;
  update public.santa_groups set state = 'drawn', drawn_at = now() where town = p_town and season = 2026;
  return n;
end; $$;

-- Lazy close: at/after close_at an open group is drawn (>= 3 members) or cancelled (< 3).
create or replace function public._tsb_santa_settle(p_town text, p_now timestamptz)
returns void language plpgsql set search_path = public as $$
declare st text; n integer;
begin
  if p_now < public._tsb_santa_close() then return; end if;
  select state into st from public.santa_groups where town = p_town and season = 2026 for update;
  if not found or st <> 'open' then return; end if;
  select count(*) into n from public.santa_members where town = p_town and season = 2026;
  if n >= 3 then
    perform public._tsb_santa_do_draw(p_town);
  else
    delete from public.santa_members where town = p_town and season = 2026;
    update public.santa_groups set state = 'cancelled', cancelled_at = now() where town = p_town and season = 2026;
  end if;
end; $$;

-- The status object. Never contains other players' matches before reveal.
create or replace function public._tsb_santa_json(p_town text, p_player uuid, p_now timestamptz)
returns json language plpgsql stable set search_path = public as $$
declare
  g_state text; g_starter uuid; st text; cnt integer; mem json; starter_name text;
  joined boolean := false; my_recv uuid; my_match text; my_gift text; gifts json := '[]'::json;
begin
  select state, starter into g_state, g_starter from public.santa_groups where town = p_town and season = 2026;
  if not found or g_state = 'cancelled' then
    return json_build_object('state', 'none', 'close_at', public._tsb_santa_close(), 'reveal_at', public._tsb_santa_reveal(),
      'starter', null, 'count', 0, 'members', '[]'::json, 'joined', false, 'is_starter', false,
      'my_match', null, 'my_gift', null, 'gifts', '[]'::json, 'late', false, 'cancelled', coalesce(g_state = 'cancelled', false));
  end if;
  st := case when g_state = 'open' then 'open' when p_now >= public._tsb_santa_reveal() then 'revealed' else 'drawn' end;
  select count(*)::integer, coalesce(json_agg(name order by joined_at, player_id), '[]'::json) into cnt, mem
    from public.santa_members where town = p_town and season = 2026;
  select name into starter_name from public.santa_members where town = p_town and season = 2026 and player_id = g_starter;
  select true, receiver into joined, my_recv from public.santa_members
    where town = p_town and season = 2026 and player_id = p_player;
  joined := coalesce(joined, false);
  if joined and my_recv is not null then
    select name into my_match from public.santa_members where town = p_town and season = 2026 and player_id = my_recv;
    select item into my_gift from public.santa_gifts where town = p_town and season = 2026 and giver = p_player;
  end if;
  if st = 'revealed' then
    select coalesce(json_agg(json_build_object('from', a.name, 'to', b.name, 'item', gf.item) order by a.joined_at, a.player_id), '[]'::json)
      into gifts
      from public.santa_members a
      join public.santa_members b on b.town = a.town and b.season = a.season and b.player_id = a.receiver
      left join public.santa_gifts gf on gf.town = a.town and gf.season = a.season and gf.giver = a.player_id
      where a.town = p_town and a.season = 2026;
  end if;
  return json_build_object('state', st, 'close_at', public._tsb_santa_close(), 'reveal_at', public._tsb_santa_reveal(),
    'starter', starter_name, 'count', cnt, 'members', mem, 'joined', joined, 'is_starter', coalesce(g_starter = p_player, false),
    'my_match', my_match, 'my_gift', my_gift, 'gifts', gifts,
    'late', (st <> 'open' and (not joined or my_recv is null)), 'cancelled', false);
end; $$;

-- ------------------------------------------------------------------ Secret Santa RPCs
create or replace function public.santa_status(p_town text, p_player uuid, p_secret uuid, p_now timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); eff timestamptz := now();
begin
  perform public._tsb_auth(p_player, p_secret);
  if p_now is not null and left(t, 2) = 'QQ' then eff := p_now; end if;  -- test towns only
  perform public._tsb_santa_settle(t, eff);
  return public._tsb_santa_json(t, p_player, eff);
end; $$;

create or replace function public.santa_start(p_town text, p_player uuid, p_secret uuid, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); n text;
begin
  perform public._tsb_auth(p_player, p_secret);
  n := public._tsb_name(p_name);
  perform public._tsb_santa_settle(t, now());
  if exists (select 1 from public.santa_groups where town = t and season = 2026) then raise exception 'already_started'; end if;
  if now() >= public._tsb_santa_close() then raise exception 'not_open'; end if;
  insert into public.santa_groups (town, starter) values (t, p_player) on conflict do nothing;
  if not found then raise exception 'already_started'; end if;
  insert into public.santa_members (town, player_id, name) values (t, p_player, n);
  return public._tsb_santa_json(t, p_player, now());
end; $$;

create or replace function public.santa_join(p_town text, p_player uuid, p_secret uuid, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); n text; st text;
begin
  perform public._tsb_auth(p_player, p_secret);
  n := public._tsb_name(p_name);
  perform public._tsb_santa_settle(t, now());
  select state into st from public.santa_groups where town = t and season = 2026 for update;
  if not found or st <> 'open' or now() >= public._tsb_santa_close() then raise exception 'not_open'; end if;
  if exists (select 1 from public.santa_members where town = t and season = 2026 and player_id = p_player) then
    update public.santa_members set name = n where town = t and season = 2026 and player_id = p_player;  -- idempotent
  else
    if (select count(*) from public.santa_members where town = t and season = 2026) >= 16 then raise exception 'full'; end if;
    insert into public.santa_members (town, player_id, name) values (t, p_player, n);
  end if;
  return public._tsb_santa_json(t, p_player, now());
end; $$;

create or replace function public.santa_leave(p_town text, p_player uuid, p_secret uuid)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); st text; s uuid; nxt uuid;
begin
  perform public._tsb_auth(p_player, p_secret);
  perform public._tsb_santa_settle(t, now());
  select state, starter into st, s from public.santa_groups where town = t and season = 2026 for update;
  if not found or st <> 'open' then raise exception 'not_open'; end if;
  delete from public.santa_members where town = t and season = 2026 and player_id = p_player;
  if found and s = p_player then
    select player_id into nxt from public.santa_members where town = t and season = 2026 order by joined_at, player_id limit 1;
    if nxt is null then
      delete from public.santa_groups where town = t and season = 2026;
    else
      update public.santa_groups set starter = nxt where town = t and season = 2026;
    end if;
  end if;
  return public._tsb_santa_json(t, p_player, now());
end; $$;

create or replace function public.santa_draw(p_town text, p_player uuid, p_secret uuid)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); st text; s uuid;
begin
  perform public._tsb_auth(p_player, p_secret);
  perform public._tsb_santa_settle(t, now());
  select state, starter into st, s from public.santa_groups where town = t and season = 2026 for update;
  if not found or st <> 'open' then raise exception 'not_open'; end if;
  if s <> p_player then raise exception 'not_starter'; end if;
  perform public._tsb_santa_do_draw(t);  -- raises too_few
  return public._tsb_santa_json(t, p_player, now());
end; $$;

create or replace function public.santa_give(p_town text, p_player uuid, p_secret uuid, p_item text)
returns json language plpgsql security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); st text; r uuid;
begin
  perform public._tsb_auth(p_player, p_secret);
  if p_item is null or char_length(p_item) > 32 or p_item !~ '^[a-z]+\.[a-z0-9]+$' then raise exception 'bad_item'; end if;
  perform public._tsb_santa_settle(t, now());
  select state into st from public.santa_groups where town = t and season = 2026 for update;
  if not found or st <> 'drawn' then raise exception 'not_drawn'; end if;
  if now() >= public._tsb_santa_reveal() then raise exception 'revealed'; end if;
  select receiver into r from public.santa_members where town = t and season = 2026 and player_id = p_player;
  if r is null then raise exception 'not_member'; end if;
  insert into public.santa_gifts (town, giver, item) values (t, p_player, p_item)
    on conflict (town, season, giver) do update set item = excluded.item, chosen_at = now();
  return public._tsb_santa_json(t, p_player, now());
end; $$;

-- ------------------------------------------------------------------ Scoreboard RPCs
create or replace function public.score_submit(p_town text, p_player uuid, p_secret uuid, p_name text, p_game text, p_score integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  t text := public._tsb_town(p_town); n text; c integer;
  prev integer; newbest integer; my_at timestamptz; improved boolean := false;
  top_player uuid; top_name text; top_best integer; is_top boolean := false; ptop text; rk integer;
begin
  perform public._tsb_auth(p_player, p_secret);
  n := public._tsb_name(p_name);
  if p_game is null or p_game !~ '^[a-z0-9_]{2,24}$' then raise exception 'bad_game'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000 then raise exception 'bad_score'; end if;

  perform pg_advisory_xact_lock(hashtextextended('tsb:p:' || p_player::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('tsb:g:' || t || ':' || p_game, 0));
  delete from public.score_submits where player_id = p_player and at < now() - interval '1 hour';
  select count(*) into c from public.score_submits where player_id = p_player;
  select best, at into prev, my_at from public.town_scores where town = t and game = p_game and player_id = p_player;

  if c >= 30 then  -- rate limited: nothing recorded
    if prev is not null then
      select 1 + count(*) into rk from public.town_scores
        where town = t and game = p_game and (best > prev or (best = prev and (at < my_at or (at = my_at and player_id < p_player))));
    end if;
    return json_build_object('best', prev, 'prev_best', prev, 'town_best', false, 'prev_top', null, 'rank', rk, 'limited', true);
  end if;
  insert into public.score_submits (player_id) values (p_player);

  select player_id, name, best into top_player, top_name, top_best from public.town_scores
    where town = t and game = p_game order by best desc, at, player_id limit 1;

  if prev is null then
    insert into public.town_scores (town, game, player_id, name, best) values (t, p_game, p_player, n, p_score)
      returning best, at into newbest, my_at;
    improved := true;
  elsif p_score > prev then
    update public.town_scores set best = p_score, at = now(), name = n
      where town = t and game = p_game and player_id = p_player returning best, at into newbest, my_at;
    improved := true;
  else
    update public.town_scores set name = n where town = t and game = p_game and player_id = p_player;
    newbest := prev;
  end if;

  is_top := improved and (top_best is null or p_score > top_best);
  if is_top and top_player is distinct from p_player then ptop := top_name; end if;
  select 1 + count(*) into rk from public.town_scores
    where town = t and game = p_game and (best > newbest or (best = newbest and (at < my_at or (at = my_at and player_id < p_player))));
  return json_build_object('best', newbest, 'prev_best', prev, 'town_best', is_top, 'prev_top', ptop, 'rank', rk, 'limited', false);
end; $$;

create or replace function public.town_scores(p_town text, p_player uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare t text := public._tsb_town(p_town); r json;
begin
  select coalesce(json_agg(json_build_object('game', game, 'name', name, 'best', best, 'me', coalesce(player_id = p_player, false), 'at', at)
           order by game, rn), '[]'::json) into r
    from (select s.*, row_number() over (partition by game order by best desc, at, player_id) rn
            from public.town_scores s where s.town = t) x
    where rn <= 10;
  return r;
end; $$;

-- ------------------------------------------------------------------ privileges
revoke all on function public._tsb_town(text), public._tsb_name(text), public._tsb_auth(uuid, uuid),
  public._tsb_santa_close(), public._tsb_santa_reveal(), public._tsb_santa_do_draw(text),
  public._tsb_santa_settle(text, timestamptz), public._tsb_santa_json(text, uuid, timestamptz)
  from public, anon, authenticated;

revoke all on function public.santa_status(text, uuid, uuid, timestamptz), public.santa_start(text, uuid, uuid, text),
  public.santa_join(text, uuid, uuid, text), public.santa_leave(text, uuid, uuid), public.santa_draw(text, uuid, uuid),
  public.santa_give(text, uuid, uuid, text), public.score_submit(text, uuid, uuid, text, text, integer),
  public.town_scores(text, uuid)
  from public;
grant execute on function public.santa_status(text, uuid, uuid, timestamptz), public.santa_start(text, uuid, uuid, text),
  public.santa_join(text, uuid, uuid, text), public.santa_leave(text, uuid, uuid), public.santa_draw(text, uuid, uuid),
  public.santa_give(text, uuid, uuid, text), public.score_submit(text, uuid, uuid, text, text, integer),
  public.town_scores(text, uuid)
  to anon, authenticated;
