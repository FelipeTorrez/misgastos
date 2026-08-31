# SDD — Endurecimiento de Finan contra publicidad bancaria (promo-hardening)

> Estado: **Implementado** ✅ — 2026-08-31. Tests `157/157`, `tsc --noEmit` 0, version `0.4.1-finan`.
> Relacionado: `backend/src/ai/prompts/agente-financiero.ts:7-96` (prompt actual), `backend/src/ai/providers/GroqProvider.ts:57-84` (mock guard), `backend/src/modules/ingestion/routes.ts:85-153` (guard flow), `backend/src/modules/ingestion/parser.ts:21-33` (`extractAmount`), `spec/sdd-agente-financiero.md:95-177` (SDD previo §6), `spec/sdd-notification-guard.md` (guard v2).

## 1. Problema

El guard actual (`FINAN_SYSTEM_PROMPT` PASO 1 + `isPromoPattern` del mock) cubre solo un subconjunto de anuncios: `cupo aprobado`, `permiso de circulación`, `días baratísimos`, `cuotas sin interés`. La publicidad bancaria chilena usa un vocabulario mucho más amplio que **sigue colándose como gasto real**.

Casos reportados (reales):

1. > `¡Despegó Travel Days! ✈️ Descubre ofertas imperdibles en Travel Viajes, canjea tus Dólares-Premio y paga tus próximas vacaciones`
   → se creó **expense `-$1.000.000`** (merchant "Travel…", categoría "otros", `pending_ai`).

2. > `Participa y gana hasta $500.000 en el sorteo de este mes` (otra publicidad)
   → se creó **expense `-$500.000`** (merchant "Descono…", `pending_review`).

**Causa raíz (confirmada en código, no especulación):**

1. `parser.extractAmount` (`parser.ts:21-33`) extrae cualquier `$`/`CLP` + número → `$500.000`/la cifra del banner se convierte en `p.amount`. El parser **solo** corta el flujo cuando `amount == null` (`routes.ts:156`), así que **todo anuncio con cifra llega al guard de IA**.
2. `routes.ts:110` pasa `parser_hints.amount` al `classify()`. El prompt PASO 3 dice que el `amount` "Debe coincidir con el texto **o con parser_hints**" (`agente-financiero.ts:36`) → **ancla** al modelo a tratar la cifra publicitada como real.
3. El prompt no conoce las señales de: **canje/lealtad** (`canjea`, `Dólares-Premio`, `puntos`, `millas`), **sorteo/premio** (`participa y gana`, `concurso`, `hasta $X`), **oferta/CTA** (`descubre`, `ofertas imperdibles`, `descuento`, `beneficio`).
4. **Trampa de moneda de lealtad:** "Dólares-Premio", "puntos", "millas" son moneda de fidelización, **no CLP**; nada le dice al modelo que no son dinero real.
5. El mock (`GroqProvider.ts:63`) tampoco cubre esos patrones → modo demo/tests falla igual que Groq real.

El guard es la **única** defensa contra el gasto fantasma (`routes.ts:113` y `routes.ts:229` solo bloquean si `is_transaction === false`).

## 2. Goals / Non-Goals

**Goals:**
- **G1 (cero fantasmas por publicidad):** `is_transaction=false` para anuncios de lealtad/canje, sorteo/premio, oferta/descuento y CTA, aunque contengan cifra (`$500.000`, `$1.000.000`, "hasta $X").
- **G2 (sin sesgo de ancla):** `parser_hints.amount` deja de ser tratado como evidencia de movimiento; es solo una pista. Si es publicidad → `amount=0` SIEMPRE.
- **G3 (distinguir CLP de moneda de lealtad):** Dólares-Premio / puntos / millas / kilómetros / dólares turísticos **no** son dinero real.
- **G4 (borde sin falsos negativos):** una compra **real** en "Travel Viajes" (con verbo de consumo + monto) sigue siendo `expense`. El endurecimiento no puede bloquear en bloque la palabra "travel/viaje".
- **G5 (paridad mock↔Groq):** el fallback determinista `mock()` replica las mismas señales que el prompt, para que demo y tests se comporten igual que producción.

