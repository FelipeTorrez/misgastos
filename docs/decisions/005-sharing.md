# ADR 005 — Compartición / Household

**Pregunta §40.5:** Finanzas independientes o espacio compartido?

**Decisión propuesta:** MVP: 100% independiente (user_id aislado, RLS). Schema preparado para Household (ver data-model.md) con `household_id` nullable en Account/Transaction, pero no implementado. Fase 10: Household con roles owner/member e Invitation.

**Justificación:** Evita complejidad permisos en MVP. Validar flujo personal antes de familiar.

**Acción:** Confirmar que 2 usuarios iniciales no comparten datos (propuesta: no).
