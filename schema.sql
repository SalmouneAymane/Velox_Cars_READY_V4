-- VELOX CARS - Supabase production schema
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.settings (
  id integer primary key default 1 check (id=1),
  whatsapp text not null default '212668353949',
  phone text not null default '+212 668-353949',
  email text not null default 'contact@veloxcars.ma',
  address text not null default 'Maroc',
  updated_at timestamptz not null default now()
);
insert into public.settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.cars (
  id text primary key,
  name text not null,
  color text,
  year text,
  gear text,
  fuel text,
  description text,
  features jsonb not null default '[]'::jsonb,
  prices jsonb not null default '{"p1":0,"p2":0,"p3":0}'::jsonb,
  images text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  car_id text not null references public.cars(id) on delete restrict,
  car_name text,
  first_name text not null,
  nationality text,
  whatsapp text not null,
  birth date,
  license date,
  start_at timestamptz not null,
  end_at timestamptz not null,
  pickup text,
  dropoff text,
  message text,
  days integer not null,
  total numeric(12,2) not null,
  status text not null default 'En attente' check(status in ('En attente','Confirmée','Refusée')),
  created_at timestamptz not null default now(),
  constraint reservation_dates_valid check(end_at > start_at)
);
create index if not exists reservations_car_dates on public.reservations(car_id,start_at,end_at);

do $$ begin
  alter table public.reservations add constraint reservations_no_overlap
  exclude using gist (car_id with =, tstzrange(start_at,end_at,'[)') with &&)
  where (status in ('En attente','Confirmée'));
exception when duplicate_object then null; end $$;

create table if not exists public.car_blocks (
  id uuid primary key default gen_random_uuid(),
  car_id text not null references public.cars(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint block_dates_valid check(end_at > start_at)
);
create index if not exists car_blocks_car_dates on public.car_blocks(car_id,start_at,end_at);

do $$ begin
  alter table public.car_blocks add constraint car_blocks_no_overlap
  exclude using gist (car_id with =, tstzrange(start_at,end_at,'[)') with &&);
exception when duplicate_object then null; end $$;

create table if not exists public.search_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  car text not null,
  gear text,
  start_at timestamptz,
  end_at timestamptz,
  budget numeric(12,2),
  message text,
  status text not null default 'En attente',
  created_at timestamptz not null default now()
);

-- Public, privacy-safe calendar RPC: no customer information is returned.
create or replace function public.public_car_intervals()
returns table(car_id text,start_at timestamptz,end_at timestamptz,type text)
language sql security definer set search_path=public as $$
  select r.car_id,r.start_at,r.end_at,'booked'::text from public.reservations r
   where r.status in ('En attente','Confirmée')
  union all
  select b.car_id,b.start_at,b.end_at,'blocked'::text from public.car_blocks b;
$$;

