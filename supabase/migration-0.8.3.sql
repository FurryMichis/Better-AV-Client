-- Better AV Client 0.8.3 · «Escribiendo…» y «Visto» en Mensajes Better AV
-- Ejecutar en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- Requiere haber ejecutado antes la migración 0.8.0 (grupos de chat).
--
-- Qué añade:
--   · typing_status: quién está escribiendo ahora mismo en cada chat (dura unos segundos; se borra sola).
--   · set_typing / who_is_typing: avisar de que estás escribiendo y ver quién escribe.
--   · group_reads: hasta qué momento ha leído cada miembro un grupo (para «Visto por…»).
-- En los chats privados el «Visto» ya funciona con la columna read_at de la 0.6.6: no hace falta nada más.

-- 1) Tabla ---------------------------------------------------------------------------------------------
-- chat_key: 'dm:<uuid de la otra persona>' en un chat privado, 'g:<uuid del grupo>' en un grupo.
create table if not exists public.typing_status (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_key text not null check (char_length(chat_key) <= 60),
  at timestamptz not null default now(),
  primary key (user_id, chat_key)
);
create index if not exists typing_status_at on public.typing_status (at);

alter table public.typing_status enable row level security;
-- Sin políticas ni permisos directos: solo se toca con las funciones de abajo.
revoke all on public.typing_status from anon, authenticated;

-- 2) Avisar de que estás escribiendo -------------------------------------------------------------------
-- p_peer: la otra persona (chat privado) · p_group: el grupo. Se pasa uno solo de los dos.
create or replace function public.set_typing(p_peer uuid default null, p_group uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text;
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  if (p_peer is null) = (p_group is null) then raise exception 'Indica un chat o un grupo.'; end if;
  if p_peer is not null then
    -- solo entre amigos aceptados; la clave la lee la otra persona como «dm:<mi id>»
    if not public.nx_are_friends(me, p_peer) then return; end if;
    k := 'dm:' || p_peer::text;
  else
    if not public.is_group_member(p_group) then return; end if;
    k := 'g:' || p_group::text;
  end if;
  insert into public.typing_status (user_id, chat_key, at) values (me, k, now())
  on conflict (user_id, chat_key) do update set at = excluded.at;
  -- limpieza ocasional de avisos antiguos
  if random() < 0.02 then delete from public.typing_status where at < now() - interval '1 hour'; end if;
end $$;

-- 3) Ver quién escribe ---------------------------------------------------------------------------------
-- Devuelve a las personas (distintas de ti) que han avisado hace menos de 6 segundos.
create or replace function public.who_is_typing(p_peer uuid default null, p_group uuid default null)
returns table (user_id uuid, display_name text, username text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Inicia sesión primero.'; end if;
  if (p_peer is null) = (p_group is null) then raise exception 'Indica un chat o un grupo.'; end if;
  if p_peer is not null then
    return query
      select t.user_id, p.display_name, p.username
      from public.typing_status t join public.profiles p on p.id = t.user_id
      where t.user_id = p_peer and t.chat_key = 'dm:' || me::text
        and t.at > now() - interval '6 seconds' and public.nx_are_friends(me, p_peer);
  else
    if not public.is_group_member(p_group) then return; end if;
    return query
      select t.user_id, p.display_name, p.username
      from public.typing_status t join public.profiles p on p.id = t.user_id
      where t.chat_key = 'g:' || p_group::text and t.user_id <> me
        and t.at > now() - interval '6 seconds'
        and exists (select 1 from public.chat_group_members m where m.group_id = p_group and m.user_id = t.user_id);
  end if;
end $$;

-- 4) «Visto por…» en grupos ----------------------------------------------------------------------------
create or replace function public.group_reads(p_group uuid)
returns table (user_id uuid, last_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.last_read_at
  from public.chat_group_members m
  where m.group_id = p_group and public.is_group_member(p_group);
$$;

-- 5) Permisos: solo usuarios con sesión ----------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['set_typing(uuid, uuid)', 'who_is_typing(uuid, uuid)', 'group_reads(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
