-- ARGOS v3: condiciones meteorologicas de los focos y vista de focos con coordenadas. Idempotente.

create table if not exists condiciones_focos (
  variable text not null,
  grupo text not null check (grupo in ('foco','base')),
  n integer,
  media real,
  p10 real,
  p25 real,
  p50 real,
  p75 real,
  p90 real,
  primary key (variable, grupo)
);

alter table condiciones_focos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'condiciones_focos' and policyname = 'lectura publica') then
    create policy "lectura publica" on condiciones_focos for select to anon, authenticated using (true);
  end if;
end $$;

-- Los focos guardan la geometria en PostGIS; esta vista la expone como lat/lon para el mapa.
-- security_invoker hace que se respete la politica de lectura publica de la tabla focos.
create or replace view focos_vista with (security_invoker = true) as
  select foco_id, ST_Y(geom) as lat, ST_X(geom) as lon, ts_utc, hora_local, instrumento,
         satelite, brillo_k, frp_mw, confianza_cat, dia_noche, h3_cell
  from focos;

grant select on focos_vista to anon, authenticated;
