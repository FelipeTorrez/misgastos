# AGENTS.md — MisGastos

> Stack: Expo SDK 53 / RN 0.79.6 / React 19 / TS + Fastify + Zod + Supabase (Postgres RLS, project `bqnktrfwoxetbirrodmo`) + Groq `llama-3.1-70b`. Currency CLP, locale `es-CL`. Tests: Vitest `125/125`.

## Repo layout
- `backend/src/index.ts` — Fastify entry, registers all `modules/*/routes.ts`, `GET /health` (`0.3.0-phase8`), `isMockMode` branching
- `backend/src/lib/supabase.ts` — `isMockMode = !SUPABASE_URL || == localhost:54321`; `getUserId(req)` → `x-user-id` header, else `DEFAULT_DEV_USER_ID` env, else `000...0`
- `backend/src/lib/mockStore.ts` — in-mem + persisted `backend/.mockstore.json` (`rules`, `transactions`, `budgets`, `rawEvents`). Loses data on `tsx --watch` restart (skip `NODE_ENV=test`)
- `mobile/App.tsx` — shell: header + `MonthPager` + `BalanceHero` + sub-tabs `Categorías|Movimientos|Presupuestos` + global `FabMenu` + `AddMoveModal` + `filterCategory` global state
- `mobile/src/theme/tokens.ts` + `categoryIcons.tsx` — single source of truth (14 categories, `MIcon` required)
- `supabase/migrations/001_initial.sql` + `002_phase1_fixes.sql` + `003_add_transactions_source.sql`

## Commands (Windows — always `ExecutionPolicy Bypass`, PS 5.1 has no `&&`)
```powershell
# backend
cd backend; powershell -ExecutionPolicy Bypass -Command "npx vitest run"   # 17 files expected
npx tsx --watch src/index.ts   # :3000, auto-reload (mockStore wiped on reload!)

# mobile — single test does not exist; typecheck is `npx tsc --noEmit` (extends expo/tsconfig.base)
npx expo prebuild --clean --platform android  # after ANY native dep change, then fix gradle.properties!
# set mobile/android/gradle.properties newArchEnabled=false  (prebuild resets to true)
.\gradlew.bat assembleRelease   # from mobile/android → app-release.apk (ALWAYS release, debug needs Metro :8081)
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r mobile\android\app\build\outputs\apk\release\app-release.apk

# verification: ADB text only (glyphs not visible via dump)
& $adb shell uiautomator dump /sdcard/u.xml; & $adb shell cat /sdcard/u.xml > u.xml
# screenshot: adb shell screencap -p /sdcard/x.png; adb pull /sdcard/x.png
```

## Environment (this machine)
```
JAVA_HOME    = C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot  # JDK 17 only, never 25
ANDROID_HOME = C:\Users\pipen\AppData\Local\Android\Sdk
PC IP        = 192.168.1.88   # phone hits backend via http://192.168.1.88:3000
mobile/.env.local: EXPO_PUBLIC_API_URL=http://192.168.1.88:3000
```
- PS 5.1: use `; if ($?) { cmd2 }` not `&&`; JSON bodies need `[Text.Encoding]::UTF8.GetBytes($body)`
- `mobile/package.json` must never be written with `ConvertTo-Json` (inserts BOM → Gradle `EJSONPARSE`). Use `npm pkg set`.
- Workdir is `C:\Users\pipen\OneDrive\Desktop\MisGastos` (OneDrive-synced — see parallel-session warning in `HANDOFF.md` §⚠️).

