-- 009: columna metadata en transactions (faltaba en el schema desde 001)
--
-- El codigo la usa desde hace meses en TRES lugares y ninguno funcionaba:
--   1) ingestion/routes.ts arma `payload.metadata = { review_reason }` cuando el
--      comercio es un procesador de pago (MG-013) o cuando la IA cae a fallback
--      (MG-015). Como la columna no existia, el INSERT fallaba con
--      "Could not find the 'metadata' column" => 500 y la transaccion NO se
--      creaba. Esa es una de las causas de compras que nunca aparecieron.
--   2) transactions/routes.ts expone `review_reason: t?.metadata?.review_reason`
--      => siempre null, por eso la app nunca mostro el motivo (MG-076 traduce un
--      campo que no llegaba).
--   3) MG-080 agrega la lectura de `metadata.merged_from` en la query de dedup,
--      que al no existir la columna devolvio 500 en TODA la ingesta (22-nov).
--
-- Es aditiva: `default '{}'` no reescribe filas en PG 11+ y deja las 377
-- existentes con objeto vacio. No cambia ninguna otra tabla ni constraint.

alter table public.transactions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.transactions.metadata is
  'Metadatos de la transaccion: review_reason (payment_processor | ai_fallback:*), merged_from (id del duplicado absorbido en MG-080).';

-- Verificación (esperado: 1 fila, tipo jsonb, default {}):
-- select column_name, data_type, column_default from information_schema.columns
-- where table_name='transactions' and column_name='metadata';
