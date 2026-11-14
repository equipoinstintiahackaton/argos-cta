-- Esquema ARGOS (Supabase / Postgres + PostGIS)
create extension if not exists postgis;

-- Grilla H3 que cubre Catamarca
create table if not exists celdas (
  h3_cell text primary key,
  lat double precision not null,
  lon double precision not null,
  geom geometry(Polygon, 4326) not null
);
create index if not exists celdas_geom_idx on celdas using gist (geom);

-- Focos armonizados MODIS + VIIRS (ya deduplicados)
create table if not exists focos (
  foco_id bigint primary key,
  geom geometry(Point, 4326) not null,
  h3_cell text references celdas(h3_cell),
  ts_utc timestamptz not null,
  hora_local smallint,
  instrumento text,
  satelite text,
  res_m integer,
  brillo_k real,
  frp_mw real,
  confianza_cat text,
  confianza_num real,
  dia_noche text,
  n_detecciones integer default 1,
  fuentes text
);
create index if not exists focos_geom_idx on focos using gist (geom);
create index if not exists focos_ts_idx on focos (ts_utc);
create index if not exists focos_cell_idx on focos (h3_cell);

-- Condiciones (features) resumidas por celda y fecha. Solo los ultimos dias:
-- el historico completo vive en Parquet para no agotar el plan gratuito.
create table if not exists condiciones (
  h3_cell text references celdas(h3_cell),
  fecha date not null,
  ndvi_anom real,
  lst_anom real,
  temp_c real,
  humedad_pct real,
  viento_kmh real,
  precip_mm real,
  dias_sin_lluvia integer,
  primary key (h3_cell, fecha)
);

-- Probabilidad de ocurrencia por celda y fecha
create table if not exists riesgo (
  h3_cell text references celdas(h3_cell),
  fecha date not null,
  probabilidad real not null check (probabilidad between 0 and 1),
  nivel text not null check (nivel in ('bajo','medio','alto','critico')),
  factores jsonb,
  modelo_version text,
  primary key (h3_cell, fecha)
);

-- Alertas generadas segun el nivel de riesgo
create table if not exists alertas (
  id bigserial primary key,
  h3_cell text references celdas(h3_cell),
  fecha date not null,
  nivel text not null,
  probabilidad real,
  motivo text,
  enviada boolean default false,
  creada_en timestamptz default now()
);

-- Indicador de origen probable (apoyo, NO determinante)
create table if not exists origen_estimado (
  foco_id bigint primary key references focos(foco_id),
  score_humano real not null check (score_humano between 0 and 1),
  confianza text not null check (confianza in ('baja','media','alta')),
  factores jsonb,
  calculado_en timestamptz default now()
);

-- Registro de incendios documentados (carga manual desde fuentes oficiales).
-- Categorias de origen alineadas con la planilla del equipo.
create table if not exists incendios_oficiales (
  id bigserial primary key,
  fecha date,
  departamento text,
  localidad text,
  lat double precision,
  lon double precision,
  superficie_ha real,
  vegetacion text,
  actividad_electrica text,
  origen_informado text check (origen_informado in
    ('Natural','Accidental','Negligente','Intencional','Desconocido')),
  estado_info text,
  fuente text,
  enlace text
);
