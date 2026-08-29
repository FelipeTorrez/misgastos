# SDD — Agente Financiero Unificado (clasificador de ingesta + Advisor Phase 9)

> Estado: **Propuesta (SDD)** — para aprobar antes de codificar. Fecha: 2026-08-28
> Relacionado: `backend/src/ai/providers/GroqProvider.ts:17-29` (prompt actual), `AIProvider.ts:3-21` (schema), `parser.ts:80-86` (detectOperation), `ingestion/routes.ts:200-218` (type fallback), `mobile/src/screens/Movimientos.tsx:141` (render signo), `spec/ai-agent-advisor.md` (Advisor Phase 9), `spec/sdd-notification-guard.md` (guard anterior).

---

## 1. Problema

Una transferencia **recibida** de terceros llega a Movimientos como **gasto negativo**:

> `Recibiste $21.700. Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506` → UI muestra `-$21.700`, estado `Pendiente IA`, sin categoría.

**Causa raíz (confirmada en código, no especulación):**

1. El parser **sí** acierta a medias: `parser.ts:82` detecta `recibiste` → `operation="transfer"`, y `parser.ts:21` extrae `21700`. Pero el **tipo final lo decide la IA**, no el parser.
2. El mock `GroqProvider.ts:119` decide con `transaction_type: /transferencia/.test(m) ? "transfer" : "expense"`. El texto dice *"te transfirieron"*, no *"transferencia"* → clasifica **`expense`**.
3. El prompt de Groq real (`GroqProvider.ts:17-29`) no tiene reglas ni few-shot de dirección: no sabe que `recibiste/te transfirieron` = dinero que **entra**. Tiende a `expense`.
4. Aunque saliera `transfer`, `Movimientos.tsx:141` pinta `type==="income" ? "+" : "-"` → todo lo no-income se ve **negativo**.
5. `balance/routes.ts:31-33` suma `type==="income"` y resta `type==="expense"`; `transfer` es neutro. Como quedó `expense`, el balance **bajó** `-21.700`.

El producto ya expresa la intención correcta: `tests/fixtures/dataset100.ts:22` tiene `"Transferencia Recibida Familia $250.000" → type: income`. Falta que el agente lo infiera.

## 2. Goals / Non-Goals

**Goals:**
- **G1 (persona viva):** un solo agente financiero ("Finan") con identidad propia que lee una notificación bancaria chilena y emite un **veredicto** estructurado, razonado en español. Sirve hoy para clasificar y mañana (Phase 9) para aconsejar, con el mismo persona y contrato JSON.
- **G2 (dirección correcta):** detectar si el dinero **entra**, **sale** o es un traspaso **interno**, y mapear a `income` / `expense` / `transfer`. Resuelve el bug de signo.
- **G3 (veredicto auditable):** todo veredicto trae `reason` en español legible + `confidence` + `needs_review`, para que el usuario y la telemetría entiendan qué decidió.
- **G4 (determinista sin API):** el fallback `mock` replica la misma regla de dirección, para que tests y modo demo se comporten igual que Groq.

**Non-Goals:**
- NG1: Function calling / tools del Advisor (leer balance, top categorías) → SDD posterior, reutilizando este persona.
- NG2: OAuth Gmail / iOS share (Phase 7).
- NG3: Cambiar `dedup.ts` (sigue igual).
- NG4: Eliminar la separación de tareas del Advisor (`ai-agent-advisor.md:7`): Advisor sigue sin ver `raw_content`. Se mantiene la *separación de datos*; solo se comparte *persona + contrato*.

## 3. Persona del agente ("darle vida")

- **Nombre:** Finan.
- **Rol:** contador chileno meticuloso de MisGastos.
- **Voz:** español de Chile (`es-CL`), CLP, conciso.
- **Misión:** convertir texto financiero no estructurado en un veredicto JSON estricto y honesto — nunca inventa datos.
- **Dos tareas sobre la misma identidad:**
  - `classify` (hoy): notificación → veredicto de clasificación.
  - `advise` (Phase 9): transacciones confirmadas → insight. Mismo persona, misma disciplina de "citar datos, no inventar".

## 4. Contrato de salida — `AgentOutputSchema` (nuevo)

`backend/src/ai/providers/AIProvider.ts`:

