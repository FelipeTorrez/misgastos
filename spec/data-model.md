# Data Model Spec v0.1 — PostgreSQL (Supabase)

## Entidades principales (§24)
### User (auth.users de Supabase)
- id (uuid, pk), email, created_at
- RLS: user solo ve sus filas donde user_id = auth.uid()

### Account (ADR-001 confirmado 2026-08-24: SIN investment en MVP)
- id, user_id (fk), name, type (enum: checking, vista, savings, credit_card, cash, digital_wallet), currency (CLP default), color, icon, include_in_balance (bool), credit_limit, last4, created_at
- Índices: (user_id)

### Category
- id, user_id (nullable para categorías sistema), name, slug, parent_id (self fk para jerarquía), type (expense/income/transfer/debt/subscription), is_system, created_at
- Seed 14 categorías §7 + debt/subscription subcategorías

### FinancialSource
- id, user_id, type (gmail, android_notification, manual, pdf, ios_share), config_json, status, created_at

### RawEvent (§12)
- id, user_id, source (fk FinancialSource), source_id, sender, subject, raw_content (text), received_at, metadata_json, created_at — INMUTABLE

### Transaction (§5, §29) — Cuotas solo como categoría en MVP (ADR-003)
- id, user_id, account_id (fk), category_id (fk), merchant, amount (bigint CLP), currency, type (expense/income/transfer), source (fk RawEvent nullable), payment_method, status (pending_ai, pending_review, confirmed, corrected, ignored, duplicate), confidence (0-1), duplicate_of (fk), installment_number, installment_total, original_amount, remaining_installments (campos existen pero no se usan en MVP), is_recurring_candidate, date (timestamptz), created_at, updated_at
- Transferencias (ADR-002 confirmado): **1 fila** `type=transfer` con `from_account_id` + `to_account_id` + `transfer_group_id`, NO afecta balance global
- RLS: WHERE user_id = auth.uid()

### Budget (§30) — ADR-004 confirmado: global + por categoría
- id, user_id, category_id (uuid nullable, null=global), amount, period (monthly), month (date), spent_generated (view), created_at
- Único: (user_id, month) cuando category_id is null + (user_id, category_id, month) cuando no null

### Rule (§18)
- id, user_id, merchant_normalized, preferred_category_id, preferred_merchant_alias, created_at, hits_count
- Matching exact normalized merchant -> override AI

### UserSettings (ciclo de facturación) — migración `006_user_settings.sql`
- user_id (uuid PK, FK auth.users), billing_cycle_day (int, 1-28, default 20), billing_cycle_enabled (boolean nullable: null=nunca configurado / false=rechazado / true=activo), created_at, updated_at
- RLS: `using (auth.uid() = user_id)`

### Merchant (opcional)
- id, user_id, name_normalized, alias, default_category_id

### Future (§24): RecurringTransaction, Subscription, Debt, Household, Invitation
- Household: id, name, created_by
- HouseholdMember: household_id, user_id, role (owner/member)
- Invitation: id, household_id, email, status

## RLS Políticas
- Enable RLS en todas las tablas con user_id
- Policy: USING (user_id = auth.uid()) y WITH CHECK igual

## Migraciones
- Ver `supabase/migrations/001_initial.sql` (generado en scaffold). `006_user_settings.sql` añade `user_settings` (ciclo de facturación).
