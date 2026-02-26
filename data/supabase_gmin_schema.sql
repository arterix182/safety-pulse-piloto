-- GMIN directory (from Numerico Hourly SLS Lideres)
create table if not exists public.gmin_directory (
  gmin bigint primary key,
  worker text,
  legal_name text,
  work_shift text,
  plant text,
  manager_name text,
  manager_gmin bigint,
  hire_date date,
  length_of_service_years double precision,
  original_hire_date date,
  continuous_service_date date,
  created_at timestamptz default now()
);

create index if not exists gmin_directory_manager_gmin_idx on public.gmin_directory (manager_gmin);
create index if not exists gmin_directory_hire_date_idx on public.gmin_directory (hire_date);

-- Managers (special mapping for Area / Turno)
create table if not exists public.managers (
  gmin bigint primary key,
  manager text,
  area text,
  turno text,
  created_at timestamptz default now()
);
