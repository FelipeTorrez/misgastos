# ADR 004 — Presupuestos

**Pregunta §40.4:** ¿Presupuesto basado solo en gastos o incluye ingresos?

**Decisión CONFIRMADA 2026-08-24:** **Solo gastos** + **presupuesto global además del por categoría** (usuario solicitó ambos).

`Budget { category_id (nullable), amount, period: monthly, month }`. Si `category_id==null` => presupuesto global. `spent = SUM(expense del mes)`; para categoría filtra por category_id. Ingresos no entran en presupuesto, solo en balance.

**Estado:** ✅ Cerrado
