-- Better AV Client 0.8.0 · Grupos de chat en «Mensajes Better AV»
-- Ejecutar en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- Requiere haber ejecutado antes schema.sql (o las migraciones anteriores: perfiles, amigos y mensajes directos 0.6.6).
--
-- Cómo funciona: un grupo lo crea una persona (propietaria) y solo puede añadir a sus AMIGOS aceptados.
-- Máximo 25 personas por grupo y 20 grupos creados por persona. Solo los miembros leen y escriben en el grupo.

-- 1) Tablas -----------------------------------------------------------------------------------------------
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user on public.chat_group_members (user_id);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_created on public.group_messages (group_id, created_at desc);

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.group_messages enable row level security;

-- 2) Funciones auxiliares ---------------------------------------------------------------------------------
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_group_members m where m.group_id = p_group and m.user_id = auth.uid());
$$;

create or replace function public.nx_are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- 3) Mensajes del grupo: solo los miembros leen y escriben (como ellos mismos) ---------------------------------
drop policy if exists group_messages_select on public.group_messages;
drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_select on public.group_messages
  for select to authenticated using (public.is_group_member(group_id));
create policy group_messages_insert on public.group_messages
  for insert to authenticated with check (sender_id = auth.uid() and public.is_group_member(group_id));

revoke all on public.chat_groups, public.chat_group_members, public.group_messages from anon, authenticated;
grant select, insert on public.group_messages to authenticated;   -- los grupos y miembros solo se tocan con las funciones de abajo

-- 4) Funciones de la app ----------------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_members uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid; u uuid; n int;
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  if not exists (select 1 from public.profiles where id = me) then raise exception 'Crea primero tu perfil Better AV.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 1 or char_length(p_name) > 40 then raise exception 'El nombre del grupo debe tener entre 1 y 40 caracteres.'; end if;
  select count(*) into n from public.chat_groups where owner_id = me;
  if n >= 20 then raise exception 'Has creado demasiados grupos (máximo 20).'; end if;
  insert into public.chat_groups (name, owner_id) values (p_name, me) returning id into gid;
  insert into public.chat_group_members (group_id, user_id) values (gid, me);
  for u in select distinct x from unnest(coalesce(p_members, '{}'::uuid[])) as x where x is not null and x <> me limit 24 loop
    if public.nx_are_friends(me, u) then
      insert into public.chat_group_members (group_id, user_id) values (gid, u) on conflict do nothing;
    end if;
  end loop;
  return gid;
end $$;

create or replace function public.list_groups()
returns table (group_id uuid, name text, owner_id uuid, member_count bigint, unread bigint,
               last_body text, last_at timestamptz, last_sender uuid, last_sender_name text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.owner_id,
         (select count(*) from public.chat_group_members x where x.group_id = g.id),
         (select count(*) from public.group_messages gm
           where gm.group_id = g.id and gm.sender_id <> auth.uid() and gm.created_at > m.last_read_at),
         lm.body, lm.created_at, lm.sender_id, coalesce(p.display_name, p.username)
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join lateral (select gm2.body, gm2.created_at, gm2.sender_id from public.group_messages gm2
                      where gm2.group_id = g.id order by gm2.created_at desc limit 1) lm on true
  left join public.profiles p on p.id = lm.sender_id
  where m.user_id = auth.uid()
  order by coalesce(lm.created_at, g.created_at) desc;
$$;

create or replace function public.group_members(p_group uuid)
returns table (user_id uuid, username text, display_name text, avatar text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar, (p.id = g.owner_id)
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_group_member(p_group)
  order by (p.id = g.owner_id) desc, m.joined_at;
$$;

create or replace function public.add_group_members(p_group uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u uuid; added int := 0; total int;
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  if not exists (select 1 from public.chat_groups where id = p_group and owner_id = me) then
    raise exception 'Solo quien creó el grupo puede añadir personas.';
  end if;
  select count(*) into total from public.chat_group_members where group_id = p_group;
  for u in select distinct x from unnest(coalesce(p_users, '{}'::uuid[])) as x where x is not null and x <> me limit 24 loop
    exit when total >= 25;
    if public.nx_are_friends(me, u) then
      insert into public.chat_group_members (group_id, user_id) values (p_group, u) on conflict do nothing;
      if found then added := added + 1; total := total + 1; end if;
    end if;
  end loop;
  return added;
end $$;

-- Irse del grupo (cualquiera) o expulsar a alguien (solo quien lo creó). Si se va quien lo creó, pasa a la persona más antigua;
-- si no queda nadie, el grupo se borra.
create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_owner boolean; nxt uuid;
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  select (owner_id = me) into is_owner from public.chat_groups where id = p_group;
  if is_owner is null then raise exception 'El grupo no existe.'; end if;
  if p_user <> me and not is_owner then raise exception 'Solo quien creó el grupo puede quitar a otras personas.'; end if;
  delete from public.chat_group_members where group_id = p_group and user_id = p_user;
  if p_user = me or p_user = (select owner_id from public.chat_groups where id = p_group) then
    select user_id into nxt from public.chat_group_members where group_id = p_group order by joined_at limit 1;
    if nxt is null then delete from public.chat_groups where id = p_group;
    else update public.chat_groups set owner_id = nxt where id = p_group and owner_id = p_user; end if;
  end if;
end $$;

create or replace function public.rename_group(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 1 or char_length(p_name) > 40 then raise exception 'El nombre del grupo debe tener entre 1 y 40 caracteres.'; end if;
  update public.chat_groups set name = p_name where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Solo quien creó el grupo puede cambiarle el nombre.'; end if;
end $$;

create or replace function public.delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_groups where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Solo quien creó el grupo puede borrarlo.'; end if;
end $$;

create or replace function public.mark_group_read(p_group uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_group_members set last_read_at = now() where group_id = p_group and user_id = auth.uid();
$$;

-- 5) Si se borra una cuenta que creó grupos, el grupo pasa a otro miembro (o se borra si no queda nadie)
create or replace function public.nx_group_owner_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; nxt uuid;
begin
  for g in select id from public.chat_groups where owner_id = old.id loop
    select user_id into nxt from public.chat_group_members where group_id = g.id and user_id <> old.id order by joined_at limit 1;
    if nxt is null then delete from public.chat_groups where id = g.id;
    else update public.chat_groups set owner_id = nxt where id = g.id; end if;
  end loop;
  return old;
end $$;
drop trigger if exists nx_group_owner_cleanup on public.profiles;
create trigger nx_group_owner_cleanup before delete on public.profiles
  for each row execute function public.nx_group_owner_cleanup();

-- 6) Permisos: solo usuarios con sesión
do $$
declare f text;
begin
  foreach f in array array[
    'create_group(text, uuid[])', 'list_groups()', 'group_members(uuid)', 'add_group_members(uuid, uuid[])',
    'remove_group_member(uuid, uuid)', 'rename_group(uuid, text)', 'delete_group(uuid)', 'mark_group_read(uuid)', 'is_group_member(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- uso interno (otras funciones y el disparador): nadie las llama desde la app
  revoke all on function public.nx_are_friends(uuid, uuid) from public, anon, authenticated;
  revoke all on function public.nx_group_owner_cleanup() from public, anon, authenticated;
end $$;
