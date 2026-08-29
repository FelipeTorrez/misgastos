# SDD — Hoja de edición de movimientos (Sheet bottom + chips)

> Estado: **Implementado** — 2026-08-28 · `mobile/src/screens/Movimientos.tsx:1` (Sheet + Pressable + toggle), `mobile/src/theme/tokens.ts:5`, `mobile/src/components/ui/Sheet.tsx:4`, `backend/src/modules/transactions/routes.ts:66`
> Relacionado: `spec/ui-redesign-plan.md` (U4 Movimientos CRUD), `spec/sdd-agente-financiero.md` (clasificación), `HANDOFF.md` § Movimientos, `design-system/misgastos/pages/movimientos.md` (page override)

---

## 1. Problema

El editor de categoría era un `Modal` centrado (`width:88%`, lista plana de `Text` sin iconos) — "recuadro feo" — que **solo aparecía tras tocar ✎**, y ✎ **solo existía en `pending_*` y `confirmed`** (`Movimientos.tsx:146-154` antes). El estado `corrected` (que queda tras guardar una corrección) no tenía affordance → "una vez corregida no te deja editar nada". El usuario pide que **tocar la fila abra un recuadro como el de Presupuestos** (chips con iconos, sin tapar toda la pantalla) y que sea reeditable siempre.

## 2. Goals / Non-Goals

**Goals:**
- G1 — Toda fila táctil abre el editor (incluido `corrected`): tap en cualquier parte de la fila → Sheet.
- G2 — Sheet inferior (no modal centrado): ocupa solo lo necesario, igual que Presupuesto ("Configurar límites").
- G3 — Chips con iconos: scroll horizontal de categorías con `CategoryCircle` (color/bg por slug, fallback "otros").
- G4 — Toggle inline "Guardar para este comercio" (default ON) reemplaza el `Alert` bloqueante; controla `update_rule` para aprender regla futura.
- G5 — Solo categoría (alcance acotado); monto/tipo/fecha quedan fuera.

**Non-Goals:**
- NG1 — Editar monto/fecha/tipo (queda para v1.1 si se pide).
- NG2 — Cambiar contrato backend (sigue `PATCH /v1/transactions/:id` con `category_id + status + update_rule`).
- NG3 — Cambiar `SwipeRow`/`delete` ni filtros superiores.

## 3. Diseño UX (flujo)

```
Filtros [Todas | Pendientes (n) | Confirmadas]
FlatList de movimientos
  └ SwipeRow (swipe izq → "Borrar" rojo)
      └ Pressable fila (pressed 0.75) ── tap ─┐
          ├ CategoryCircle 36                  │
          ├ merchant TitleCase + StatusBadge   │  isPending? → ✓ (confirma) : › (chevron)
          ├ meta "Supermercado · 22/08"        │
          └ monto  +$1.300 / −$1.300 / ± (transfer)
                                              ▼
                                   Sheet "Categoría del movimiento"
                                     ├ summary [merchant + fecha·CLP + badge]
                                     ├ hint "Elige una categoría"
                                     ├ ScrollView horizontal chips (92w, CategoryCircle 34 + label)
                                     ├ toggleRow "Guardar para este comercio" + switch
                                     └ [Cancelar | Guardar] (Guardar disabled si !selectedCat)
                                              │
                                   Guardar → PATCH /v1/transactions/:id {category_id, status:"corrected", update_rule:savePref}
                                   → toast + onRefresh() (useShellData reload)
```

- `openEdit(tx)` preselecciona `selectedCat = tx.category_id ?? null` y `savePref=true`.
- `pending_*` conserva el botón ✓ verde (32×32 `#10b981`) para confirmar sin abrir Sheet si se desea; igualmente la fila es táctil.
- `corrected` ahora también muestra `›` y es táctil (cierra el hueco reportado).

## 4. Especificación visual

Tokens reales (`tokens.ts:5`): `bg #0C1322`, `surface #182238`, `surfaceAlt #223052`, `border rgba(148,163,184,0.16)`, `primary #38BDF8`, `primarySoft rgba(56,189,248,0.15)`, `text #F1F5F9`, `dim #94A3B8`, `faint #64748B`. Radios `R sm10 md14 lg20 pill999`.

