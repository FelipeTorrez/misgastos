# Testing Spec (§34 Spec-Driven)

## Estrategia: SPEC -> DESIGN -> IMPLEMENTATION -> UNIT -> INTEGRATION -> REAL DATA -> ACCEPTANCE

## Unit
- Parser: regex CLP ($32.990, $ 32.990, 32990), fechas, comercios (tabla 20 casos reales chilenos)
- Deduplication: match monto+fecha+comercio dentro de 10min ventana
- AIProvider: mock Groq con JSON Schema validation
- Rules: merchant normalized match

## Integration
- Ingestion -> RawEvent -> Parser -> AI -> Transaction (con Supabase test DB)
- RLS: user A no ve datos user B (test con 2 JWT)
- Gmail connector: fixture de 5 emails reales (BancoEstado, Santander, BCI)

## Real Data Test (§34)
- Dataset fake 100 transacciones (script `tests/fixtures/generate.ts`)
- Validar balance, presupuestos, duplicados

## Acceptance (§36)
1-11 criterios MVP deben pasar E2E en Expo + backend local

## Herramientas
- Backend: Vitest + Supertest
- Mobile: Jest + Detox (E2E)
- DB: Supabase local via `supabase start`

## CI
- GitHub Actions: lint, typecheck, unit, integration (con Supabase local)