```ts
export const AgentOutputSchema = z.object({
  is_transaction: z.boolean().default(true),
  transaction_type: z.enum(["expense", "income", "transfer", "none"]),
  direction: z.enum(["in", "out", "internal", "none"]).default("out"), // NUEVO: clave del signo
  amount: z.number().int().nonnegative(),
  currency: z.string().default("CLP"),
  merchant: z.string(),
  counterparty: z.string().nullable().default(null),   // NUEVO: persona/entidad del otro lado
  category: z.string(),
  date: z.string(),
  account_hint: z.string().nullable(),
  payment_method: z.enum(["debit_card", "credit_card", "transfer", "cash", "unknown"]),
  installment: z.object({
    number: z.number().int(), total: z.number().int(), original_amount: z.number().int(),
  }).nullable(),
  is_recurring_candidate: z.boolean(),
  is_transfer_candidate: z.boolean(),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  reason: z.string(),  // NUEVO contrato: frase legible en español (veredicto)
});
```

Cambios vs actual:
- `direction` (nuevo): `in | out | internal | none`. Es la fuente de verdad del signo.
- `counterparty` (nuevo): quién está del otro lado de una transferencia ("Juan Pérez", "familia", …). `null` si no aplica.
- `reason`: deja de ser código técnico (`promo_cupo_aprobado`, `groq_error`) y pasa a **frase legible en español** ("Transferencia recibida de Juan Pérez → ingreso"). El detalle técnico de fallback (groq error) se mueve a logs y a `needs_review`.

## 5. Semántica de dirección (regla que arregla el signo)

| Señal en el texto | `direction` | `transaction_type` | Efecto en balance |
|---|---|---|---|
| `recibiste`, `te transfirieron`, `te han transferido`, `abono`, `depósito`, `sueldo`, `devolución`, `reembolso`, `transferencia recibida` | `in` | `income` | **+** |
| `compraste`, `pagaste`, `consumo`, `giro`, `retiro`, `transferiste`, `enviaste`, `transferencia realizada/enviada` | `out` | `expense` | **−** |
| traspaso entre tus **propias** cuentas ("desde tu Cuenta Corriente a tu Cuenta Vista") | `internal` | `transfer` | neutro |
| oferta / cupo aprobado / promo / simulación | `none` | `none` | — |

Regla de oro que va al prompt y al mock:
> `recibiste` / `te transfirieron` = ENTRA = **income**. `transferiste` / `enviaste` = SALE = **expense**. Solo el traspaso entre cuentas propias es `transfer` neutro.

`balance/routes.ts:31-33` **no cambia** (ya suma `income`, resta `expense`, ignora `transfer`): al clasificar bien el tipo, el balance se corrige solo.

## 6. Prompt del agente (reemplaza `GroqProvider.ts:17-29`)

Se extrae a `backend/src/ai/prompts/agente-financiero.ts` (constante exportada, versionable y testeable):