create or replace function public.create_reservation(
  p_car_id text,p_first_name text,p_nationality text,p_whatsapp text,p_birth date,p_license date,
  p_start timestamptz,p_end timestamptz,p_pickup text,p_dropoff text,p_message text,p_days integer,p_total numeric
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.reservations;
begin
  if p_end <= p_start then raise exception 'invalid_dates'; end if;
  if exists(select 1 from public.car_blocks b where b.car_id=p_car_id and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'overlap'; end if;
  insert into public.reservations(car_id,car_name,first_name,nationality,whatsapp,birth,license,start_at,end_at,pickup,dropoff,message,days,total)
  select c.id,c.name,p_first_name,p_nationality,p_whatsapp,p_birth,p_license,p_start,p_end,p_pickup,p_dropoff,p_message,p_days,p_total
  from public.cars c where c.id=p_car_id and c.active=true returning * into r;
  if r.id is null then raise exception 'car_not_found'; end if;
  return to_jsonb(r);
exception when exclusion_violation then raise exception 'overlap';
end $$;

-- RLS
alter table public.settings enable row level security;
alter table public.cars enable row level security;
alter table public.reservations enable row level security;
alter table public.car_blocks enable row level security;
alter table public.search_requests enable row level security;

drop policy if exists settings_public_read on public.settings;
create policy settings_public_read on public.settings for select using (true);
drop policy if exists cars_public_read on public.cars;
create policy cars_public_read on public.cars for select using (active=true or auth.role()='authenticated');
drop policy if exists cars_admin_write on public.cars;
create policy cars_admin_write on public.cars for all to authenticated using (true) with check (true);
drop policy if exists reservations_admin_read on public.reservations;
create policy reservations_admin_read on public.reservations for select to authenticated using (true);
drop policy if exists reservations_admin_update on public.reservations;
create policy reservations_admin_update on public.reservations for update to authenticated using (true) with check (true);
drop policy if exists blocks_public_read on public.car_blocks;
create policy blocks_public_read on public.car_blocks for select using (true);
drop policy if exists blocks_admin_write on public.car_blocks;
create policy blocks_admin_write on public.car_blocks for all to authenticated using (true) with check (true);
drop policy if exists search_public_insert on public.search_requests;
create policy search_public_insert on public.search_requests for insert with check (true);
drop policy if exists search_admin_read on public.search_requests;
create policy search_admin_read on public.search_requests for select to authenticated using (true);
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated using (true) with check (true);

-- RPC permissions
revoke all on function public.public_car_intervals() from public;
grant execute on function public.public_car_intervals() to anon,authenticated;
revoke all on function public.create_reservation(text,text,text,text,date,date,timestamptz,timestamptz,text,text,text,integer,numeric) from public;
grant execute on function public.create_reservation(text,text,text,text,date,date,timestamptz,timestamptz,text,text,text,integer,numeric) to anon,authenticated;


-- Realtime feeds used by the two dashboards (safe to run more than once).
do $$ begin
  begin alter publication supabase_realtime add table public.cars; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reservations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.car_blocks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.search_requests; exception when duplicate_object then null; end;
end $$;

-- Storage bucket for car photos.
insert into storage.buckets(id,name,public) values('car-images','car-images',true) on conflict(id) do update set public=true;
drop policy if exists car_images_public_read on storage.objects;
create policy car_images_public_read on storage.objects for select using (bucket_id='car-images');
drop policy if exists car_images_admin_insert on storage.objects;
create policy car_images_admin_insert on storage.objects for insert to authenticated with check (bucket_id='car-images');
drop policy if exists car_images_admin_update on storage.objects;
create policy car_images_admin_update on storage.objects for update to authenticated using (bucket_id='car-images') with check (bucket_id='car-images');
drop policy if exists car_images_admin_delete on storage.objects;
create policy car_images_admin_delete on storage.objects for delete to authenticated using (bucket_id='car-images');

-- Seed fleet (only inserts missing cars).
insert into public.cars(id,name,color,year,gear,fuel,description,features,prices,sort_order) values
('duster','Dacia Duster','Beige / Sable','2025','Manuel','Diesel','SUV spacieux et confortable.','["Caméra arrière","Grand espace","Confort familial"]','{"p1":400,"p2":350,"p3":300}',1),
('picanto','Kia Picanto GT-Line','Vert clair','2025','Automatique','Essence','Compacte, moderne et agréable en ville.','["Automatique","Compacte","Design GT-Line"]','{"p1":350,"p2":320,"p3":290}',2),
('i10','Hyundai i10','Bleu foncé','2025','Automatique','Essence','Légère, pratique et confortable.','["Automatique","Caméra arrière","Confort"]','{"p1":350,"p2":320,"p3":290}',3),
('kardian','Renault Kardian','Vert foncé','2025','Automatique','Essence','SUV moderne avec équipements pratiques.','["Tout option","Démarrage bouton","Caméras tous angles"]','{"p1":500,"p2":450,"p3":400}',4),
('corsa','Opel Corsa','Gris','2025','Manuel','Diesel','Design moderne et conduite agréable.','["Caméra arrière","Confort","Design moderne"]','{"p1":400,"p2":350,"p3":300}',5),
('208gt','Peugeot 208 GT Line','Gris','2025','Manuel','Diesel','Finition GT Line avec équipements premium.','["Toit panoramique ouvrant","Caméras tous angles","Démarrage bouton"]','{"p1":450,"p2":400,"p3":350}',6),
('208style','Peugeot 208 Style','Gris','2025','Manuel','Diesel','Élégante et confortable au quotidien.','["Design élégant","Confort","Aides à la conduite"]','{"p1":400,"p2":350,"p3":300}',7)
on conflict(id) do nothing;
