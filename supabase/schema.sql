-- =====================================================================
-- Better AV Client · cuentas propias y amigos (Supabase / PostgreSQL)
-- Pégalo entero en: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- Perfil público de cada cuenta Better AV (la contraseña/Google los gestiona Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  discoverable boolean not null default true,      -- ¿pueden encontrarme mis compañeros de aula?
  avatar text check (avatar is null or (char_length(avatar) <= 60000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')),  -- foto de perfil (128×128)
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar text;
alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Vínculo "esta cuenta Better AV es el usuario X de tal aula" (solo si la persona lo permite).
-- OJO: es declarativo, no se verifica contra el aula. Quien se vincula primero se queda con ese usuario.
create table if not exists public.moodle_links (
  site_key text not null,
  moodle_user_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  fullname text not null default '',
  primary key (site_key, moodle_user_id)
);
create index if not exists moodle_links_user on public.moodle_links (user_id);
alter table public.moodle_links enable row level security;
drop policy if exists links_own_select on public.moodle_links;
drop policy if exists links_own_insert on public.moodle_links;
drop policy if exists links_own_update on public.moodle_links;
drop policy if exists links_own_delete on public.moodle_links;
create policy links_own_select on public.moodle_links for select to authenticated using (user_id = auth.uid());
create policy links_own_insert on public.moodle_links for insert to authenticated with check (user_id = auth.uid());
create policy links_own_update on public.moodle_links for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy links_own_delete on public.moodle_links for delete to authenticated using (user_id = auth.uid());

-- Amistades (solo se crean/aceptan mediante las funciones de abajo)
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;
drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_delete on public.friendships;
create policy friendships_select on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy friendships_delete on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- Ajustes sincronizados entre ordenadores (una fila por cuenta; solo la ve su dueño)
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  look jsonb not null default '{}'::jsonb,
  look_at bigint not null default 0,
  prefs jsonb not null default '{}'::jsonb,
  prefs_at bigint not null default 0,
  accounts jsonb not null default '[]'::jsonb,    -- aulas (nombre, enlace, usuario, icono). NUNCA contraseñas
  accounts_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  check (octet_length(look::text) <= 1500000),
  check (octet_length(prefs::text) <= 4000),
  check (octet_length(accounts::text) <= 400000)
);
alter table public.user_settings enable row level security;
drop policy if exists settings_select on public.user_settings;
drop policy if exists settings_insert on public.user_settings;
drop policy if exists settings_update on public.user_settings;
drop policy if exists settings_delete on public.user_settings;
create policy settings_select on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy settings_insert on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy settings_update on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_delete on public.user_settings for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Funciones (security definer: exponen solo lo imprescindible)
-- ---------------------------------------------------------------------

-- ¿Quién de estos usuarios de un aula usa Better AV Client? (solo perfiles "discoverable")
create or replace function public.find_moodle_users(p_site text, p_ids bigint[])
returns table (moodle_user_id bigint, user_id uuid, username text, display_name text)
language sql stable security definer set search_path = public as $$
  select l.moodle_user_id, p.id, p.username, p.display_name
  from public.moodle_links l join public.profiles p on p.id = l.user_id
  where auth.uid() is not null and l.site_key = p_site
    and l.moodle_user_id = any (p_ids[1:500]) and p.discoverable;
$$;

-- Buscar a alguien por nombre de usuario exacto
drop function if exists public.find_user(text);
create function public.find_user(p_username text)
returns table (id uuid, username text, display_name text, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar from public.profiles p
  where auth.uid() is not null and p.username = lower(p_username) and p.discoverable and p.id <> auth.uid();
$$;

drop function if exists public.list_friends();
create function public.list_friends()
returns table (friendship_id bigint, other_id uuid, username text, display_name text, status text, i_requested boolean, avatar text)
language sql stable security definer set search_path = public as $$
  select f.id, p.id, p.username, p.display_name, f.status, (f.requester = auth.uid()), p.avatar
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

create or replace function public.send_friend_request(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ex public.friendships%rowtype;
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  if p_user = me then raise exception 'No puedes añadirte a ti mismo.'; end if;
  if not exists (select 1 from public.profiles where id = me) then raise exception 'Crea tu perfil primero.'; end if;
  select * into ex from public.friendships
   where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);
  if found then
    if ex.status = 'pending' and ex.addressee = me then
      update public.friendships set status = 'accepted' where id = ex.id;   -- ya te había enviado él una solicitud
      return 'accepted';
    end if;
    return ex.status;
  end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'Tienes demasiadas solicitudes pendientes.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and discoverable) then
    raise exception 'Ese usuario no existe o no acepta solicitudes.';
  end if;
  insert into public.friendships (requester, addressee) values (me, p_user);
  return 'pending';
end; $$;

create or replace function public.respond_friend_request(p_id bigint, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted' where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end; $$;

-- Borrar mi cuenta y todos mis datos
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  delete from auth.users where id = auth.uid();   -- borra en cascada perfil, vínculos y amistades
end; $$;

-- Solo usuarios con sesión pueden llamar a las funciones
do $$
declare f text;
begin
  foreach f in array array[
    'find_moodle_users(text,bigint[])', 'find_user(text)', 'list_friends()',
    'send_friend_request(uuid)', 'respond_friend_request(bigint,boolean)', 'delete_my_account()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 0.6.1 · estado «en línea» + Archivos Better AV (lo mismo que migration-0.6.1.sql)
-- =====================================================================
-- ---------------------------------------------------------------------
-- 1) Estado «en línea»
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists show_online boolean not null default true;   -- ¿dejo que mis amigos vean cuándo estoy conectado?
alter table public.profiles add column if not exists last_seen timestamptz;

-- La app llama a esto cada ~45 s mientras está abierta (solo si el usuario permite mostrar su estado).
create or replace function public.heartbeat()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid() and show_online;
$$;

-- Al cerrar sesión o desactivar el estado: desaparece al instante.
create or replace function public.go_offline()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen = null where id = auth.uid();
$$;

-- list_friends ahora también devuelve si el amigo está en línea y cuándo se le vio por última vez.
-- Solo lo ve quien ya es su amigo (status = 'accepted') y solo si él lo permite.
drop function if exists public.list_friends();
create function public.list_friends()
returns table (friendship_id bigint, other_id uuid, username text, display_name text, status text, i_requested boolean, avatar text,
               online boolean, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, p.id, p.username, p.display_name, f.status, (f.requester = auth.uid()), p.avatar,
         coalesce(f.status = 'accepted' and p.show_online and p.last_seen > now() - interval '2 minutes', false),
         case when f.status = 'accepted' and p.show_online then p.last_seen else null end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- 2) Archivos Better AV (almacenados en tu cuenta, visibles desde cualquier ordenador)
--    Límites: cámbialos aquí si quieres (en bytes). La app los lee del servidor, no hace falta recompilar.
-- ---------------------------------------------------------------------
create or replace function public.nx_quota()    returns bigint language sql immutable as $$ select 104857600::bigint $$;  -- 100 MB por cuenta
create or replace function public.nx_max_file() returns bigint language sql immutable as $$ select 26214400::bigint $$;   -- 25 MB por archivo

-- Nombres de los archivos (el contenido va al Storage, en el bucket privado «nx-files»)
create table if not exists public.nx_files (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  mime text not null default '' check (char_length(mime) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists nx_files_user on public.nx_files (user_id, created_at desc);
alter table public.nx_files enable row level security;

-- Espacio usado por quien llama (suma del tamaño REAL de sus objetos en el Storage)
create or replace function public.nx_used_me()
returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'nx-files' and (storage.foldername(o.name))[1] = auth.uid()::text;
$$;

drop policy if exists nx_files_select on public.nx_files;
drop policy if exists nx_files_insert on public.nx_files;
drop policy if exists nx_files_delete on public.nx_files;
create policy nx_files_select on public.nx_files for select to authenticated using (user_id = auth.uid());
create policy nx_files_insert on public.nx_files for insert to authenticated
  with check (user_id = auth.uid() and public.nx_used_me() < public.nx_quota());
create policy nx_files_delete on public.nx_files for delete to authenticated using (user_id = auth.uid());

-- Bucket privado (nadie puede leerlo sin sesión) con límite por archivo
insert into storage.buckets (id, name, public, file_size_limit)
values ('nx-files', 'nx-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Cada cuenta solo toca su propia carpeta: nx-files/<su id>/…
drop policy if exists nx_files_obj_select on storage.objects;
drop policy if exists nx_files_obj_insert on storage.objects;
drop policy if exists nx_files_obj_delete on storage.objects;
create policy nx_files_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'nx-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy nx_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nx-files' and (storage.foldername(name))[1] = auth.uid()::text and public.nx_used_me() < public.nx_quota());
create policy nx_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nx-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lista de mis archivos (solo los que tienen contenido subido de verdad)
drop function if exists public.nx_files_list();
create function public.nx_files_list()
returns table (id uuid, name text, mime text, size bigint, created_at timestamptz)
language sql stable security definer set search_path = public, storage as $$
  select f.id, f.name, f.mime, coalesce((o.metadata->>'size')::bigint, 0), f.created_at
  from public.nx_files f
  join storage.objects o on o.bucket_id = 'nx-files' and o.name = f.user_id::text || '/' || f.id::text
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

drop function if exists public.nx_files_usage();
create function public.nx_files_usage()
returns table (used bigint, quota bigint, max_file bigint, files integer)
language sql stable security definer set search_path = public, storage as $$
  select public.nx_used_me(), public.nx_quota(), public.nx_max_file(),
         (select count(*)::int from public.nx_files where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 3) Permisos: solo usuarios con sesión
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'heartbeat()', 'go_offline()', 'list_friends()',
    'nx_quota()', 'nx_max_file()', 'nx_used_me()', 'nx_files_list()', 'nx_files_usage()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Better AV Client 0.6.6 · Mensajería directa entre amigos
-- Ejecutar en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists direct_messages_pair_created
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_recipient_unread
  on public.direct_messages (recipient_id, created_at desc) where read_at is null;

alter table public.direct_messages enable row level security;
drop policy if exists direct_messages_select on public.direct_messages;
drop policy if exists direct_messages_insert on public.direct_messages;
drop policy if exists direct_messages_read on public.direct_messages;

create policy direct_messages_select on public.direct_messages
  for select to authenticated
  using (auth.uid() in (sender_id, recipient_id));

-- Solo se puede escribir a una persona con la que exista amistad aceptada.
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = recipient_id)
          or (f.addressee = auth.uid() and f.requester = recipient_id))
    )
  );

-- Solo el destinatario puede marcar como leído y no puede cambiar el contenido.
create policy direct_messages_read on public.direct_messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

revoke all on public.direct_messages from anon, authenticated;
grant select, insert on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;

-- =====================================================================
-- 0.7.2 · personalización de la cuenta (lo mismo que migration-0.7.2.sql)
-- =====================================================================

-- 1) Columnas nuevas del perfil (todas opcionales)
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists status_text text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists banner text;
alter table public.profiles add column if not exists accent text;

alter table public.profiles drop constraint if exists profiles_extras_check;
alter table public.profiles add constraint profiles_extras_check check (
  (bio is null or char_length(bio) <= 200)
  and (status_text is null or char_length(status_text) <= 60)
  and (pronouns is null or char_length(pronouns) <= 20)
  and (accent is null or accent ~ '^#[0-9a-fA-F]{6}$')
  and (banner is null or (char_length(banner) <= 100000 and banner ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))
);

-- 2) list_friends devuelve también el estado y el color (textos cortos). El banner NO va aquí para no cargar la lista:
--    se pide solo al abrir la tarjeta de un perfil (get_profile_card).
drop function if exists public.list_friends();
create function public.list_friends()
returns table (friendship_id bigint, other_id uuid, username text, display_name text, status text, i_requested boolean, avatar text,
               online boolean, last_seen timestamptz, status_text text, accent text)
