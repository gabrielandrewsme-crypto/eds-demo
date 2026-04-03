create extension if not exists pgcrypto;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  unit_name text not null,
  work_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  opening_stock jsonb,
  closing_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_unit_name_work_date_key unique (unit_name, work_date)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  unit_name text not null,
  type text not null check (type in ('Falta', 'Reposicao')),
  description text not null,
  incident_date date not null,
  created_at timestamptz not null default now()
);

alter table public.shifts enable row level security;
alter table public.incidents enable row level security;

drop policy if exists "demo shifts select" on public.shifts;
drop policy if exists "demo shifts insert" on public.shifts;
drop policy if exists "demo shifts update" on public.shifts;
drop policy if exists "demo shifts delete" on public.shifts;
drop policy if exists "demo incidents select" on public.incidents;
drop policy if exists "demo incidents insert" on public.incidents;
drop policy if exists "demo incidents update" on public.incidents;
drop policy if exists "demo incidents delete" on public.incidents;

create policy "demo shifts select"
on public.shifts for select
to anon, authenticated
using (true);

create policy "demo shifts insert"
on public.shifts for insert
to anon, authenticated
with check (true);

create policy "demo shifts update"
on public.shifts for update
to anon, authenticated
using (true)
with check (true);

create policy "demo shifts delete"
on public.shifts for delete
to anon, authenticated
using (true);

create policy "demo incidents select"
on public.incidents for select
to anon, authenticated
using (true);

create policy "demo incidents insert"
on public.incidents for insert
to anon, authenticated
with check (true);

create policy "demo incidents update"
on public.incidents for update
to anon, authenticated
using (true)
with check (true);

create policy "demo incidents delete"
on public.incidents for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('machine-reports', 'machine-reports', true)
on conflict (id) do nothing;

drop policy if exists "demo machine reports select" on storage.objects;
drop policy if exists "demo machine reports insert" on storage.objects;
drop policy if exists "demo machine reports delete" on storage.objects;

create policy "demo machine reports select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'machine-reports');

create policy "demo machine reports insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'machine-reports');

create policy "demo machine reports delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'machine-reports');
