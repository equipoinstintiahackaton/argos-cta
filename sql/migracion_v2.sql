-- ARGOS v2: departamentos, escala de 7 niveles y estadisticas. Idempotente.

alter table celdas add column if not exists departamento text;

create table if not exists departamentos (
  nombre text primary key,
  n_celdas integer,
  geojson jsonb
);

alter table riesgo  add column if not exists indice real;
alter table riesgo  add column if not exists banda text;
alter table alertas add column if not exists indice real;
alter table alertas add column if not exists banda text;

create table if not exists riesgo_depto (
  departamento text not null,
  fecha date not null,
  probabilidad real not null,
  banda text not null,
  n_celdas integer,
  primary key (departamento, fecha)
);

create table if not exists stats_mensual (
  anio integer not null,
  mes integer not null,
  departamento text not null,
  focos integer,
  focos_confiables integer,
  frp_total_mw real,
  celdas_afectadas integer,
  primary key (anio, mes, departamento)
);

create table if not exists stats_hora (
  departamento text not null,
  hora integer not null,
  focos integer,
  primary key (departamento, hora)
);

-- Que ocurrio realmente en cada banda de la escala (datos de prueba)
create table if not exists escala_bandas (
  banda text primary key,
  orden integer,
  desde integer,
  hasta integer,
  frac_celdas_dia real,
  frecuencia_observada real,
  lift real
);

-- Confiabilidad de la probabilidad por departamento: prometido vs observado
create table if not exists calibracion_depto (
  banda text primary key,
  orden integer,
  n integer,
  prometido real,
  observado real
);

alter table departamentos      enable row level security;
alter table riesgo_depto       enable row level security;
alter table stats_mensual      enable row level security;
alter table stats_hora         enable row level security;
alter table escala_bandas      enable row level security;
alter table calibracion_depto  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['departamentos','riesgo_depto','stats_mensual','stats_hora','escala_bandas','calibracion_depto']
  loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'lectura publica') then
      execute format('create policy "lectura publica" on %I for select to anon, authenticated using (true)', t);
    end if;
  end loop;
end $$;
