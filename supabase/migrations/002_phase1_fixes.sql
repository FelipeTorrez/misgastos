-- Phase 1 fixes — decisiones 2026-08-24
-- 1) Quitar investment de accounts.type
alter table accounts drop constraint if exists accounts_type_check;
alter table accounts add constraint accounts_type_check check (type in ('checking','vista','savings','credit_card','cash','digital_wallet'));

-- 2) Presupuesto global: category_id nullable + constraint global único
alter table budgets alter column category_id drop not null;
alter table budgets drop constraint if exists budgets_user_id_category_id_month_key;
-- unicidad por índice parcial (no unique constraint simple con null)
create unique index if not exists budgets_category_unique on budgets(user_id, category_id, month) where category_id is not null;
create unique index if not exists budgets_global_unique on budgets(user_id, month) where category_id is null;

-- 3) Transfer check: from != to cuando es transfer
alter table transactions drop constraint if exists transfer_from_to_check;
alter table transactions add constraint transfer_from_to_check check (
  (type != 'transfer') or (from_account_id is not null and to_account_id is not null and from_account_id != to_account_id)
);
