# Phase 2 Report — Manual + Fake Data

**Estado:** Completado (dataset 100 + validación UX/reglas)

## Dataset
- `tests/fixtures/dataset100.ts` — 100 filas determinísticas, distribución chilena Agosto 2026
- 4 ingresos (2.955.000), 94 gastos, 2 transferencias (150.000, excluidas de balance)
- Seed: `supabase/seed_phase2.sql` + `backend/scripts/seedPhase2.ts` (inserta con UUIDs reales, requiere SUPABASE_URL)
- Totales: `expectedTotals` validados en `backend/tests/phase2.dataset.test.ts`

## Reglas validadas (Phase 2)
- Balance = income - expense, transfer excluido (ADR-002)
- Presupuestos: global + por categoría (ADR-004) — global 1.8M, supermercado 350k etc
- Sin investment (ADR-001), cuotas solo como deuda categoría (ADR-003)
- Todo a revisión 1 semana (ADR-006) — manual entry status confirmed
- RLS aislado por user_id

## UX validada
- Dashboard: Balance grande + weekly S1-S4 (getUTCDate) con dataset 100 suma = balance mensual
- Movimientos: 100 filas, FlatList, filtros por categoría/cuenta, FAB + Agregar
- Presupuesto: BudgetBar global destacado + barras por categoría con % y queda
- Demo mode `mobile/src/lib/demoData.ts` para probar sin backend (20 txs demo)

## Cómo probar
```bash
# Validación local sin DB
npm test  # incluye phase2.dataset + phase2.integration100

# Con Supabase local
supabase start
psql -f supabase/migrations/001_initial.sql
psql -f supabase/migrations/002_phase1_fixes.sql
psql -f supabase/seed_phase2.sql
SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=... npx tsx backend/scripts/seedPhase2.ts
```
