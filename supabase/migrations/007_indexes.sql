-- MisGastos — 007: índices por (user_id, date) y medición de raw_events
-- Motivo (hallazgo de escalado): antes de esta migración sólo existían PK y los
-- índices únicos parciales de budgets. Todas las consultas de la app filtran por
-- user_id y ordenan/paginar por date (transactions), received_at (raw_events) o
-- month (budgets), así que Postgres hacía Seq Scan + Sort en cada request.
-- Con ~350 filas el costo es despreciable; con decenas de miles no.
--
-- Consultas que justifican cada índice (ver backend/src/modules):
--   transactions_user_date_idx     GET /v1/transactions  (user_id = ? order by date desc limit N)
--                                  GET /v1/balance, /v1/budgets (user_id = ? and date >= ? and date < ?)
--   transactions_user_category_idx GET /v1/transactions?category_id=?, agregados por categoría
--   raw_events_user_received_idx   GET /v1/raw-events     (user_id = ? order by received_at desc)
--   budgets_user_month_idx         GET /v1/budgets        (user_id = ? and month = ?)
--
-- Por qué NO se usa CONCURRENTLY:
--   `create index concurrently` no puede ejecutarse dentro de un bloque de
--   transacción (ERROR 25001). `backend/scripts/setup-supabase.mjs` envuelve cada
--   migración en BEGIN/COMMIT y el SQL Editor de Supabase también la ejecuta en
--   una transacción, por lo que CONCURRENTLY fallaría. Se usa `create index if
--   not exists` (idempotente). Si en el futuro hay que crear un índice sobre una
--   tabla grande con tráfico, correrlo a mano FUERA de transacción, p. ej.:
--     create index concurrently if not exists ... on public.<tabla>(...);
--   (en el peor caso CONCURRENTLY deja un índice INVALID si se corta: dropear y
--   recrear).

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

create index if not exists raw_events_user_received_idx
  on public.raw_events (user_id, received_at desc);

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month);

-- ---------------------------------------------------------------------------
-- Retención de raw_events — SOLO MEDICIÓN, sin borrados
-- ---------------------------------------------------------------------------
-- Decisión pendiente de Felipe: raw_events guarda el texto crudo de cada correo
-- y notificación y hoy crece sin límite. Esta migración NO borra ni programa
-- borrados. Para medir el crecimiento antes de decidir una política, correr:
--
-- select count(*) as eventos,
--        pg_size_pretty(pg_total_relation_size('public.raw_events')) as tamaño_total,
--        pg_size_pretty(avg(length(raw_content))::bigint) as promedio_raw_content,
--        min(received_at) as mas_antiguo,
--        max(received_at) as mas_reciente
-- from public.raw_events;
--
-- select date_trunc('month', received_at) as mes,
--        count(*) as eventos,
--        pg_size_pretty(sum(pg_column_size(raw_content))::bigint) as bytes_raw_content
-- from public.raw_events
-- group by 1 order by 1 desc;
--
-- Verificación (esperado: 4 índices nuevos en la lista):
-- select indexname from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('transactions_user_date_idx','transactions_user_category_idx',
--                     'raw_events_user_received_idx','budgets_user_month_idx');