language sql stable security definer set search_path = public as $$
  select f.id, p.id, p.username, p.display_name, f.status, (f.requester = auth.uid()), p.avatar,
         coalesce(f.status = 'accepted' and p.show_online and p.last_seen > now() - interval '2 minutes', false),
         case when f.status = 'accepted' and p.show_online then p.last_seen else null end,
         p.status_text, p.accent
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
$$;

-- 3) Tarjeta de perfil completa: la ve la propia persona, sus amigos y cualquiera que pueda encontrarla (discoverable)
create or replace function public.get_profile_card(p_user uuid)
returns table (id uuid, username text, display_name text, avatar text, bio text, status_text text, pronouns text,
               banner text, accent text, is_friend boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar, p.bio, p.status_text, p.pronouns, p.banner, p.accent,
         exists (select 1 from public.friendships f
                 where f.status = 'accepted'
                   and ((f.requester = auth.uid() and f.addressee = p.id) or (f.addressee = auth.uid() and f.requester = p.id)))
  from public.profiles p
  where auth.uid() is not null and p.id = p_user
    and (p.id = auth.uid() or p.discoverable
         or exists (select 1 from public.friendships f
                    where f.status = 'accepted'
                      and ((f.requester = auth.uid() and f.addressee = p.id) or (f.addressee = auth.uid() and f.requester = p.id))));
$$;

do $$
declare f text;
begin
  foreach f in array array['list_friends()', 'get_profile_card(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 0.8.0 · grupos de chat (lo mismo que migration-0.8.0.sql)
-- =====================================================================
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
