-- Applied to project zuibyfukfyouqxljgqgz on 2026-11-22. Kept here for reference / re-creating the project.
-- Secret Santa: the status object also says who gave *you* your present once revealed (my_received {from, item}),
-- so the client never has to find you in the gifts list by name (two friends can share a name).
-- Only _tsb_santa_json changes; grants are unchanged (it stays non-executable by clients).

create or replace function public._tsb_santa_json(p_town text, p_player uuid, p_now timestamptz)
returns json language plpgsql stable set search_path = public as $$
declare
  g_state text; g_starter uuid; st text; cnt integer; mem json; starter_name text;
  joined boolean := false; my_recv uuid; my_match text; my_gift text; gifts json := '[]'::json;
  my_received json := null;
begin
  select state, starter into g_state, g_starter from public.santa_groups where town = p_town and season = 2026;
  if not found or g_state = 'cancelled' then
    return json_build_object('state', 'none', 'close_at', public._tsb_santa_close(), 'reveal_at', public._tsb_santa_reveal(),
      'starter', null, 'count', 0, 'members', '[]'::json, 'joined', false, 'is_starter', false,
      'my_match', null, 'my_gift', null, 'gifts', '[]'::json, 'late', false, 'cancelled', coalesce(g_state = 'cancelled', false),
      'my_received', null);
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
    select json_build_object('from', a.name, 'item', gf.item) into my_received
      from public.santa_members a
      left join public.santa_gifts gf on gf.town = a.town and gf.season = a.season and gf.giver = a.player_id
      where a.town = p_town and a.season = 2026 and a.receiver = p_player
      limit 1;
  end if;
  return json_build_object('state', st, 'close_at', public._tsb_santa_close(), 'reveal_at', public._tsb_santa_reveal(),
    'starter', starter_name, 'count', cnt, 'members', mem, 'joined', joined, 'is_starter', coalesce(g_starter = p_player, false),
    'my_match', my_match, 'my_gift', my_gift, 'gifts', gifts,
    'late', (st <> 'open' and (not joined or my_recv is null)), 'cancelled', false,
    'my_received', my_received);
end; $$;

revoke all on function public._tsb_santa_json(text, uuid, timestamptz) from public, anon, authenticated;