```
Eres Finan, el agente financiero de MisGastos (Chile, CLP, es-CL).
Trabajas como un contador chileno meticuloso: lees una notificación bancaria y emites
un VEREDICTO en JSON estricto. Distingue si entra o sale plata y quién es la contraparte.
Nunca inventes datos que el texto no diga.

PASO 1 — ¿Es una transacción real? (is_transaction)
- true  → hubo movimiento REAL de dinero (compra, pago, giro, retiro, transferencia,
          abono, depósito, sueldo, devolución) con monto ejecutado.
- false → oferta, promo, cupo aprobado/preaprobado, simulación, recordatorio, publicidad
          o alerta informativa SIN consumo. Entonces: transaction_type="none",
          direction="none", amount=0, needs_review=false, confidence=0.95,
          reason="Mensaje promocional o informativo, no hay consumo".
- Si es false, ignora cualquier monto que aparezca en el texto.

PASO 2 — Dirección del dinero (direction): el campo que define el signo.
- "in"  (entra): recibiste / te transfirieron / te han transferido / abono / depósito /
         sueldo / devolución / reembolso / transferencia recibida  → transaction_type="income".
- "out" (sale): compraste / pagaste / consumo / giro / retiro / transferiste / enviaste /
         transferencia realizada o enviada  → transaction_type="expense".
- "internal" (neutro): la plata se mueve ENTRE TUS PROPIAS cuentas (misma entidad,
         "desde tu Cuenta Corriente a tu Cuenta Vista")  → transaction_type="transfer".
- REGLA DE ORO: "recibiste/te transfirieron" = ENTRA = income (NUNCA expense).
  "transferiste/enviaste" = SALE = expense. No confundas transferencia RECIBIDA (income)
  con transferencia INTERNA (transfer).

PASO 3 — Extrae campos (solo si is_transaction=true):
- amount: CLP entero sin separadores de miles. "CLP1,250"=1250, "$1.300"=1300, "$21.700"=21700.
  Debe coincidir con el texto o con parser_hints.
- merchant: UNA marca/comercio en Title Case, máx 2 palabras, sin preposiciones ni sufijos.
  Para transferencias entre personas usa "Transferencia" aquí y la persona en counterparty.
- counterparty: persona o entidad del otro lado (ej "Juan Pérez", "familia"). null si no es
  transferencia o no se identifica.
- category: elige SOLO de [CATEGORIES]; usa "otros" si dudas. Los ingresos (sueldo,
  transferencia recibida) van a "otros".
- payment_method: debit_card | credit_card | transfer | cash | unknown.
- installment: {number,total,original_amount} solo si menciona cuotas; si no, null.
- is_recurring_candidate: true si parece cargo periódico (suscripción).
- is_transfer_candidate: true si es transferencia (recibida, enviada o interna).

PASO 4 — Confianza y revisión:
- confidence 0-1. 0.9+ si el texto es claro (monto + dirección + comercio); 0.5 si ambiguo.
- needs_review=true si confidence<0.6 o falta merchant/dirección clara.
- reason: una frase corta en español explicando el veredicto. Ejemplos:
  "Transferencia recibida de Juan Pérez → ingreso", "Compra con tarjeta → gasto",
  "Mensaje promocional → ignorado".

Reglas adicionales:
- Respeta las reglas del usuario (merchant→categoría) por sobre tu categoría sugerida.
- No inventes montos, fechas ni comercios que no estén en el texto.
- Responde SOLO con el JSON, sin texto adicional.

Ejemplos (few-shot):
1) "Recibiste $21.700. Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506"
   → {"is_transaction":true,"transaction_type":"income","direction":"in","amount":21700,
      "merchant":"Transferencia","counterparty":null,"category":"otros",
      "payment_method":"transfer","needs_review":true,"confidence":0.6,
      "reason":"Transferencia recibida → ingreso"}
2) "Te transfirieron $50.000 de Juan Pérez"
   → {"is_transaction":true,"transaction_type":"income","direction":"in","amount":50000,
      "merchant":"Transferencia","counterparty":"Juan Pérez","category":"otros",
      "payment_method":"transfer","needs_review":false,"confidence":0.9,
      "reason":"Transferencia recibida de Juan Pérez → ingreso"}
3) "Transferiste $30.000 a María González"
   → {"is_transaction":true,"transaction_type":"expense","direction":"out","amount":30000,
      "merchant":"Transferencia","counterparty":"María González","category":"otros",
      "payment_method":"transfer","needs_review":false,"confidence":0.9,
      "reason":"Transferencia enviada a María González → gasto"}
4) "Compraste $1.300 en Angaroa con tu CMR Mastercard"
   → {"is_transaction":true,"transaction_type":"expense","direction":"out","amount":1300,
      "merchant":"Angaroa","counterparty":null,"category":"alimentacion",
      "payment_method":"credit_card","needs_review":false,"confidence":0.9,
      "reason":"Compra con tarjeta → gasto"}
5) "tienes un nuevo cupo aprobado por $750.000"
   → {"is_transaction":false,"transaction_type":"none","direction":"none","amount":0,
      "merchant":"Desconocido","counterparty":null,"category":"otros",
      "payment_method":"unknown","needs_review":false,"confidence":0.95,
      "reason":"Mensaje promocional o informativo, no hay consumo"}
```

Modelo se mantiene `qwen/qwen3.8-27b` (`HANDOFF.md:3`, structured outputs, costo bajo). `temperature=0`.

## 7. Mock fallback determinista (sin API)

`GroqProvider.ts:68` `mock()` debe replicar la regla de dirección. Nueva función exportable para testear:

```ts
function inferDirection(text: string): "in" | "out" | "internal" | "none" {
  const t = text.toLowerCase();
  if (/(desde tu .* a tu |entre tus cuentas|tu cuenta (corriente|vista|rut) .* a tu )/.test(t)) return "internal";
  if (/(recibiste|te transfirieron|te han transferido|abono|dep[oó]sito|sueldo|devoluci[oó]n|reembolso|transferencia recibida)/.test(t)) return "in";
  if (/(transferiste|enviaste|transferencia (realizada|enviada)|pagaste|compra|consumo|giro|retiro)/.test(t)) return "out";
  return "out"; // default conservador: sin señal de entrada, asume salida
}
```

`mock()`:
- Guard promo primero (igual que hoy `GroqProvider.ts:71`): `is_transaction=false`, `direction="none"`, `reason="Mensaje promocional o informativo, no hay consumo"`.
- `direction = inferDirection(normalized_text)`.
- `transaction_type = direction === "in" ? "income" : direction === "internal" ? "transfer" : "expense"`.
- `counterparty`: extraer `de <Nombre>` / `a <Nombre>` tras señal de transferencia (best effort, `null` si no).
- `reason`: frase en español derivada de `direction` + `counterparty` + merchant.
- Reemplaza el actual `GroqProvider.ts:119` (`/transferencia/.test(m) ? "transfer" : "expense"`), que es el bug.

## 8. Pipeline (cambios en `ingestion/routes.ts`)

```
parseEmail() → normalized
→ raw_events (siempre) routes.ts:54
→ if p.amount == null → no_amount (sin IA) routes.ts:153
→ AI classify (persona Finan) routes.ts:88
    → guard false → 200 ignored routes.ts:110
→ findRule(parser) | findRule(ai.merchant) routes.ts:83,132
→ dedup §15 routes.ts:198
→ insert routes.ts:217
```

Cambios concretos:
1. `routes.ts:200` y `routes.ts:218`: `const type = (ai?.transaction_type) ?? inferFromOperation(p)` donde el fallback del parser ahora mapea `p.operation==="transfer" && p contiene "recibiste/te transfirieron" → "income"`; si no, `p.operation==="transfer" ? "transfer" : "expense"`. (El fallback solo corre si la IA no respondió; la IA ya trae `direction` correcta.)
2. Persistir `direction` y `counterparty` en el payload de la transacción (nueva migración, §9) y en `raw_events.metadata.ai` para auditoría.
3. Guardar `ai.reason` en `raw_events.metadata.guard.reason` (ya existe el patrón `routes.ts:113`).

## 9. Data model

Migración nueva `supabase/migrations/004_add_transaction_direction.sql`:

```sql
alter table transactions
  add column if not exists direction text check (direction in ('in','out','internal','none')),
  add column if not exists counterparty text;
```

- `direction` / `counterparty` son **nulos** para transacciones antiguas (retrocompatibles).
- `type` sigue siendo la columna que mueve el balance (`income`/`expense`/`transfer`); `direction` es semántica + telemetría.
- En mock mode, `mockStore.insertTransaction` guarda `direction`/`counterparty` igual.

## 10. UI — signo correcto (`mobile/src/screens/Movimientos.tsx:141`)

Hoy: `{item.type === "income" ? "+" : "-"}{fmtCLP(item.amount)}`.

Cambio:
```tsx
const sign = item.type === "income" ? "+" : item.type === "transfer" ? "±" : "-";
const signColor = item.type === "income" ? C.positive : item.type === "transfer" ? C.textDim : C.text;
<Text style={[s.amount, { color: signColor }]}>{sign}{fmtCLP(item.amount)}</Text>
```

Y en la línea meta `Movimientos.tsx:139`, si hay `counterparty`, mostrarlo: `Recibido de Juan Pérez · 22/08`.

## 11. Testing

Nuevo `backend/tests/agent-financiero.test.ts` (Vitest):

