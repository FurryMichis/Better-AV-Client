-- NotXunta Client 0.6.4 · Actualización de seguridad (base de datos)
-- Pégalo entero en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez sin problema.
-- Pone límites para que nadie pueda llenar la base de datos de basura desde su cuenta.

-- 1) Tamaños máximos en los vínculos con el aula (las filas que ya existan no se tocan: «not valid»)
alter table public.moodle_links drop constraint if exists moodle_links_len;
alter table public.moodle_links add constraint moodle_links_len
  check (char_length(site_key) <= 200 and char_length(fullname) <= 120) not valid;

-- 2) Nombres de archivo sin caracteres de control, y tipo MIME con forma de tipo MIME
alter table public.nx_files drop constraint if exists nx_files_clean;
alter table public.nx_files add constraint nx_files_clean
  check (name !~ '[[:cntrl:]]' and (mime = '' or mime ~ '^[A-Za-z0-9.+_-]+/[A-Za-z0-9.+_-]+$')) not valid;

-- 3) Máximo de filas por cuenta: 20 aulas vinculadas y 500 archivos
create or replace function public.nx_limit_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_table_name = 'moodle_links' then
    select count(*) into n from public.moodle_links where user_id = new.user_id;
    if n >= 20 then raise exception 'Demasiadas aulas vinculadas.'; end if;
  elsif tg_table_name = 'nx_files' then
    select count(*) into n from public.nx_files where user_id = new.user_id;
    if n >= 500 then raise exception 'Demasiados archivos.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.nx_limit_rows() from public, anon, authenticated;

drop trigger if exists moodle_links_limit on public.moodle_links;
create trigger moodle_links_limit before insert on public.moodle_links
  for each row execute function public.nx_limit_rows();
drop trigger if exists nx_files_limit on public.nx_files;
create trigger nx_files_limit before insert on public.nx_files
  for each row execute function public.nx_limit_rows();
