-- 008: dedup_key + índice único — cierra la ventana de la dedup concurrente
--
-- Motivo (caso real 22-nov 23:27): la misma compra de $1.300 en "RedGloba BREAK"
-- entró DOS veces, desde Wallet a las 23:27:02.543 y desde Falabella a las
-- 23:27:02.581 (38 ms). La dedup §15 (backend/src/modules/ingestion/dedup.ts) es
-- `leer → comparar → insertar`: las dos peticiones leyeron las últimas 50
-- transacciones antes de que la otra insertara, así que ninguna vio a la otra y
-- la dedup no matcheó. Un mutex en memoria no sirve (Railway puede levantar más
-- de una réplica); la serialización tiene que vivir en la base.
--
-- `dedup_key` = md5(amount | type | merchant_normalizado | YYYY-MM-DD HH:MM),
-- calculado en la ingesta (dedupKey() en dedup.ts). Ventana de 1 minuto: más
-- estricta que los 60 min de la dedup en memoria, así que dos compras legítimas
-- del mismo monto el mismo día (dos cafés a horas distintas) no colisionan.
--
-- Por qué el índice es PARCIAL (`where dedup_key is not null`) y no
-- `where status <> 'duplicate'`: el predicado de un índice debe evaluarse con
-- una expresión estable y `status` cambia (PATCH /v1/transactions puede pasar
-- una fila de 'duplicate' a 'confirmed'; ver transactions/routes.test.ts). Se
-- resolvió del otro lado: la ingesta escribe `dedup_key = null` en las filas
-- 'duplicate' y sólo la fila que aspira a ser el original lleva la clave. Con
-- eso el índice protege exactamente lo que hay que proteger (dos originales con
-- la misma huella) y no depende de `status`.
--
-- AVISO PARA QUIEN APLIQUE: esta migración debe correr ANTES de desplegar el
-- código que inserta dedup_key. Si el código sale primero, el INSERT falla con
-- `column "dedup_key" of relation "transactions" does not exist`. Esta migración
-- no toca filas existentes (quedan con dedup_key null, sin conflicto) ni borra
-- duplicados históricos.
--
-- Aplicación (humano, fuera de este repo): `npm run setup-supabase` aplica
-- 001→008, o pegar este archivo en el SQL Editor de Supabase.

alter table public.transactions
  add column if not exists dedup_key text;

create unique index if not exists transactions_user_dedup_key_idx
  on public.transactions (user_id, dedup_key)
  where dedup_key is not null;

comment on column public.transactions.dedup_key is
  'Huella anti-duplicado concurrente: md5(amount|type|merchant_normalizado|YYYY-MM-DD HH:MM). null en filas duplicate o sin hora.';

-- Verificación (esperado: 1 fila, indexdef con UNIQUE y WHERE dedup_key IS NOT NULL):
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public' and indexname = 'transactions_user_dedup_key_idx';
