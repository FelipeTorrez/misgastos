# MisGastos — Financial Intelligence App

**Stack:** Expo SDK 53 (web por defecto) + Supabase (Postgres RLS) + Fastify + Groq

## Quickstart localhost (web por defecto)
```bash
# Backend
cd backend
# .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT=3000
powershell -ExecutionPolicy Bypass -Command "npm run dev" # http://localhost:3000/health

# Mobile Web (defecto localhost:8084)
cd mobile
powershell -ExecutionPolicy Bypass -Command "npm run web"
# abre http://localhost:8084 — demo Phase 2 sin backend necesario
# alternativa nativa: npm run start:native  (Expo Go, --tunnel si WiFi distinto)
```

## Estructura
```
/spec, /docs/decisions, /supabase/migrations, /backend, /mobile, /tests
```

## Roadmap
- Phase 0 Spec ✅  Phase 1 Core Finance ✅  Phase 2 Fake Data 100 ✅
- Phase 3 Email Ingestion (en curso) → Phase 4 AI Agent #1
