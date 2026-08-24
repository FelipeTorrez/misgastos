# MisGastos — Financial Intelligence App

**Stack:** Expo React Native (TS) + Supabase (Postgres + RLS) + Fastify Node + Groq

Ver `spec/` para Spec-Driven Development. Manifiesto original v0.1 analizado y convertido en 10 specs.

## Estructura
```
/spec          -> product, requirements, architecture, data-model, ai-agent-*, integrations, security, ux, testing, roadmap
/docs/decisions -> ADR 001-007 (§40)
/supabase/migrations -> 001_initial.sql (RLS + seed categorías)
/backend       -> Fastify + AIProvider (Groq)
/mobile        -> Expo RN
/tests         -> fixtures
```

## Quickstart (Phase 1)
```bash
# Supabase local
supabase start
psql -f supabase/migrations/001_initial.sql

# Backend
cd backend && npm install && npm run dev

# Mobile
cd mobile && npm install && npm start
```

## Roadmap
Phase 0 Spec ✅ hecho. Siguiente: Phase 1 Core Finance (ver spec/roadmap.md)

## Decisiones pendientes §40
Ver `docs/decisions/001-007`. Cada ADR tiene propuesta concreta para confirmar con el usuario antes de codificar.

## Circuito crítico §37
`INPUT "Compra $32.990 Lider" -> RawEvent -> Parser -> AI -> Transaction -> UI` — primer test E2E a implementar.