**Non-Goals:**
- NG1: Cambiar `AgentOutputSchema` (`AIProvider.ts`). El contrato ya tiene `is_transaction`, `transaction_type:"none"`, `direction:"none"`, `amount` non-negative (acepta `0`). **Cero cambios de schema** → `GroqProvider.test.ts` no se toca.
- NG2: Pre-guard determinista en `parser.ts`/`routes.ts` que descarte anuncios **antes** de Groq (ahorro de costo). Se descarta en esta iteración; se documenta en §13 como alternativa futura.
- NG3: Cambiar `dedup.ts`, `allowlist.ts`, ni el flujo de `routes.ts` (sigue igual; solo cambia el contenido del prompt y el regex del mock).
- NG4: Subir de modelo. Se mantiene `qwen/qwen3.8-27b` (prod) / `llama-3.1-70b-versatile` (fallback default).

## 3. Contexto — flujo actual (sin cambios estructurales)

```
parseEmail() → normalized (≤500 chars, lower, RUT/CARD masked)
→ raw_events (siempre)
→ if p.amount == null → no_amount (sin IA)
→ else AI classify (guard)  ← único punto de defensa
    → if ai.is_transaction === false → 200 ignored (transaction:null)
    → else → findRule → dedup → insert
```

La única compuerta contra el anuncio es `is_transaction === false` decidido por el modelo (Groq) o por el `mock()` determinista.

## 4. Cambio 1 — `FINAN_SYSTEM_PROMPT` (`agente-financiero.ts`)

### 4.1 PASO 1 — taxonomía expandida de "no transacción"

Reemplazar el bloque `false` (líneas 15-21) por una taxonomía explícita con la categoría **"Publicidad / Marketing"** y señales de banca chilena:

- **Lealtad / canje (moneda de fidelización):** `canjea`, `canje`, `canjear`, `Dólares-Premio`, `dólares turísticos`, `puntos`, `millas`, `kilómetros`, `acumula`, `triple acumulación`, `premio`.
- **Sorteo / concurso:** `sorteo`, `concurso`, `participa y gana`, `podrías ganar`, `gana hasta`, `premio`.
- **Oferta / descuento:** `oferta`, `ofertas imperdibles`, `descuento`, `dto`, `hasta 50%`, `beneficio`, `bonificación`, `rebaja`, `promo`, `promoción`.
- **CTA / engagement:** `descubre`, `despegó`, `imperdible`, `conoce`, `invita`, `súmate`, `aprovecha`, `últimos días`, `no te lo pierdas`, `solo por hoy`.
- **Informativo / límite:** `recordatorio`, `te informamos`, `aviso`, `ahora puedes`, `disponible`, `cupo aprobado/preaprobado`, `simulación`, `cuotas sin interés`, `permiso de circulación`, `días baratísimos`.

Mantener la regla ya existente: "Si es false, ignora cualquier monto o número que aparezca" y el contrato `transaction_type="none"`, `direction="none"`, `amount=0`, `needs_review=false`, `confidence=0.95`.

### 4.2 Reglas nuevas (anti-ancla + moneda de lealtad)

Insertar tras PASO 1, antes de PASO 2:

> **REGLA ANTI-ANCLA:** `parser_hints.amount` es SOLO una pista extraída por regex; **NO prueba** que hubo un movimiento. Lo que prueba un movimiento es un **verbo de consumo/transferencia + contexto** ("compraste", "pagaste", "transferiste", "te transfirieron"). Un monto grande y redondo (`$500.000`, `$1.000.000`, "hasta $X") presentado como **beneficio, premio, oferta, canje, cupo o sorteo** NO es un movimiento ejecutado → `is_transaction=false` y `amount=0`.
>
> **REGLA DE MONEDA DE LEALTAD:** "Dólares-Premio", "dólares turísticos", "puntos", "millas" y "kilómetros" son moneda de fidelización, **NO CLP**. Aunque tengan un número, no son un movimiento de dinero real (`is_transaction=false`). Solo un monto en `$`/`CLP` ligado a un verbo de consumo es dinero real.

Ajustar PASO 3 (línea 36): cambiar "Debe coincidir con el texto o con parser_hints" por "Debe coincidir con el texto; usa `parser_hints.amount` SOLO si el verbo del texto confirma un movimiento real (ver REGLA ANTI-ANCLA)".

### 4.3 Few-shot nuevos (añadir a los 7 existentes)