## Backend gotchas
- **Supabase vs Mock branching**: check `isMockMode` explicitly. Tests mock `../src/lib/supabase.js` and must export `isMockMode:false` (6 files) or routes take mock path and mocks never exercise.
- **Budgets upsert**: table has *partial* unique indexes (`WHERE category_id IS NOT NULL/NULL`). `supabase.upsert(...,{onConflict:"user_id,category_id,month"})` fails → use manual `select ... limit(1)` then `update`/`insert` (see `budgets/routes.ts` POST fix). `category_id` nullable = global budget.
- **mockStore persistence**: `list/find/upsert` + `_persist()` after mutation; `loadFromDisk()` on start (skipped in test). Don't confuse data loss after `tsx --watch` reload with bug.
- **Ingestion pipeline** `POST /v1/ingestion/email|notification` — idempotency by `external_id`, `parser §14` → `findRule(parser.merchant)` → AI → `findRule(ai.merchant)` → dedup `§15` (`amount+date|today+merchant fuzzy+type`, status `duplicate`/`ignored` excluded from balance). Transfers need `type=transfer` + `from_account_id != to_account_id`.
- **Categories**: `GET /v1/categories` fallback `SYSTEM_CATEGORIES` (6 UUIDs `000...0001-6`) must match `mobile/src/lib/categories.ts` `FALLBACK_CATEGORIES` (includes `type`). Mobile `fetchCategories()` maps `name→label`.
- **Amount**: CLP `fmtCLP` via `Intl.NumberFormat("es-CL",{currency:"CLP"})`.

## Mobile gotchas
- **Icons — ALWAYS `MIcon.tsx`** (`Text` + `fontFamily:"MaterialCommunityIcons"` + `String.fromCodePoint(cp)`). `@expo/vector-icons` `MaterialCommunityIcons` component uses `fromCharCode` → truncates `>0xFFFF` → invisible in release, no logcat error. Probe is in `GaleriaUI.tsx` (amber monospace).
- **`expo-asset` + `expo-constants` must be top-level deps** in `mobile/package.json` (not nested under `expo/node_modules`) or `ExpoModulesPackageList.java` fails `Cannot find native module 'ExpoAsset'`.
- **`expo prebuild --clean` wipes `usesCleartextTraffic`**. Must re-apply `app.json android.usesCleartextTraffic:true` + `AndroidManifest android:usesCleartextTraffic="true"` or LAN `http://192.168.1.88:3000` → `Network request failed`.
- **`newArchEnabled`**: prebuild resets to `true`; manually set to `false` in `mobile/android/gradle.properties` or build fails (plugin disabled). Only prebuild after native dep changes.
- **Release only**: `assembleRelease` embeds JS bundle. `assembleDebug` needs Metro `:8081` → fails offline.
- **Shell data**: `useShellData(month)` fetches `balance?month=YYYY-MM`, `transactions?month=YYYY-MM`, `budgets?month=YYYY-MM-01` in parallel. Changing `month` reloads all tabs. `byCat` aggregates `expense` only, excluding `duplicate`/`ignored`.
- **SwipeRow** (`components/ui/SwipeRow.tsx`): single opaque `Pressable` child with matching `borderRadius` to container; transparent wrapper + mismatched radius leaks red `deleteBg`.
- **Presupuestos empty**: "Copiar del mes anterior" fetches `prev = shiftMonth(month,-1)` then `POST` each missing category (skips existing). If empty → toast `No hay presupuestos en {monthLabel(prev)} para copiar`.

## Testing
- `cd backend; npx vitest run` — 17 files, 125 tests; env `NODE_ENV=test` skips mockStore disk load. Fixtures: `tests/fixtures/{fixtures,dataset100,generate}.ts`.
- Mobile has no unit test runner in CI (Jest `test: jest` placeholder). Typecheck only: `cd mobile; npx tsc --noEmit` — 2 pre-existing errors in `Amount.tsx`/`ListRow.tsx` (literal type / missing `day`) are ignored by Metro/babel.
- Supabase `migrations/_migrations` table tracks applied migrations; `npm run setup-supabase` (or `scripts/setup-supabase.mjs`) applies `001→003` + creates `demo@misgastos.cl / Demo1234!`.

## Sources of truth
- `HANDOFF.md` — full gotchas + architecture + verification checklist (authoritative)
- `spec/ui-redesign-plan.md` — UI phases U0-U6, decisions (barras>circular, nativas, etc.)
- `spec/roadmap.md`, `docs/decisions/001-007.md` — product phases & ADRs
- `README.md` — quickstart (`web` on `:8084` vs `start:native`)
