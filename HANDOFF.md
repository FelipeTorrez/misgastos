# HANDOFF — Contexto completo para continuar desarrollo

> Última actualización: 2026-08-26 (noche) — **U6 Pulido + IA sheet local completados** ✅ (sonda quitada, chip IA agrandado, IASheet con datos reales, build release instalado).
> Siguiente: **Phase 9 Financial Advisor (post-MVP) + Hardening** o probar **Notificaciones / Reenvío Email** sin esperar backend completo. Ver §6 y `spec/roadmap.md`.

> ⚠️ Cambió la arquitectura de navegación: ahora hay un **shell persistente** (mes + balance hero + sub-tabs anidados + FAB global). Detalle abajo en §6.

---

## 1. Qué es este proyecto

**MisGastos** — App chilena de inteligencia financiera personal/familiar.
- Moneda: **CLP**, locale: **es-CL**
- 2 usuarios iniciales, 100% aislados entre sí (ADR-005)
- Basado en un manifest PDF de producto de 25 páginas (fases progresivas)

### Stack
| Capa | Tecnología |
|------|-----------|
| Mobile | Expo SDK 53, React Native 0.79.6, React 19, TypeScript |
| Backend | Node.js + Fastify + tsx (watch), Zod para validación |
| DB | Supabase (Postgres + RLS) — **conectada en cloud (proyecto bqnktrfwoxetbirrodmo), modo real activo** |
| AI | Groq API (`llama-3.1-70b-versatile`) con fallback a proveedor mock heurístico — **Groq real activo** |
| Tests | Vitest — **125/125 passing** |

