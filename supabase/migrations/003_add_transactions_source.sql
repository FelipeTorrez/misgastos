-- 003: columna source en transactions (parser | ai | rule)
-- Registra cómo fue clasificada cada transacción (§16 / Phase 8).
alter table transactions add column if not exists source text not null default 'ai';
