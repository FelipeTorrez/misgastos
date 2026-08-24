# Product Spec — Financial Intelligence App v0.1

**Estado:** Draft / Discovery  
**Origen:** Product Manifest & Spec v0.1 (PDF 25 páginas)

## 1. Visión
App móvil Android + iOS para gestión financiera personal/familiar que automatiza registro, categorización y análisis. Principio: obtener → interpretar → validar → categorizar → registrar, antes de pedir intervención humana.

**Usuarios iniciales:** 2 (A: Android, B: iOS) con validación cruzada. Arquitectura multi-tenant desde día 1 (user_id en toda entidad financiera, RLS).

**Dos agentes IA:**
- Agent #1 Transaction Intelligence: texto no estructurado → JSON validado
- Agent #2 Financial Advisor: insights sobre datos estructurados (fase posterior)

## 2. Principios ( §3 )
- Automatización primero
- IA con supervisión humana (estados: pending_ai, pending_review, confirmed, corrected, ignored, duplicate + confidence)
- Corrección = señal de entrenamiento (Rule)
- IA desacoplada (AIProvider interface, Groq inicial)

## 3. Alcance MVP (§4-10, §36)
1. Registrar ingreso/gasto manual
2. Mostrar balance (mensual/semanal, ingresos-gastos, evolución, presupuesto restante)
3. Categorías configurables (14 iniciales + custom)
4. Deudas/Suscripciones/Cuotas como categoría/tipo en MVP, con campos preparados para evolucionar (installment_number, installment_total, original_amount, remaining_installments, is_recurring_candidate)
5. Recibir evento externo → transformarlo → categorizar → deduplicar → permitir corrección → recordar corrección → mostrar en dashboard

## 4. Validación factibilidad
**Veredicto: 9/10 — Totalmente factible.** Sin bloqueos técnicos. El manifiesto es de nivel producción. El roadmap Phases 0-10 es incremental y correcto. El circuito crítico §37 (texto → DB → UI) es el que debe validarse primero.

**Fortalezas:** Pipeline RawEvent bien diseñado (§12-13), Source Connector extensible (§11), deduplication contemplada (§15), separación Source/Interpretation/Transaction/Decision (§38), seguridad §21 correcta.

**Riesgos mitigables:** Gmail OAuth scope `gmail.readonly` es restricted (requiere verificación Google), iOS sin NotificationListener (mitigado con Gmail/PDF/manual §11.3), costos IA si se manda texto crudo sin parser previo (§14).
