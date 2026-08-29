# SDD — Notification Guard + Allowlist v2

> Estado: **Propuesta** (SDD) — para aprobar antes de codificar. Fecha: 2026-08-27
> Relacionado: `HANDOFF.md:101-115` pipeline actual, `backend/src/modules/ingestion/parser.ts:21-29`, `backend/src/ai/providers/GroqProvider.ts:17-24`, `mobile/src/native/NotificationListener.ts:15-20` / `NotificationListener.kt:36-48`

## 1. Problema

Pipeline actual `routes.ts:78 if(p.amount) → AI → insert` asume: si hay `amount` es transacción. Con notificaciones en pantalla esto es falso.

Ejemplo real reportado:
> `Banco de Chile: tienes un nuevo cupo aprobado por 750.000 abre aquí para solicitarlo` → parser extrae `750000` → hoy se crearía `expense` fantasma.

Tu prueba valida `cl.android` fuera de LAN OK (Railway `EXPO_PUBLIC_API_URL=https://misgastos-production-b8c6.up.railway.app` + `setApiUrl` persistido `NotificationListener.kt:28-32`), pero Wallet `CLP1,250 con CMR...` no entró por parser ` $/monto:` `parser.ts:23` (no `CLP`). Normalizar solo `CLP` perpetúa el problema de falsos positivos.

Objetivo: **no normalizar a ciegas; poner a la IA como guardián** (`is_transaction`) antes de crear `transaction`. Sin IA o con `!is_transaction` → solo `raw_events` (auditoría), nunca gasto.

## 2. Goals / Non-Goals

**Goals:**
- G1: Cero gastos fantasma por promos/cupo/ofertas aunque tengan monto.
- G2: Wallet y bancos CH reconocidos sin regex frágil por formato (`$1.300` vs `CLP1,250` vs `1,250`).
- G3: Allowlist versionado, auditable y testeable; soporte `com.google.android.gms` (Wallet via GMS) y futuros bancos sin prebuild forzado.
- G4: Costo controlado: 1 llamada Groq por notificación con `amount` (volumen bajo, <50/día).

**Non-Goals:**
- NG1: OAuth Gmail / iOS share (Phase 7).
- NG2: Clasificador ML local on-device (v1.1 si Groq costo escala).
- NG3: Cambiar `dedup.ts:44-50` (sigue igual).

## 3. Contexto — flujo actual

```
POST /v1/ingestion/notification (source=android_notification) routes.ts:214
 → parseEmail() parser.ts:84 (amount/date/merchant/op)
 → findRule(parser.merchant) routes.ts:78
 → if !matched && p.amount → AI classify() GroqProvider.ts:9
 → findRule(ai.merchant) routes.ts:107
 → dedup §15 routes.ts:148
 → if p.amount → insert transaction routes.ts:165 (expense|transfer)
```

Falla: `if(p.amount)` es la única compuerta.

## 4. Allowlist v2 — taxonomía

**Actual duplicada** `NotificationListener.ts:15-20` y `NotificationListener.kt:36-48` (10-11 pkgs, `startsWith`).

**Propuesta:**
- Mover a **única fuente** `mobile/src/native/allowlist.json` (commiteado) + espejo `backend/src/modules/ingestion/allowlist.ts` para validar `sender` server-side.
- Esquema: `{ pkg_prefix, label, kind: "bank"|"wallet"|"fintech", country:"CL", notes }`
- v2 incluirá:
  ```
  cl.android (Falabella) - ya OK
  com.falabella.falabellaApp
  com.mercadopago.wallet
  cl.bancochile, cl.bci, cl.santander, cl.bancoestado
  com.google.android.apps.walletnfcrel, com.google.android.apps.nbu.paisa
  com.google.android.gms  # <- NUEVO: Wallet via GMS (Billetera de Google)
  com.mach, com.tenpo
  cl.tenpo, com.bancoestado, cl.scotiabank, cl.itau (reservas)
  ```
- Matching sigue `startsWith` (evita `cl.android123` spoof no relevante) + log `ENTRY pkg=` `NotificationListener.kt:60` ya existe.
- Backend **no rechaza** si sender fuera de lista (llega igual), pero marca `metadata.allowlist_hit=false` y baja `confidence` — permite telemetría sin perder datos.
- Actualización sin prebuild (ideal v2.1): exponer `GET /v1/config/allowlist` y `setAllowlist()` en JS; fuera de scope v2, pero archivo único ya evita drift TS↔KT.

## 5. Parser — cambios mínimos

`parser.ts:21` `extractAmount`:
- Añadir alternativa `CLP\s*` y normalizar `,` miles chilenos: `raw.replace(/\./g,"").replace(/,/g,"")` (Wallet `1,250` → `1250`). Mantener `,xx` decimales fuera.
- No aumentar recall a costa de precisión: `CLP` solo si `amount` rodeado de palabras transaccionales (`compraste|pagaste|consumo|transferencia|giro|abono|depósito`) se deja a la IA decidir (ver §6). Parser sigue siendo determinístico y barato.

`extractMerchant` `parser.ts:65`:
- Añadir `con CMR` y `en ANGAR...` stopword ya cubierto, pero incluir fallback `ANGAROA` multi-palabra no crítico — IA lo corrige.

No se crea `transaction` solo por parser.

## 6. AI Guard — nuevo contrato

**Extender `AgentOutputSchema`** `AIProvider.ts:3`:
```ts
is_transaction: z.boolean().default(true),
transaction_type: z.enum(["expense","income","transfer","none"]),
confidence: 0-1,
needs_review: boolean,
reason: string|null // ej "promo_cupo_aprobado sin consumo"
```

