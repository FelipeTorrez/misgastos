-- Phase 2 Seed — 100 transacciones realistas
-- Uso: psql -f supabase/seed_phase2.sql  (requiere usuario demo con id '00000000-0000-0000-0000-000000000001')
-- O via script TS backend/scripts/seed.ts

-- Cuentas demo (5)
insert into accounts (id, user_id, name, type, currency, include_in_balance) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Cuenta Corriente BCI','checking','CLP',true),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Cuenta RUT BancoEstado','vista','CLP',true),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Visa BCI','credit_card','CLP',true),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Efectivo','cash','CLP',true),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','Mach','digital_wallet','CLP',true)
on conflict (id) do nothing;

-- Presupuestos demo Agosto 2026 (global + 6 categorías) — valida ADR-004
insert into budgets (user_id, category_id, amount, month) values
('00000000-0000-0000-0000-000000000001', null, 1800000, '2026-08-01'), -- global
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='alimentacion' limit 1), 350000, '2026-08-01'),
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='transporte' limit 1), 200000, '2026-08-01'),
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='restaurantes' limit 1), 150000, '2026-08-01'),
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='suscripciones' limit 1), 60000, '2026-08-01'),
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='vivienda' limit 1), 900000, '2026-08-01'),
('00000000-0000-0000-0000-000000000001', (select id from categories where slug='deudas' limit 1), 750000, '2026-08-01')
on conflict do nothing;

-- Las 100 transacciones se insertan via backend/scripts/seed.ts para resolver category_id correctamente