```
8) "¡Despegó Travel Days! Descubre ofertas imperdibles en Travel Viajes, canjea tus Dólares-Premio y paga tus próximas vacaciones"
   → {"is_transaction":false,"transaction_type":"none","direction":"none","amount":0,
      "merchant":"Desconocido","counterparty":null,"category":"otros",
      "payment_method":"unknown","needs_review":false,"confidence":0.95,
      "reason":"Publicidad de canje de Dólares-Premio, no hay consumo"}
9) "Participa y gana hasta $500.000 en el sorteo de este mes. Solo por ser cliente."
   → {"is_transaction":false,"transaction_type":"none","direction":"none","amount":0,
      "merchant":"Desconocido","counterparty":null,"category":"otros",
      "payment_method":"unknown","needs_review":false,"confidence":0.95,
      "reason":"Mensaje promocional o informativo, no hay consumo"}
10) "Obtén 50% de descuento en tu próximo viaje con tu tarjeta de crédito"
    → {"is_transaction":false,"transaction_type":"none","direction":"none","amount":0,
       "merchant":"Desconocido","counterparty":null,"category":"otros",
       "payment_method":"unknown","needs_review":false,"confidence":0.95,
       "reason":"Mensaje promocional o informativo, no hay consumo"}
11) "Compraste $120.000 en Travel Viajes con tu tarjeta de crédito"  ← borde: "viaje/travel" real
    → {"is_transaction":true,"transaction_type":"expense","direction":"out","amount":120000,
       "merchant":"Travel Viajes","counterparty":null,"category":"otros",
       "payment_method":"credit_card","needs_review":false,"confidence":0.9,
       "reason":"Compra con tarjeta → gasto"}
```

El contraejemplo #11 fija el borde: la palabra "travel/viaje" **no** bloquea; el verbo "Compraste" + monto sí es gasto.

## 5. Cambio 2 — mock determinista (`GroqProvider.ts`)

Extender `isPromoPattern` (línea 63) con las mismas señales, **conservando** la guarda `hasRealConsumptionVerb` (línea 62) para no bloquear "compraste … en cuotas":

```
canjea|canje|d[oó]lares[ -]?premio|d[oó]lares tur[ií]sticos|
travel days|ofertas imperdibles|descubre ofertas|
sorteo|concurso|participa y gana|podr[ií]as ganar|
hasta\s*\$?\s*[\d][\d.,]*|descuento|\bpremio\b|beneficio|bonificaci[oó]n|
acumula|millas|puntos
```

Notas:
- `hasRealConsumptionVerb` (línea 62) NO incluye `canjea` ni `participa` ni `descubre`, así que esos patrones quedarán bloqueados (`is_transaction=false`).
- El `reason` se mantiene literal: `"Mensaje promocional o informativo, no hay consumo"` (los tests existentes exigen que contenga `"promo"`).
- El caso borde `compraste $120.000 en Travel Viajes` **no** matchea `isPromoPattern` (no contiene las señales) **y** tiene `compraste` en `hasRealConsumptionVerb` → pasa a `expense`.

## 6. Testing

### 6.1 `backend/tests/agent-financiero.test.ts` (nuevos casos)

**Prompt (unit):** extender el `describe("FINAN_SYSTEM_PROMPT")` (líneas 54-61) para asertar presencia de las señales nuevas:
```
expect(FINAN_SYSTEM_PROMPT).toContain("canjea");
expect(FINAN_SYSTEM_PROMPT).toContain("Dólares-Premio");
expect(FINAN_SYSTEM_PROMPT).toContain("sorteo");
expect(FINAN_SYSTEM_PROMPT).toContain("moneda de lealtad");   // o el texto literal de la regla
expect(FINAN_SYSTEM_PROMPT).toContain("publicidad");
```
(mantener los 4 substrings ya exigidos: `recibiste`, `income`, `Mensaje promocional`, `transaction_type`).

**Mock classify (unit):**
1. `"¡despegó travel days! descubre ofertas imperdibles en travel viajes, canjea tus dólares-premio"` con `parser_hints:{amount:1000000}` → `is_transaction:false`, `transaction_type:"none"`, `direction:"none"`, `amount:0`, `reason` contiene `"promo"`.
2. `"participa y gana hasta $500.000 en el sorteo de este mes"` con `amount:500000` → `false`, `amount:0`.
3. `"obtén 50% de descuento en tu próximo viaje"` con `amount:0`/sin monto → `false`.
4. `"compraste $120.000 en travel viajes con tu tarjeta"` con `amount:120000, merchant_guess:"Travel Viajes"` → `is_transaction:true`, `transaction_type:"expense"`, `direction:"out"`, `amount:120000` (borde positivo).

### 6.2 `backend/tests/ingestion.guard.test.ts` (end-to-end)

