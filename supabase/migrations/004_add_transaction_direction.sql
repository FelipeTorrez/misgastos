-- 004 — Agente Financiero: direction + counterparty para transacciones
alter table transactions
  add column if not exists direction text check (direction in ('in','out','internal','none')),
  add column if not exists counterparty text;

comment on column transactions.direction is 'Dirección financiera (Finan): in=entra income, out=sale expense, internal=traspaso transfer, none=no transacción';
comment on column transactions.counterparty is 'Contraparte de transferencia (ej Juan Pérez)';
