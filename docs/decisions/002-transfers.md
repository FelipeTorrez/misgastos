# ADR 002 — Transferencias internas

**Pregunta §40.2:** ¿Transferencia entre cuentas propias afecta balance?

**Decisión CONFIRMADA 2026-08-24:** NO afecta balance global. Es movimiento interno. **Modelo 1 fila** con `from_account_id` + `to_account_id` + `transfer_group_id` (usuario confirmó "solo mueve entre cuentas, 1 no 2").

Balance global = SUM(income) - SUM(expense); transfer excluido. Balance por cuenta sí cambia (ej: Corriente -100k, Vista +100k, global 0). Transferencias NO entran en presupuestos.

**Estado:** ✅ Cerrado