- Fila: `bg C.surface`, `p14`, `r12`, `gap10`, `minH68` (≥48dp touch), `borderLeft 3px #f59e0b` solo en `pending_review`.
- Summary: `bg C.surfaceAlt`, `border C.border`, `p12`, `r R.md`, row gap12.
- Chips: `92w`, `p10`, `r R.md`, `bg C.surfaceAlt` / activo `border C.primary bg C.primarySoft`, label `11/600 dim → primary`.
- Toggle switch: `46×28 r999`, off `C.surfaceAlt+border` thumb `dim`, on `C.primary` thumb `#04121F`.
- Iconos: `MIcon.tsx:10` `fromCodePoint` (evita bug `fromCharCode` >0xFFFF); `CategoryCircle` usa `categoryIconsV2.ts` (`CATEGORY_V2` 14 slugs).

## 5. Contrato API (sin cambios, solo uso distinto de `update_rule`)

`PATCH /v1/transactions/:id` (`routes.ts:66-96`):
```ts
body: { category_id: string, status?: "corrected", update_rule?: boolean }
// update_rule !== false → upsert rule merchant_normalized → preferred_category_id
```
Antes se hacía `GET /v1/rules` + `Alert` para preguntar si pisar regla existente. Ahora el Sheet envía directamente `update_rule = savePref` (default true). Backend ya maneja `onConflict:"user_id,merchant_normalized"`.

## 6. Implementación (cambios en `Movimientos.tsx`)

- Imports: `Modal,Alert` → `Pressable, ScrollView, Sheet`.
- Estado nuevo: `selectedCat: string|null`, `savePref: boolean`.
- Funciones nuevas: `openEdit(tx)`, `saveCategory()` (usa `selectedCat` + `savePref`), helper `isPending(tx)`.
- `renderItem`: `View` → `Pressable onPress={openEdit}`, elimina `editBtn ✎`, mantiene `confirmBtn ✓` solo en `isPending`, añade `chevron-right 18 faint` en el resto.
- Reemplazo Modal → `Sheet` con summary + `ScrollView horizontal` + toggle + `btnRow`.
- Estilos nuevos: `summary`, `catChip`, `toggleRow`, `switch`; eliminados `modal*`, `catBtn`, `editBtn`, `badge`.

Compatibilidad `SwipeRow`: el `PanResponder` (umbral 12px) no interfiere con tap; `Pressable` dentro de `Animated.View` + `TouchableOpacity` interior (✓) funciona (misma composición que Presupuesto).

## 7. Testing / Verificación

- `npx tsc --noEmit` (mobile) → OK (pre-check hecho el 2026-08-28).
- `npx vitest run` (backend) → no hay cambio de contrato, 125/125 debe seguir verde.
- Manual (ADb, `assembleRelease` embed JS): abrir Movimientos, tocar fila `corrected` → abre Sheet; cambiar chip → Guardar → recarga lista + toast; toggle OFF → `update_rule:false` (solo ese movimiento); toggle ON → regla futura aplica a siguiente ingesta del mismo merchant.
- Regresión: swipe borrar sigue optimista + `DELETE`, filtros `Todas/Pendientes/Confirmadas` y `filterCategory` intactos.

## 8. Riesgos / Alternativas

- Riesgo: toggle default ON puede crear regla no deseada si el usuario solo quería corregir un caso puntual. Mitigación: toggle visible con subtexto explícito; default ON coincide con el caso de uso principal ("guardar preferencia para el futuro").
- Alternativa descartada: mantener `Alert` previo (requiere fetch de rules y bloquea flujo). Se consideró popover centrado (rechazado por "feo y tapa pantalla").
- Alternativa descartada: editar monto/tipo (añade complejidad de validación CLP y UX de formulario; se deja para SDD posterior).

## 9. Rollout

1. SDD aprobado (este doc) + page DS `design-system/misgastos/pages/movimientos.md`.
2. PR ya aplicado: `Movimientos.tsx` + DS files. `npx tsc --noEmit` OK.
3. Build: `mobile/android/gradle.properties newArchEnabled=false` (si `expo prebuild --clean`), `gradlew assembleRelease`, `adb install -r`, `uiautomator dump` + `screencap`.
4. QA en device: verificar Sheet no tapa FAB, chips con iconos visibles en release (MIcon), switch accesible.
5. Siguiente (opcional): SDD para edición de monto/tipo si se solicita.

