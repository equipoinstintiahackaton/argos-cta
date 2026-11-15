-- Registro de incendios (eventos agrupados desde las detecciones satelitales)
create table if not exists incendios (
  incendio_id int primary key,
  inicio timestamptz not null,
  fin timestamptz not null,
  duracion_h real not null,
  dias_activos int not null,
  n_focos int not null,
  n_celdas int not null,
  lat real not null,
  lon real not null,
  departamento text,
  frp_max_mw real,
  frp_total_mw real,
  tamano text,
  prolongado boolean,
  anio int,
  mes int,
  sensores text
);
alter table incendios enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'incendios' and policyname = 'lectura publica') then
    create policy "lectura publica" on incendios for select to anon, authenticated using (true);
  end if;
end $$;