### Estado de fases
- ✅ Phase 0: Spec + ADRs 001–007 (`spec/`, `docs/decisions/`)
- ✅ Phase 1: Core CRUD (transacciones, cuentas, presupuestos, balance)
- ✅ Phase 2: Dataset 100 transacciones determinísticas chilenas
- ✅ Phase 3: Ingestión email → RawEvent §12 → Parser determinístico §14
- ✅ Phase 4: AI Agent #1 (Transaction Intelligence)
- ✅ Phase 5: Deduplicación §15
- ✅ Phase 6: Notification Listener Android
- ⏸️ **Phase 7 (iOS build): DEFERIDA por el usuario** — quiere iterar más antes
- ✅ Phase 8: Personal Rules (reglas merchant→categoría) — **completada esta sesión**
- ⬜ Phase 9: Financial Advisor (Agente #2) — pendiente

---

## 2. Entorno Windows del usuario (CRÍTICO)

```powershell
# Paths exactos
JAVA_HOME    = C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot   # JDK 17, NUNCA 25
ANDROID_HOME = C:\Users\pipen\AppData\Local\Android\Sdk
PC IP        = 192.168.1.88   # teléfono accede al backend vía LAN
```

### Comandos clave (siempre con ExecutionPolicy Bypass)
```powershell
# Tests backend
powershell -ExecutionPolicy Bypass -Command "cd backend; npx vitest run"

# Backend dev (auto-reload)
npx tsx --watch src/index.ts     # desde backend/

# Prebuild Android (REGENERAR newArchEnabled después!)
npx expo prebuild --clean --platform android   # desde mobile/
# LUEGO: cambiar newArchEnabled=true → false en mobile/android/gradle.properties

# Build para instalar en teléfono: usar SIEMPRE RELEASE (incrusta el bundle JS).
# Debug NO incrusta bundle → la app buscaría Metro en :8081 y fallaría offline.
.\gradlew.bat assembleRelease     # desde mobile/android/  → app-release.apk

# Instalar en device (USB debugging conectado)
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r mobile\android\app\build\outputs\apk\release\app-release.apk
```

### Gotchas aprendidos a sangre (NO repetir)
1. **`expo-asset` y `expo-constants` deben ser dependencias top-level** en `mobile/package.json`. Si quedan anidadas en `expo/node_modules/`, el generador `ExpoModulesPackageList.java` falla → runtime error `Cannot find native module 'ExpoAsset'`. Fix: `npx expo install expo-asset expo-constants`.
2. **`expo prebuild --clean` regenera `newArchEnabled=true`** cada vez → hay que volver a ponerlo en `false` tras CADA prebuild, sino el build falla con el plugin deshabilitado.
3. **Plugin custom `withNotificationListener` está DESHABILITADO** (`plugins: []` en `mobile/app.json`). Usaba `modifyingApplicationManifest` que sobrescribía atributos `<application>` y rompía autolinking. El NotificationListener se registra manualmente en el AndroidManifest ya parcheado.
4. **PowerShell 5.1**: no soporta `&&`; usar `cmd1; if ($?) { cmd2 }`. Para JSON con caracteres especiales usar `[System.Text.Encoding]::UTF8.GetBytes($body)` como body.
5. **tsx --watch reinicia el proceso al editar archivos** → la memoria de `mockStore` se PIERDE. No confundir con bug: los datos mock desaparecen al recargar.
6. **Tras prebuild --clean verificar `usesCleartextTraffic`**: sin él la app release no puede llamar APIs HTTP LAN ("Network request failed" aunque el navegador del teléfono sí llegue). Fix permanente en app.json + AndroidManifest.
7. **Iconos: usar SIEMPRE `MIcon.tsx`** (texto crudo + fontFamily + fromCodePoint). El componente oficial de @expo/vector-icons trunca codepoints >0xFFFF → glifos invisibles en release sin errores en logcat.
8. **Instalar en device SOLO con assembleRelease** (debug no incrusta bundle JS y exige Metro :8081).
9. **Editar package.json solo con `npm pkg set`** (PowerShell ConvertTo-Json mete BOM y rompe Gradle/Expo).

---

## 3. Arquitectura actual

### Modo Mock vs Supabase
**El proyecto corre en MODO MOCK** (no hay Supabase real conectado). Esta sesión introdujo el flag definitivo:

```ts
// backend/src/lib/supabase.ts
export const isMockMode = !process.env.SUPABASE_URL || process.env.SUPABASE_URL === "http://localhost:54321";
```

- `isMockMode === true` → las rutas usan `mockStore` (memoria) DIRECTAMENTE, sin intentar Supabase jamás.
- `isMockMode === false` → Supabase real.
- Los tests mockean el módulo supabase.js con `isMockMode: false` para ejercitar el camino Supabase con mocks de query chains (ver patrón en `backend/tests/phase3.ingestion.test.ts`).

### mockStore (`backend/src/lib/mockStore.ts`)
Store **persistido a disco** (`backend/.mockstore.json`) + memoria:
- `rules[]`, `transactions[]`, `budgets[]`, `rawEvents{}` (para idempotencia)
- Métodos: list/find/upsert/update/delete/incrementHits + `_persist()` tras cada mutación; `reset()`; loadFromDisk() al arrancar (skip en NODE_ENV=test)

### Flujo de ingesta (Phase 8 final) — `backend/src/modules/ingestion/routes.ts`
```
POST /v1/ingestion/email | notification
  ├─ external_id existe? → respuesta idempotente (dedup por external_id)
  ├─ parseEmail() parser determinístico §14 (amount/date/time/bank/last4/merchant/operation)
  ├─ STEP 1: findRule(parser.merchant) → si matchea:
  │    category=rule, confidence=1.0, source="rule", SKIP AI, hits++
  ├─ STEP 2: si no → AI classify (Groq o mock)
  ├─ STEP 3 (NUEVO): findRule(ai.merchant) si ai.merchant ≠ "Desconocido"
  │    → si matchea: override categoría, source="rule", hits++
  │    → si no: source="ai", confianza de AI
  ├─ dedup §15: amount+date(fallback hoy)+merchant fuzzy+type contra últimas txs
  │    duplicate → status="duplicate", duplicate_of=<id original>
  └─ insert transaction (status: pending_ai | pending_review | duplicate)
```

### Provider mock (`backend/src/ai/providers/GroqProvider.ts`)
Sin `GROQ_API_KEY` → `mock()`:
- Extrae merchant del texto con lista KNOWN (Lider, Jumbo, Spotify, Netflix, Uber, Enel, Movistar, etc.) si parser no dio merchant_guess — **fix clave de esta sesión**
- Categorías por regex (supermercado/transporte/suscripciones/restaurantes/servicios)
- Reglas usuario tienen prioridad dentro del prompt/mock
- confidence: 0.88 conocido / 0.5 desconocido-o-sin-monto; needs_review acorde

### Rutas backend (version 0.3.0-phase8, puerto 3000)
| Ruta | Método | Notas mock mode |
|------|--------|-----------------|
| `/v1/rules` | GET/POST | mockStore directo; POST upsert por `(user_id, merchant_normalized)` |
| `/v1/rules/:id` | PATCH/DELETE | mockStore |
| `/v1/transactions` | GET/POST/PATCH/DELETE | PATCH corrige categoría → auto-crea/actualiza regla (aprendizaje UX §19) |
| `/v1/ingestion/email` | POST | flujo completo arriba |
| `/v1/ingestion/notification` | POST | igual con source=android_notification |
| `/health` | GET | `{"status":"ok","version":"0.3.0-phase8","phase":"Personal Rules"}` |

### Mobile
- `mobile/App.tsx`: **shell persistente** (ver §6) — header global (logo, chip 🤖IA, cog→Sheet "Más" con Reglas/Config/(dev)Probar/Galería) + MonthPager global + hero "Total Gastos" + chip filtro + barra de sub-tabs (Categorías/Movimientos/Presupuestos) + FAB global [+] (agregar Gasto/Ingreso) + estado global `filterCategory`/`month`/`subTab`/`secondary`
- `mobile/src/lib/useShellData.ts`: **fuente única de datos** del shell — carga en paralelo `/v1/balance`, `/v1/transactions`, `/v1/budgets` del mes; expone `{balance, txs, budgets, cats, byCat, reload}`. Cambiar mes re-renderiza todas las sub-tabs a la vez.
- `mobile/src/lib/categories.ts`: `Category` ahora incluye `type` (para filtrar solo categorías de gasto en presupuestos)
- `mobile/src/theme/tokens.ts` + `categoryIcons.tsx`: tokens (paleta #0C1322/#182238/#223052) + 14 categorías MCI con labels es-CL
- `mobile/src/components/ui/`: MIcon (glifos via fromCodePoint — USAR SIEMPRE ESTE), **BalanceHero (Total Gastos+ingresos/balance+chip filtro)**, **AddMoveModal (global)**, Card, Progress(slug opcional), CategoryCircle/Tag, Amount, MonthPager, EmptyState, StatusBadge es, ListRow/DayHeader, Sheet, ScreenHeader
- `mobile/src/screens/`: **Categorias (sub-tab "Distribución por Categoría" + últimos 5)**, **Movimientos (sub-tab, recibe txs/cats/month/filterCategory del shell, sin FAB propio, swipe-borrar, editar categoría+confirmación regla)**, **Presupuesto (sub-tab "Metas y presupuestos" + pill Configurar + Sheet límites por categoría — solo tipo gasto, POST upsert / DELETE)**, Categorias vieja no usada (grid) — reusada como distribuición; Config (ping /health, versión/modo, toggle modo desarrollador); Reglas/IngestionTest/GaleriaUI vía Sheet (>secondary)
- `mobile/.env.local`: `EXPO_PUBLIC_API_URL=http://192.168.1.88:3000`
- APK **release** INSTALADA (bundle embebido); debug NO se usa

---

## ⚠️ SESIÓN PARALELA — LEER ANTES DE TOCAR NADA

Durante la sesión del 25/08 hubo **OTRA IA/sesión editando este mismo repo simultáneamente** (sincronizado por OneDrive). Evidencia concreta:
- Creó `screens/GalleryUI.tsx` + `theme/icons.tsx` (ya ELIMINADOS tras fusión) y añadió un tab duplicado en App.tsx
- Puso BOM en `package.json` (rompió Gradle)
- A mitad de build insertó experimentos de fuentes en `GaleriaUI.tsx` (tarjeta "A) B) C) D)" — sigue ahí, es inofensiva pero NO es nuestra)
- Sus archivos usaban convención `colors.x` / `type.x` → se agregaron aliases en tokens para compatibilidad

**Reglas mientras exista riesgo de edición paralela:**
1. Antes de editar, verificar `LastWriteTime` del archivo objetivo; si cambió hace minutos, releerlo completo.
2. NUNCA reescribir package.json con `ConvertTo-Json` de PowerShell (mete BOM). Usar `npm pkg set`.
3. Tras cualquier npm install con deps nativas nuevas → `npx expo prebuild --clean --platform android` + re-parche `newArchEnabled=false` + rebuild. (Sin esto: módulos nativos faltan en el APK.)
4. Confirmar con el usuario que la otra sesión está cerrada antes de refactors grandes.

---

## 4. Cambios de la última sesión (lo más reciente primero)

-11. **U1 + U2 completadas y validadas por el usuario** (2026-08-26):
   - **Fix crítico de red**: el `prebuild --clean` borró `usesCleartextTraffic` → la app no podía llamar a `http://192.168.1.88:3000` (Android 9+ bloquea HTTP). Fix: `app.json → android.usesCleartextTraffic: true` + `android:usesCleartextTraffic="true"` en AndroidManifest. **Añadir a gotchas: tras prebuild verificar cleartext.**
   - **Iconos resueltos**: `MIcon.tsx` — componente propio que renderiza glifo como texto con `fontFamily:"MaterialCommunityIcons"` + `String.fromCodePoint(cp)`. El componente oficial `<MaterialCommunityIcons>` trunca codepoints >0xFFFF (`String.fromCharCode`). Migrados: CategoryCircle/Tag, FabMenu, MonthPager, ScreenHeader, EmptyState, Movimientos.
   - **U1**: navegación 4 tabs iconadas (Inicio/Movimientos/Presupuesto/Categorías) en App.tsx; header global (logo+chip 🤖IA+cog); Sheet "Más" con Reglas/Config/(dev)Probar/Galería; pantalla **Config real** (ping /health, versión, modo, toggle modo desarrollador); **Categorías** lista las 14 del sistema.
   - **U2 Inicio**: hero balance (disponible = ingresos−gastos, rojo si <0), **MonthPager** conectado a API `?month=`, **recuento gastos por categoría** (solo categorías con gasto>0, orden desc, barra proporcional al total), **últimos 5 movimientos** (icono categoría + nombre + monto coloreado).
   - **Filtro cruzado Categorías→Movimientos**: tap en categoría de Inicio activa filtro global (`filterCategory` vive en App.tsx); chip aparece **a la izquierda entre balance y recuento** en Inicio y arriba a la izquierda en Movimientos; `×` limpia. El balance NUNCA se filtra (decisión usuario).
   - **CRUD manual completo**: FAB expandible (Gasto/Ingreso — Transferencia deferida) → modal POST /v1/transactions; si no trae categoría y existe regla para ese merchant, se auto-aplica; PATCH acepta `update_rule:false` para corregir sin tocar regla; confirmación didáctica "¿Cambiar preferencia?" cuando ya existe regla distinta; swipe-izquierda borra SIN popup (optimista, tolera 400 de ids demo); fila muestra `Categoría · fecha` (ya no `expense ai`) y merchant en Title Case.
   - **Backend**: prompt Agente#1 mejorado (merchant Title Case sin preposiciones); parser stopwords +on/a/al; POST normaliza merchant Title Case y aplica regla si falta categoría.
   - Regla fantasma `jumbo on` borrada de Supabase. Toast rediseñado (tarjeta surface + borde). 125/125 tests.

-10. **Migración completa a MaterialCommunityIcons** (estado: instalado, PENDIENTE confirmación visual del usuario):
   - Síntoma persistente: glifos Ionicons invisibles en release aunque `Font.isLoaded('Ionicons')===true`. MaterialCommunityIcons SÍ renderiza (el robot 🤖 se veía).
   - Causa: desalineación TTF↔glyphmap del set Ionicons vendido en @expo/vector-icons@14.1.0 en este setup. NO es problema de carga (probe lo descartó).
   - FIX: todo el sistema usa MaterialCommunityIcons. Archivos migrados: `theme/categoryIcons.tsx` (14 categorías, nombres verificados contra glyphmap JSON), `components/ui/{CategoryCircle,EmptyState,FabMenu,MonthPager,ScreenHeader}`. Props renombrados: settings-outline→cog, receipt-outline→receipt, chevron-back/forward→chevron-left/right.
   - La sonda `probe:` sigue al tope de GaleriaUI (línea ámbar monospace) — QUITAR en U1.
   - **Verificación**: uiautomator dump lee TEXTO pero no glifos → la confirmación final de que los iconos se ven solo la puede dar el usuario mirando el teléfono.

-9. **CAUSA RAÍZ de iconos invisibles resuelta + prebuild obligatorio**:
   - Sonda de diagnóstico en GaleriaUI (texto ámbar "probe: ..." al tope) leyó vía `uiautomator dump`: `ExpoAsset.downloadAsync rejected → Module 'expo.modules.interfaces.filesystem.AppDirectories' not found` → el android/ generado por prebuild VIEJO no tenía los módulos nativos nuevos (expo-font/expo-asset/expo-file-system añadidos después).
   - **FIX definitivo**: `npx expo prebuild --clean --platform android` + re-parche `newArchEnabled=false` + copia manual de Ionicons.ttf/MaterialCommunityIcons.ttf a `android/app/src/main/assets/fonts/` + assembleRelease.
   - **REGLA DE ORO**: cada vez que se agregue/actualice un paquete con parte nativa → `expo prebuild --clean` + re-parche newArch. Añadido mentalmente al pipeline.
   - La sonda probe queda en la galería (línea ámbar) hasta U1; ahora dice "already loaded".
   - Pendiente del usuario: confirmar visualmente glifos, flechas blancas, FAB nuevo, chip 🤖.

-8. **U0 feedback ronda 1 — fixes visuales**:
   - **BUG raíz**: iconos Ionicons no renderizaban en release. PRIMER intento (useFonts gate) COLGÓ el arranque 3min en release → REVERTIDO: NO bloquear el launch por fuentes; el override de expo-font ya arregla la carga nativa de vector-icons. Verificar iconos vía logcat (ausencia de "Unrecognized font family"). Ruta TTF correcta en v14 si algún día se necesita precargar: `build/vendor/react-native-vector-icons/Fonts/` (mayúscula).
   - Paleta aclarada según gusto usuario: bg #0C1322, surface #182238, surfaceAlt #223052, border opacidad 0.16.
   - MonthPager: chevrons blancos (C.text) 20px, área táctil mayor.
   - Progress: prop opcional `slug` → icono de categoría al final + % numérico.
   - FabMenu rediseñado: FAB 62px, animación spring, "+" rota 135° al abrir, mini-FABs sólidos 48px con icono oscuro, labels pill 15px w700, backdrop más profundo, glow azul.
   - AiChip/HeaderChip ahora usan MaterialCommunityIcons `robot-happy` 🤖 con borde tintado.
   - GaleriaUI: demos de barras ahora con slug+gastado/total es-CL; sheet titulada "🤖 Asistente IA".
   - Verificado: sin crashes ni errores de fuente en logcat tras scrollear galería completa.

-7. **Unificación de implementaciones duplicadas** (post-conflicto OneDrive):
   - Fusionado lo mejor de `theme/icons.tsx` (sesión paralela) en `theme/categoryIcons.tsx`: labels es-CL por categoría + glifos Ionicons 7 correctos (ellipsis-horizontal, car-sport, flash, bag-handle) + helper con fallback.
   - ELIMINADOS: `src/screens/GalleryUI.tsx`, `src/theme/icons.tsx`, tab duplicado en App.tsx.
   - Queda UNA sola galería (tab "UI U0" → se moverá a Config en U1) y UN solo sistema de iconos/tokens.
   - Componentes `ui/` quedaron como superconjunto (aceptan props de ambas convenciones: showSign/signed, month/value, cta/ctaLabel, HeaderChip/AiChip, actions/onSelect).
   - Verificado: build + install + launch sin crashes.

-6. **Fix crash al abrir (release build) — 3 causas encadenadas**:
   1. **expo-font duplicado**: `@expo/vector-icons@14.1.0` arrastraba expo-font@57 (SDK54) junto al 13.3.2 del SDK53 → NoSuchMethodError nativo. Fix: `"overrides": {"expo-font": "~13.3.2"}` en mobile/package.json.
   2. **BOM en package.json**: una edición con PowerShell dejó BOM UTF-8; el lector JSON de Expo (@expo/json-file vía resolveAppEntry) falla con EJSONPARSE durante configuración de Gradle ("Cannot convert '' to File"). Fix: reescribir sin BOM. LECCIÓN: editar package.json solo con herramientas que no metan BOM.
   3. **Archivos de sesión paralela** (GalleryUI.tsx, theme/icons.tsx, tab extra en App.tsx, aparecieron por OneDrive): esperaban API distinta (`colors`/`type`, `textDim`, `HeaderChip`, MonthPager `value=`, Amount `showSign`, FabMenu `onSelect`). Fix: componentes hechos superconjunto compatibles con ambas APIs (aliases en tokens, props opcionales). NO borrar archivos del otro set sin coordinar.
   - Builds de instalación en device: **SIEMPRE assembleRelease** (debug no incrusta bundle JS y exige Metro :8081).
   - Verificado: app lanza sin FATAL EXCEPTION, MainActivity en foco.
   - ⚠️ ATENCIÓN: parece haber OTRA sesión/IA editando este repo vía OneDrive simultáneamente. Coordinar o cerrar para evitar conflicts.

-5. **UI Redesign U0 COMPLETADA — design system** (plan completo en `spec/ui-redesign-plan.md`):
   - Decisiones usuario: "Probar" tras modo dev en Config · fuentes nativas · gráfico barras primero.
   - `src/theme/tokens.ts` (paleta navy #070D1A/#111A2D, primary #38BDF8, estados ok/warn/over, helpers mes es-CL).
   - `src/theme/categoryIcons.tsx` (slug→icono Ionicons+tinte, 14 categorías).
   - Componentes base en `src/components/ui/`: Card+SectionHeader, Progress, CategoryCircle/Tag, Amount, MonthPager, EmptyState, StatusBadge (español), ListRow/RowText/DayHeader, FabMenu expandible, Sheet, ScreenHeader/Logo/AiChip.
   - `src/screens/GaleriaUI.tsx` con datos fake + tab temporal "UI U0" en App.tsx (se reubica a Config en U1).
   - Instalado `@expo/vector-icons@14.1.0` (sin deps nativas nuevas → no hizo falta prebuild).
   - Backend intacto: 125/125 tests. APK instalado. Checkpoint U0 pendiente de validación del usuario.

-4. **✅ MODO REAL ACTIVADO: Supabase cloud + Groq conectados y verificados**:
   - `.env` con credenciales reales → `isMockMode=false` globalmente.
   - Usuario demo en auth.users: `demo@misgastos.cl` / `Demo1234!`, id en `.env` como `DEFAULT_DEV_USER_ID`.
   - Migración nueva `003_add_transactions_source.sql`: columna `source text default 'ai'` (el schema 001 no la tenía; el mock la toleraba, Postgres no).
   - Fix migración 001: `enable extension` → `create extension` (nunca se había corrido contra Postgres).
   - setup-supabase.mjs: migraciones en transacción; fix chequeo HTTP 200 (Supabase Admin API devuelve 200 no 201).
   - **Ingestion routes reescritas sin trySupabase**: llamadas directas a Supabase con errores visibles (500 con mensaje). El patrón trySupabase ocultaba fallos de insert fingiendo éxito con objetos mock.
   - Parser: stopwords ampliadas ("por","para","del"...) → merchant ya no arrastra "por" ("Netflix por" → "Netflix").
   - Tests: mocks genéricos encadenables en phase5; store con tabla rules en phase3; patrón `.limit(1)` en vez de `.maybeSingle()` (compatibilidad mocks). 125/125.
   - E2E verificado contra DB real: regla netflix→entretenimiento aplica (source=rule, skip AI), Groq real clasifica Jumbo $45.200 con payment_method credit_card (conf 0.88), ambas tx persistidas con UUIDs/FKs reales, balance desde Supabase = 57.190.
   - Datos mock anteriores NO se migraron (categorías tienen otros UUIDs) — inicio limpio.
   - Pendiente menor: ruta /v1/accounts sigue sin modo mock (irrelevante con Supabase real activo).

-3. **Infra preparada para Supabase real + Groq** (esperando credenciales del usuario):
   - `backend/.env` creado con estructura completa (todo comentado → sigue en MOCK hasta llenar).
   - `index.ts` ahora hace `import "dotenv/config"` (tsx no carga .env solo).
   - `getUserId()` fallback a `process.env.DEFAULT_DEV_USER_ID` (necesario porque FKs apuntan a auth.users).
   - `npm i dotenv pg @types/pg`; script único `npm run setup-supabase`: aplica migraciones en orden (control vía tabla `_migrations`) + crea usuario demo@misgastos.cl vía Admin API e imprime el UUID para `.env`.
   - **OJO al activar Supabase**: se pierden datos del mock (categorías reales tienen UUIDs distintos); empezar limpio.
   - Creado `spec/ui-backlog.md` con ideas UI del usuario priorizadas (balance principal, gráfico categorías barra/circular elegible, presupuestos % con iconos).

-2. **Fix balance $0 en Inicio + Presupuesto vacío**:
   - **Causa**: `/v1/balance` y `/v1/budgets` nunca se migraron a modo mock (consultaban Supabase inexistente → devolvían vacío). Últimas rutas sin migrar: también `accounts` (sin impacto UI aún).
   - **Fix**: ambas rutas con `isMockMode` + `mockStore`; además ahora **excluyen transacciones `duplicate` e `ignored`** de balance/spent (§15) tanto en mock como en camino Supabase (filtro en JS, sin `.neq` para compatibilidad con mocks de tests).
   - mockStore: agregado `budgets[]` persistente (listBudgets/upsertBudget/deleteBudget).
   - Sembrado presupuesto global agosto 2026: $500.000 (spent real de pruebas ~$339.040 → 68%).
   - Sin cambios mobile → NO requirió rebuild APK.
   - Verificado curl: balance expense=339040, budgets pct=68%.

-1. **Fix pruebas B1-B3 fallando** (userId mismatch + UI sin campos):
   - **Causa raíz**: `IngestionTest.tsx` enviaba header `x-user-id: "demo"` pero Reglas/Movimientos no envían header (fallback `00000000-...`). Las reglas creadas en la app quedaban bajo `0000...` y la ingesta las buscaba bajo `demo` → nunca matcheaban → todo caía a AI. Además Movimientos no mostraba las transacciones de Probar por el mismo motivo.
   - **Fix**: removido el header de IngestionTest — ahora TODAS las pantallas usan el mismo usuario por defecto.
   - **Fix B1**: IngestionTest ahora renderiza banner prominente `classification_source` (📏 REGLA verde vs 🤖 AI azul) + `matched_rule` JSON. Antes esos campos del backend nunca se mostraban.
   - **Fix D1**: Movimientos solo usa demoTransactions si NO hay conexión (catch); con backend respondiendo `[]` muestra estado vacío real.
   - **Fix volatilidad**: mockStore persiste a `backend/.mockstore.json` (write-through en cada mutación, load al arrancar; skip en NODE_ENV=test). Los datos demo sobreviven reinicios de tsx --watch y del PC. Verificado matando el proceso: reglas sobrevivieron.
   - Reglas re-sembradas y persistentes: uber→transporte, lider→supermercado, spotify→suscripciones (hits uber=1, spotify=1 tras emails de verificación).
   - APK recompilado e instalado.

0. **Fix "el botón Nueva Regla no guarda"** (reportado por usuario, causa raíz encontrada):
   - **Causa**: `Reglas.tsx`/`Movimientos.tsx` mandaban slugs (`"supermercado"`) como `category_id`, el backend Zod exige UUID → 400 → los `catch {}` vacíos tragaban el error silenciosamente.
   - **Fix backend**: `GET /v1/categories` ahora tiene fallback mock con 6 categorías sistema y UUIDs estables `00000000-0000-0000-0000-00000000000X` (`backend/src/modules/categories/routes.ts`, constante exportada `SYSTEM_CATEGORIES`).
   - **Fix mobile**: nuevo módulo compartido `mobile/src/lib/categories.ts` (`fetchCategories()` con fallback offline a los MISMOS UUIDs). Ambas pantallas cargan categorías desde ahí.
   - `Reglas.tsx`: TextInput REAL para merchant libre (antes solo chips), chequeo `res.ok` + Alert con detalle del error del backend.
   - `Movimientos.tsx`: modal categorías usa categorías cargadas; errores visibles vía toast.
   - Reglas sembradas desde código para testing: `uber→transporte`, `lider→supermercado` (hits 0; uber ya consumida una vez por email de prueba → hits 1).
   - Verificación E2E curl: categories→create rule→email aplica regla (`source:"rule"`)→slug inválido da 400 correctamente.
   - APK recompilado e instalado en device.

1. **Fix raíz "las reglas no se guardan"**: reemplazado el patrón `trySupabase(promise, fallback)` (que evaluaba fallbacks eager y fallaba silencioso) por branching explícito con `isMockMode`.
2. **Reglas post-AI** (STEP 3): el caso reportado por el usuario era email tipo *"Tu suscripción Spotify se renovó $7.490"* sin patrón `en <merchant>` → parser devolvía merchant=null → regla nunca chequeada. Ahora si la IA extrae "Spotify", se busca regla y se aplica.
3. **Mock extrae merchants del texto** (lista KNOWN) en vez de depender solo de parser_hints.
4. **Dedup date fallback**: emails sin fecha usaban candidate.date=null → `sameDay()` siempre false → duplicados pasaban. Ahora fallback a hoy.
5. **Bug transferencia**: type estaba hardcodeado `"expense"` tras refactor → restaurado `ai?.transaction_type ?? (p.operation==="transfer" ? "transfer" : "expense")`.
6. **Tests**: todos los `vi.mock("../src/lib/supabase.js")` ahora exportan también `isMockMode: false` (6 archivos). Sin eso, las rutas tomaban camino mock y los mocks de Supabase nunca se ejercitaban → 19 tests fallaban.
7. **Verificación E2E con curl** (todo funcionando):
   - Crear regla spotify → suscripciones ✅
   - Email sin patrón "en Spotify" → `classification_source:"rule"`, `matched_rule:{...}`, hits:1 ✅
   - Reenvío → `dedup.is_duplicate:true` ✅
   - `GET /v1/transactions` lista la tx con `source:"rule"` ✅

---

## 5. Limitaciones conocidas (no bugs)

- **mockStore es volátil**: reiniciar backend borra reglas/transacciones. Para demo persistente real → configurar Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) y correr migraciones `supabase/migrations/001_initial.sql` y `002_phase1_fixes.sql`.
- **GROQ_API_KEY no configurada**: clasificación es heurística mock. Al configurarla, el flujo real usa llama-3.1-70b con structured outputs + validación Zod estricta.
- **Duplicados sí se insertan** con status="duplicate" (por diseño §15: auditoría). Los cálculos de balance deben excluirlos — verificar que así sea al conectar Supabase.
- **getUserId** cae a `"00000000-0000-0000-0000-000000000000"` sin header `x-user-id` — consistente entre app y curl, pero TODO: JWT real en prod (ADR seguridad).
- Phase 7 iOS deferida; el usuario decidió seguir iterando features antes.

---

## 6. Estado del plan UI y próximos pasos

> DECISIÓN DE SCOPE del usuario (2026-08-25): Phase 9 (Advisor) e iOS se difieren
> a versión posterior. Plan detallado con checkpoints: `spec/ui-redesign-plan.md`.

### U0 — Design System ✅ 100%
- Tokens, paleta, 11 componentes ui, GaleriaUI — verificado on-device (iconos MCI, chevrons, FAB, chip IA)
- Feedback ronda 1 cerrado: MonthPager centrado · Progress sin % superpuesto (solo barra+icono) · FabMenu premium · chip IA robot-happy

### U1 — Navegación + Header + Config real ✅ 100%
- 4 tabs iconadas (Inicio/Movimientos/Presupuesto/Categorías) + header global + Sheet ⚙ (Reglas, Config, Probar/Galería tras devMode)
- Config real con /health, botón Limpiar base, Categorías fix slug→icono, Movimientos swipe-borrar sin popup + FAB Gasto/Ingreso, categoría en fila como `Supermercado · 22/08`
- ⚠️ NOTA: esta 4-tabs fue REEMPLAZADA en U5 por el shell persistente (ver §6 abajo)

### U2 — Inicio ✅ 100% (absorbida en el shell)
- Hero balance, MonthPager funcional, recuento por categoría solo con gasto >0, filtro global
- ⚠️ NOTA: con el shell, el hero+MonthPager pasaron a ser el bloque fijo superior y el recuento es la sub-tab "Categorías"

### U5 — Metas y presupuestos + Shell persistente ✅ 100% (validado on-device)
- **Re-arquitectura**: shell con mes+balance hero fijos arriba, sub-tabs anidados, FAB global. Backend POST /v1/budgets fix manual upsert (partial indexes).
- Sub-tab **Presupuestos**: "Metas y presupuestos / Límites mensuales por categoría" + pill **Configurar** + Sheet deslizable (solo tipo gasto) + input CLP + Guardar/Quitar + `SwipeRow` + tap-editar + "Copiar del mes anterior" (fetch `shiftMonth(-1)`). Barras `ok<70·warn70-99·over≥100`, Validado: fix rojo visible, swipe-borrar, copiar con mensajes, edición.
- FAB global → `FabMenu` expandible Gasto/Ingreso (sin Transferencia, verificado), hero Total Gastos protagonista con Ingresos/Balance destacados.

### U6 — Pulido + IA sheet local ✅ 100% (build release instalado, verificado)
- **Sonda quitada**: `GaleriaUI.tsx` sin `probe:` ámbar ni `Font`/`Ionicons`/`catIcon` (solo design system).
- **Chip IA agrandado**: `App.tsx aiChip` `icon14→20`, `pad9/5→14/7`, `text11→13`, gap6 + sombra `0.15/8` (elipse prominente). `IA` ahora abre **IASheet**, `⚙` abre **Más** (antes ambos abrían lo mismo).
- **IASheet** (`components/ui/IASheet.tsx`): 4 prompts locales con datos reales del `useShellData` del mes — `¿Cuánto llevo gastado?` (expense), `¿En qué gasto más?` (byCat max), `¿Voy pasado de presupuesto?` (budgets pct), `¿Cómo va mi balance?` (income-expense). Sin LLM (Phase 9 lo reemplazará). Verificado on-device: abre, muestra prompts.
- Donut "Distribución" queda para **v1.1** (`react-native-svg` + prebuild).

### U3 — Categorías backend by_category (opcional) · Siguientes fases reales
- **U3**: extender `/v1/balance` con `by_category`. Hoy `Categorías` calcula `byCat` en cliente desde `/v1/transactions`; con backend sería Σ==expense. Opcional pre-v1.
- **Siguientes**: **Phase 9 Financial Advisor (Agente #2)** + **Phase 10 Hardening** (seguridad, performance, backups, Play Internal). Ver Roadmap §Phase 9/10 y §"Prueba notificaciones/email" abajo.

### Pendientes menores
- FAB agrega solo Gasto/Ingreso (Transferencia deferida) — shell `FabMenu` sin Transferencia
- `mobile/src/screens/Dashboard.tsx` **sin uso** (hero en shell). Borrar tras coordinar (OneDrive paralelo).
- `/v1/accounts` sin modo mock (irrelevante con Supabase real)
- Backend hosting (Railway/Fly) fuera de LAN — decidir antes de v1 real
- Segundo usuario aislado (ADR-005): login → JWT real en Hardening

### Prueba notificaciones / reenvío email (aunque backend incompleto) — cómo probar HOY
- **Backend ya listo para probar (sin OAuth Gmail)**: `POST /v1/ingestion/email` y `/v1/ingestion/notification` están activos en `isMockMode=false` y `true` (idempotencia `external_id` + `parser §14` + `AI → rule → dedup §15`). No necesitas OAuth para validar el flujo completo.
- **Reenvío email (sin Gmail API)**: reenvía manualmente cualquier email de banco/comercio a tu endpoint de ingesta (o usa `mobile/src/screens/IngestionTest.tsx` → "Probar (dev)" tras activar modo desarrollador). Verifica `classification_source` `rule` vs `ai` y `status` `pending_*`/`duplicate` en `/v1/transactions`. Ver `spec/integrations.md` §11.1 Fase 1.
- **Notificaciones Android**: `mobile/plugins/withNotificationListener.js` genera `NotificationListenerService` (requiere `POST_NOTIFICATIONS` + habilitar `BIND_NOTIFICATION_LISTENER_SERVICE` en Ajustes → Acceso a notificaciones). Plugin está **deshabilitado** en `app.json` (`plugins:["expo-asset"]`) porque rompía autolinking — el servicio se registra **manual** en `AndroidManifest.xml` ya parcheado. Filtra por paquetes `Santander, BCI, BancoEstado, MercadoPago` → `POST /v1/ingestion/notification` (`source=android_notification`). Ver `spec/integrations.md` §11.2 y `mobile/src/native/NotificationListener.ts` + `HANDOFF.md` gotcha 3.
- **Permisos a probar**: `POST_NOTIFICATIONS` (runtime) + acceso a notificaciones (opt-in). Sin habilitar, no llegan eventos. Para test rápido usa `IngestionTest.tsx` con `raw_content` simulado (no necesita permiso real).
- **Qué falta para producción**: Gmail OAuth `gmail.readonly` (restricted, verificación Google + privacy policy) + `users.messages.list` / Pub/Sub (§11.1 Fase 2) y `iOS share extension` (§11.3). Queda para Phase 10 / v1.1.

### Verificación on-device vía ADB (sin ver pantalla)
```powershell
$adb="C:\Users\pipen\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb shell uiautomator dump /sdcard/u.xml; & $adb shell cat /sdcard/u.xml > u.xml
# buscar text="..." — sirve para TEXTO, no para glifos de iconos
# Tab galería (1080x2436): tap centro del nodo "UI U0" (~848,2216)
```

### Posterior (versión siguiente): Phase 9 Advisor, iOS, OAuth Gmail (3b), Hardening completo.

## 7. Dónde mirar primero al retomar

```
backend/src/index.ts                          → entrypoint, versión, registro rutas
backend/src/lib/supabase.ts                   → isMockMode flag
backend/src/lib/mockStore.ts                  → store memoria
backend/src/modules/rules/routes.ts           → CRUD reglas
backend/src/modules/transactions/routes.ts    → CRUD txs + aprendizaje de reglas
backend/src/modules/ingestion/routes.ts       → PIPELINE PRINCIPAL (steps 1-3 + dedup + insert)
backend/src/modules/ingestion/parser.ts       → parser determinístico §14
backend/src/modules/ingestion/dedup.ts        → lógica duplicados §15
backend/src/ai/providers/GroqProvider.ts      → Groq real + mock heurístico
backend/src/ai/providers/AIProvider.ts        → schema Zod AgentOutput
spec/roadmap.md                               → fases
docs/decisions/001-007.md                     → ADRs
PLAN-dev-client-fix.md                        → análisis root cause native modules
```

## 8. Verificación rápida de salud (al retomar)

```powershell
# 1. Backend arriba?
Invoke-RestMethod http://localhost:3000/health

# 2. Tests verdes?
cd backend; npx vitest run    # esperar: 17 files, 125 tests passed

# 3. Flujo reglas funciona?
Invoke-RestMethod -Uri http://localhost:3000/v1/rules -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"merchant_normalized":"test","preferred_category_id":"00000000-0000-0000-0000-000000000001"}'
Invoke-RestMethod http://localhost:3000/v1/rules   # debe listar la regla creada

# 4. Teléfono alcanza el backend? (con app abierta en Config tab o Probar)
# La app apunta a http://192.168.1.88:3000
```
