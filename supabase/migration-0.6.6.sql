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
