# Architecture Spec v0.1

## Stack Recomendado (decisión tomada)
**Mobile:** React Native Expo (TypeScript) — alternativa evaluada: Flutter
**Backend DB/Auth/Realtime:** Supabase (PostgreSQL + RLS + Auth + Storage)
**Backend API + Ingestion + AI:** Node.js + Fastify (TypeScript) — desplegado en Render/Fly o Supabase Edge Functions
**IA:** Groq (llama-3.1-70b) via AIProvider abstraction
**Motivo:** 
- Velocity MVP: un solo lenguaje TS end-to-end, tipos compartidos (Zod schemas), desarrollo 30-40% más rápido para 2 personas
- RLS de Supabase resuelve §25 multiusuario sin código extra (vs Firebase que no tiene joins nativos)
- Expo + config plugin para NotificationListenerService (Android) — Flutter requeriría Dart + canal nativo similar, sin ventaja real
- Fastify permite AIProvider interface limpia (§32) con structured outputs JSON Schema
- Migración a Flutter posterior es posible manteniendo backend/Supabase intactos

> Si prioridad absoluta es UI premium pixel-perfect y animaciones complejas, cambiar a Flutter sin afectar backend. Arquitectura es agnóstica.

## Diagrama (§22 adaptado)
```
Mobile (Expo RN)
   | HTTPS + Supabase Client (Auth, Realtime)
   v
Supabase (Postgres + RLS)  <->  API Backend (Fastify)
                                  |-> Ingestion Service (Gmail Connector, Notification Events, PDF)
                                  |-> Parser (determinístico §14)
                                  |-> AI Service (AIProvider -> GroqProvider)
                                  |-> Deduplication + Rules Engine
```

## Módulos backend (§23)
auth, users, accounts, transactions, categories, budgets, sources, ingestion, parsing, ai, rules, notifications

## Pipeline (§13)
RAW_EVENT -> SOURCE_NORMALIZATION -> PARSER -> ENTITY_EXTRACTION -> TRANSACTION_CANDIDATE -> DEDUPLICATION -> AI_CLASSIFICATION -> USER_RULES -> FINAL_TRANSACTION
Estados: pending_ai -> pending_review -> confirmed/corrected/ignored/duplicate

## Decisiones ADR
- ADR-001: Supabase sobre Firebase por RLS y SQL para finanzas (balance, presupuestos requieren agregaciones)
- ADR-002: AIProvider interface para desacoplar Groq (Factory pattern, Zod validation, fallback)
- ADR-003: RawEvent inmutable y auditable, nunca se borra, solo se marca
- ADR-004: NotificationListener solo Android; iOS = Gmail + PDF + share extension