**Mock / dirección (unit, sobre `inferDirection` + `mock()`):**
1. `"Recibiste $21.700. Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506"` → `type=income`, `direction=in`, `amount=21700`.
2. `"Te transfirieron $50.000 de Juan Pérez"` → `income`, `counterparty="Juan Pérez"`.
3. `"Transferiste $30.000 a María González"` → `expense`, `direction=out`.
4. `"Transferencia desde tu Cuenta Corriente a tu Cuenta Vista"` → `transfer`, `direction=internal`.
5. `"Recibiste tu sueldo por $1.200.000"` → `income`.
6. `"Te devolvimos $8.990 en tu tarjeta"` → `income` (devolución).
7. `"Compraste $1.300 en Angaroa con tu CMR"` → `expense`, `alimentacion`.
8. `"CLP1,250 con CMR ... Billetera de Google"` → `expense`, `amount=1250`.
9. `"tienes un nuevo cupo aprobado por $750.000"` → `is_transaction=false`, `transaction=null`.

**Prompt (unit):**
10. `prompt` exportado contiene las señales de dirección y al menos los few-shot `recibiste→income`, `cupo→none`.

**Ingesta end-to-end (mock de supabase `isMockMode:false` + provider mock):**
11. `POST /v1/ingestion/notification` con texto "Recibiste $21.700 … Banco Falabella" → `transaction.type="income"`, `transaction.direction="in"`.
12. Balance posterior suma `+21.700` a `income` (no resta de `expense`).

**Regresión:**
13. Actualizar mocks de `phase3.ingestion.test.ts` para el nuevo schema (`direction`, `counterparty`, `reason` legible).
14. `ingestion.guard.test.ts` sigue verde (guard promo, CLP, gms, Falabella).

## 12. Criterios de aceptación

- **AC1:** `POST /v1/ingestion/notification` con `"Recibiste $21.700. Te transfirieron … Banco Falabella"` → `transaction.type="income"`, `direction="in"`, `status="pending_review"`, `reason` legible en español. `GET /v1/balance?month=` suma `+21.700` a income (balance sube, no baja).
- **AC2:** `"Compraste $1.300 en Angaroa"` → `expense`, balance resta `1.300`.
- **AC3:** `"tienes cupo aprobado $750.000"` → `transaction=null` (guard).
- **AC4:** `"Transferencia desde tu Cuenta Corriente a tu Cuenta Vista"` → `transfer`, balance **no** cambia.
- **AC5:** UI muestra transferencia recibida en verde `+$21.700` con `Recibido de …`, y una transferencia interna en neutro `±` (no roja).
- **AC6:** `npx vitest run` verde (134 + ~14 nuevos); `mobile tsc --noEmit` 0 errores.

## 13. Riesgos / Alternativas

- **Groq puede fallar en matices** ("recibiste" mal clasificado por ruido). Mitigación: `direction` explícita en few-shot + `needs_review=true` cuando confianza baja → queda `pending_review` para corrección manual (que a su vez alimenta reglas).
- **Traspaso interno es raro de distinguir** de transferencia recibida. Mitigación: default conservador `in` solo ante señales fuertes de entrada; `internal` solo si el texto menciona explícitamente dos cuentas propias.
- **Costo**: sigue 1 llamada Groq por notificación con monto (sin cambios vs guard actual).
- **Alternativa descartada**: regex lista-negra local para dirección (frágil en español bancario). La IA generaliza mejor; el mock deterministic es solo fallback, no la regla principal.
- **Modelo**: se mantiene `qwen3.8-27b`. Si la calidad de dirección resultara insuficiente, `GROQ_MODEL` ya es configurable (`GroqProvider.ts:7`) para subir a un razonador mayor sin cambiar código.

## 14. Rollout

1. Aprobar este SDD.
2. **PR1 — backend**: `AIProvider.ts` (schema +direction/counterparty/reason), `prompts/agente-financiero.ts` (persona Finan), `GroqProvider.ts` (usar prompt + mock `inferDirection`), `parser.ts` (fallback income si recibiste), `routes.ts` (persistir direction/counterparty/reason), migración `004`, tests nuevos + actualizar mocks.
3. **PR2 — móvil**: `Movimientos.tsx:141,139` signo + counterparty.
4. Deploy Railway + `assembleRelease` APK; re-probar con la notificación real de Banco Falabella y confirmar verde `+$21.700`.
5. **Siguiente (Phase 9)**: SDD `advisor` que reutiliza el persona Finan + contrato para leer transacciones confirmadas + budgets (con function calling/tools), respetando `ai-agent-advisor.md:7` (no ve raw).