1. `POST /v1/ingestion/notification` con `raw_content:"¡Despegó Travel Days! Descubre ofertas imperdibles en Travel Viajes, canjea tus Dólares-Premio por hasta $1.000.000 y paga tus próximas vacaciones"`, `sender:"cl.bancochile"` → `transaction:null`, `classification_source:"ai_guard"`, `ai.is_transaction:false`, `ignored_reason` contiene `"promo"`.
2. `raw_content:"Participa y gana hasta $500.000 en el sorteo de este mes"` → `transaction:null`, `ai_guard`.
3. `raw_content:"Compraste $120.000 en Travel Viajes con tu tarjeta de crédito"` → `transaction.amount:120000`, `transaction.type:"expense"`, `classification_source !== "ai_guard"` (borde).

### 6.3 Regresión (no deben romperse)

- `agent-financiero.test.ts` mock `cupo aprobado 750.000` → `reason` contiene `"promo"`, `amount:0` (ya cubierto, se mantiene).
- `ingestion.guard.test.ts` cupo 750k / CLP1,250 gms / Falabella $1.300 / sin monto (ya cubiertos).
- `GroqProvider.test.ts` (schema) **no cambia** → verde sin tocar.

**Total esperado:** 149 → ~156 tests (19 archivos).

## 7. Data model

Sin cambios. No se inserta `transaction` si el guard devuelve `false`; `raw_events.metadata.guard` ya captura `{is_transaction, reason, confidence}` (`routes.ts:116-118`).

## 8. Observabilidad

- Log backend: `guard: is_transaction=false reason="..." p.amount=1000000 sender=cl.bancochile` (patrón ya presente en el flujo).
- Métrica futura (opcional): `count(*) raw_events WHERE metadata->'guard'->>'is_transaction'='false'` agrupado por `sender`, para medir recall de publicidad.

## 9. Versión

- `backend/src/index.ts:15`: `version:"0.4.0-finan"` → `version:"0.4.1-finan"`, `phase:"Agente Financiero Finan (promo-hardening)"`.
- Sincronizar `HANDOFF.md` (header + §health + conteo de tests) y los skills de cierre que asertan `version === index.ts:15`.

## 10. Criterios de aceptación

- **AC1:** `POST /v1/ingestion/notification` con `"¡Despegó Travel Days! … canjea tus Dólares-Premio …"` → `transaction=null`, `ai.is_transaction=false`, no suma a `GET /v1/balance?month=`.
- **AC2:** `"Participa y gana hasta $500.000 … sorteo"` → `transaction=null`.
- **AC3:** `"Compraste $120.000 en Travel Viajes"` → `transaction.type="expense"`, `amount=120000` (sin falso negativo).
- **AC4:** `npx vitest run` verde (149 → ~156); `mobile tsc --noEmit` sin errores nuevos (los 2 preexistentes se mantienen).
- **AC5:** mock y Groq real emiten el mismo veredicto para los 3 casos de §6.2 (paridad G5).

## 11. Riesgos / Alternativas

- **Sobre-bloqueo ("travel"/"viaje"/"premio"):** mitigado con el contraejemplo #11 y la guarda `hasRealConsumptionVerb`; la señal que decide es el **verbo de consumo**, no la palabra suelta. Si aparecieran falsos negativos, ajustar el regex del mock a patrones más específicos (`participa y gana` en vez de `gana` suelto).
- **Truncado a 500 chars (`normalizeForAI`):** si el CTA/disclaimer cae fuera, el modelo podría perder la señal. En las notificaciones bancarias la señal de publicidad va en el encabezado, así que el riesgo es bajo; documentado para telemetría futura.
- **Divergencia mock↔Groq:** el mock es regex (determinista, conservador); Groq generaliza mejor. Se acepta que el mock sea un subconjunto conservador. La paridad se verifica solo con los casos de §6.2.
- **Alternativa descartada (para NG2):** pre-guard determinista en `routes.ts` antes de Groq (regex lista-negra) ahorraría costo, pero es frágil en español bancario y duplica la lógica. Se deja como hardening futuro si el volumen de Groq escala.

## 12. Rollout

1. Aprobar este SDD.
2. **PR1 — backend:** `agente-financiero.ts` (prompt + reglas + few-shot), `GroqProvider.ts` (regex mock), tests (`agent-financiero.test.ts`, `ingestion.guard.test.ts`), `index.ts` (versión `0.4.1-finan`).
3. Deploy Railway + `assembleRelease` APK; re-probar con la notificación real de "Travel Days / Dólares-Premio" y confirmar `transaction=null`.
4. Actualizar `HANDOFF.md` + skills de cierre (conteo de tests + versión).
