-- Calidad de datos y backtesting (pantalla de estadisticas)
create table if not exists auditoria (
  orden int primary key,
  chequeo text not null,
  estado text not null,
  detalle text
);
create table if not exists auditoria_cobertura (
  anio int not null,
  sensor text not null,
  focos int not null,
  dias_con_focos int not null,
  primary key (anio, sensor)
);
create table if not exists backtest (
  anio int not null,
  modelo text not null,
  positivos int,
  tasa_base real,
  pr_auc real,
  roc_auc real,
  brier real,
  recall_top5 real,
  recall_top10 real,
  lift_top5 real,
  primary key (anio, modelo)
);

alter table auditoria enable row level security;
alter table auditoria_cobertura enable row level security;
alter table backtest enable row level security;

do $$
declare t text;
begin
  foreach t in array array['auditoria', 'auditoria_cobertura', 'backtest'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'lectura publica') then
      execute format('create policy "lectura publica" on %I for select to anon, authenticated using (true)', t);
    end if;
  end loop;
end $$;
