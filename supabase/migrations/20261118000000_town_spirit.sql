-- Applied to project zuibyfukfyouqxljgqgz on 2026-11-18. Kept here for reference / re-creating the project.
create table public.door_opens (
  player_id uuid not null,
  door smallint not null check (door between 1 and 24),
  opened_at timestamptz not null default now(),
  primary key (player_id, door)
);
alter table public.door_opens enable row level security;

create or replace function public.open_door(p_player uuid, p_door smallint)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if p_door < 1 or p_door > 24 then raise exception 'invalid door'; end if;
  insert into public.door_opens (player_id, door) values (p_player, p_door) on conflict do nothing;
  return (select count(*) from public.door_opens);
end; $$;

create or replace function public.town_spirit()
returns table (doors bigint, helpers bigint) language sql stable security definer set search_path = public as $$
  select count(*)::bigint, count(distinct player_id)::bigint from public.door_opens;
$$;

revoke all on function public.open_door(uuid, smallint) from public;
revoke all on function public.town_spirit() from public;
grant execute on function public.open_door(uuid, smallint) to anon, authenticated;
grant execute on function public.town_spirit() to anon, authenticated;
