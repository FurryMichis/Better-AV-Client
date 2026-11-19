-- Better AV Client 0.7.2 · Personalización de la cuenta Better AV (descripción, estado, pronombres, banner y color)
-- Ejecutar en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- Requiere haber ejecutado antes schema.sql (o las migraciones 0.5.6 y 0.6.1).

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
