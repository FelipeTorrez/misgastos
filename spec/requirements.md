# Requirements Spec v0.1 — Funcionales y No Funcionales

## Funcionales MVP (criterio §36)
- [ ] F-01 Ingreso manual (sueldo, transferencia, depósito, otros)
- [ ] F-02 Gasto manual con campos mínimos §5
- [ ] F-03 Balance financiero (Ingresos - Gastos) mensual/semanal/evolución (§6)
- [ ] F-04 Categorías configurables + personalizadas (§7)
- [ ] F-05 Deudas/Suscripciones/Cuotas como categoría con campos preparados (§8-10)
- [ ] F-06 Pipeline RawEvent (§12-13) + Parser determinístico (§14)
- [ ] F-07 AI Classification Agent #1 (§16-17) con JSON Schema validado
- [ ] F-08 Deduplication por monto+fecha+comercio+cuenta (§15)
- [ ] F-09 Bandeja revisión IA (§28) con confirmar/editar en segundos
- [ ] F-10 Reglas por corrección (§18): merchant -> categoría preferida
- [ ] F-11 Android NotificationListenerService (§11.2)
- [ ] F-12 Gmail ingestion vía reenvío selectivo luego OAuth (§11.1)
- [ ] F-13 iOS parity con Gmail/PDF/manual/share (§11.3)
- [ ] F-14 Multiusuario aislado (§25) + RLS
- [ ] F-15 Exportar/eliminar datos (§21)

## No funcionales
- NF-01 Seguridad §21: nunca API keys en cliente, tokens cifrados, TLS, encryption at rest (Supabase), mínimo privilegio, logs sin PII financiera
- NF-02 Performance: pipeline <2s para evento simple, dashboard <500ms con 10k transacciones (paginación)
- NF-03 Confiabilidad: RawEvent inmutable, audit log, idempotencia en ingestion (source_id unique)
- NF-04 Escalabilidad: multi-tenant desde día 1, sin queries globales sin user_id
- NF-05 Offline-first parcial: manual entry funciona offline y sincroniza

## Decisiones pendientes §40 (ver decisions/001-...md)
1. Cuentas — ver decisión
2. Transferencias internas
3. Tarjeta crédito
4. Presupuestos
5. Compartición
6. Automatización / confirmación
7. IA inputs / abstención
