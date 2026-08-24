# Security Spec (§21)

## Principios
- Nunca API keys en cliente (Groq key solo en backend, via Supabase Vault / env)
- OAuth tokens cifrados at rest (Supabase pgsodium)
- Mínimo privilegio: Gmail scope solo readonly, notificación solo lectura
- Separación usuarios: RLS obligatorio (§25), ningún query sin user_id
- Logs sin PII financiera (no loggear amount/merchant completos)
- Datos minimizados a IA (solo normalized_text + hints, no email completo)
- Derecho a eliminar/exportar datos (GDPR-like, DELETE /user/data)

## Controles
- TLS everywhere,  encryption at rest (Supabase default AES256)
- Secret management: .env no commiteado, Supabase Vault para Groq key
- Auth: Supabase Auth (email/pass + Google OAuth + Apple Sign-In), JWT, refresh rotation
- Authorization: RLS policies + backend service_role solo para ingestion
- Audit logging: tabla audit_log (user_id, action, entity, timestamp) sin montos

## Amenazas
- Leak Groq key -> rotación inmediata, limit rate
- Spoofed notification -> validar package allowlist
- Duplicado malicioso -> idempotencia por source_id

## Checklist MVP
- [ ] RLS habilitado y testeado con 2 usuarios
- [ ] Groq key en Vault, no en repo
- [ ] Gmail OAuth con state+PKCE
- [ ] Sanitizar raw_content antes de log