Compat: `amount` pasa a `.nullable()` o `0` cuando `is_transaction=false` (evita `positive()` fail). Mantener `category="otros"` en ese caso.

**Prompt guard** `GroqProvider.ts:17` system nuevo (fragmento):
```
Eres Transaction Intelligence + Guard.
1. Decide is_transaction: true SOLO si el texto describe movimiento REAL de dinero (compra/pago/giro/transferencia/abono) con monto y comercio/cuenta. Si es oferta/promo/cupo aprobado/simulación/recordatorio/mensaje informativo → is_transaction=false, transaction_type=none, confidence alta, reason="promo_cupo".
2. Si is_transaction=false, ignora amount aunque exista.
3. Si true, extrae amount (CLP entero), merchant Title Case 1-2 palabras, category de [...] y transaction_type.
4. Respeta reglas usuario. JSON estricto, no inventes.
5. Ejemplos few-shot: "tienes cupo aprobado por 750.000..." → {"is_transaction":false,...}, "Compraste $1.300 en Angaroa..." → true.
```

**Groq model** se mantiene `qwen/qwen3.8-27b` `HANDOFF.md:3` (costo bajo, structured outputs). Fallback mock `GroqProvider.ts:63` debe replicar guard: si texto contiene `cupo|aprobado|oferta|simula|preaprobado` → `is_transaction=false`.

## 7. Pipeline nuevo

```
parseEmail() → normalized
→ if !external_id dup? create raw_events (siempre) routes.ts:52
→ if p.amount == null → return {raw_event, parsed, transaction:null, guard:"no_amount"} // sin IA, barato
→ else → AI classify (con guard)
    → if !ai.is_transaction || ai.transaction_type=="none"
        → return {raw_event, parsed, ai, transaction:null, ignored_reason: ai.reason} // no insert
    → else → findRule(parser) || findRule(ai) → dedup → insert (como hoy)
```

Cambios en `routes.ts:83-114`:
- Gate `if(p.amount)` se reemplaza por `if(p.amount !== null)` → AI guard obligatorio cuando hay monto.
- Si `mockStore` o Supabase, guardar en `raw_events.metadata` `{guard, ai}` para auditoría.
- Si Groq falla (`catch`), **no crear** gasto: retornar `transaction:null` con `warning:"ai_unavailable, queued for review"` y marcar `raw_events.status="needs_ai_retry"` (reintento manual). Evita falso gasto por fallback.

## 8. Data model

- `raw_events.metadata` ya existe `routes.ts:62` — añadir `guard: {is_transaction, reason, model}`.
- `transactions` sin cambio (no se inserta si guard false). Métricas futuras: `SELECT count(*) FROM raw_events WHERE metadata->>'is_transaction'='false'`.

## 9. Config / flags

- `GROQ_API_KEY` ya gatea `groq vs mock` `GroqProvider.ts:10`. Nuevo env `INGESTION_GUARD_STRICT=true` (default true en prod, false en test para permitir fixtures).

## 10. Testing

- `backend/tests/ingestion.guard.test.ts` nuevo (6-8 casos):
  - `cupo 750k Banco de Chile` → `is_transaction false`, `transaction=null`
  - `oferta crédito 500k` → false
  - `Compraste $1.300 en Angaroa` → true, expense alimentacion
  - `CLP1,250 con CMR` (Wallet GMS) → true, amount 1250
  - `Te transfirieron $50.000` → true, transfer/income según prompt
  - `Recibiste $10.000 de Juan` → true
- Actualizar `phase3.ingestion.test.ts` mocks para nuevo schema (`is_transaction`).
- Mobile: `adb logcat -s NotificationListener:D` + `curl /v1/raw-events` validación manual.

## 11. Observabilidad

- Log backend: `guard: is_transaction=false reason=promo_cupo p.amount=750000 sender=cl.bancochile`
- Métrica: ratio `raw_events` sin `transaction` por `sender`.

## 12. Rollout

1. Aprobar este SDD.
2. PR1 — backend guard + allowlist.json (sin tocar móvil): `parser.ts`, `AIProvider.ts`, `GroqProvider.ts`, `routes.ts`, `allowlist.ts`, tests.
3. PR2 — móvil: sincronizar `allowlist.json` → `NotificationListener.ts/.kt` + añadir `com.google.android.gms`, `gradle.properties newArchEnabled=false` si prebuild.
4. Deploy Railway + APK release `assembleRelease`, re-probar: Wallet GMS debe crear tx, promo 750k no.

## 13. Criterios de aceptación

- AC1: `POST /v1/ingestion/notification` con `raw_content="tienes un nuevo cupo aprobado por $750.000..."` → `201` con `transaction=null`, `ai.is_transaction=false`, no suma a `GET /v1/balance?month=`.
- AC2: `raw_content="CLP1,250 con CMR Mastercard ... Billetera de Google"` `sender=com.google.android.gms` → `transaction.amount=1250`, `status=pending_ai`.
- AC3: `cl.android $1.300` sigue OK fuera de LAN.
- AC4: `vitest run` 125→~133 pasando, `allowlist.json` único source.

## 14. Riesgos / Alternativas

- Groq latencia ~600ms por notif; aceptable volumen. Si escala, cache `raw_content hash → guard`.
- No hacer guard local: regex lista negra (`cupo|oferta`) frágil en español de bancos — IA generaliza mejor como pides.
