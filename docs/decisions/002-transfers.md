# ADR 002 — Transferencias internas

**Pregunta §40.2:** ¿Transferencia entre cuentas propias afecta balance?

**Decisión propuesta:** NO afecta balance global. Es movimiento interno.

Implementación: Una Transaction `type=transfer` con `from_account_id` + `to_account_id` + `transfer_group_id` (uuid). Se crean 2 filas vinculadas (out/in) o 1 fila con ambos campos — elegimos 1 fila para simplicidad, con check `from != to`. Balance global = SUM(income) - SUM(expense); transfer excluido. Balance por cuenta sí cambia.

**Ejemplo:** Transfer $100.000 Corriente -> Vista: Corriente -100k, Vista +100k, global 0.

**Acción:** Confirmar si quieres ver transferencias en presupuesto (propuesta: no).
