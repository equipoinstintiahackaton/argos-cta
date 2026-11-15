-- Clima reciente por departamento (seccion Ambiente)
create table if not exists clima_actual (
  fecha date not null,
  departamento text not null,
  temp_c real, temp_max_c real, humedad_pct real, viento_kmh real, precip_mm real,
  dias_sin_lluvia real, precip_30d real, precip_90d real, vpd_kpa real, temp_anom real, humedad_anom real,
  primary key (fecha, departamento)
);
alter table clima_actual enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'clima_actual' and policyname = 'lectura publica') then
    create policy "lectura publica" on clima_actual for select to anon, authenticated using (true);
  end if;
end $$;
