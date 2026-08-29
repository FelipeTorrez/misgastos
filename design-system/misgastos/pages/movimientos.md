# Movimientos — Page Design System (override MASTER)

> **PROJECT:** MisGastos · **Page:** Movimientos (`mobile/src/screens/Movimientos.tsx`)
> **Generated:** 2026-08-28 (editado manualmente, override del MASTER genérico)
> **Stack:** React Native (Expo SDK 53) · **Style base:** Dark Mode (OLED) fintech

> ⚠️ Reglas aquí **overridden** MASTER. Para lo no listado, vale `design-system/misgastos/MASTER.md`.

---

## 1. Propósito de la página

Lista mensual de transacciones. Filtros `Todas / Pendientes / Confirmadas` + chip de filtro por categoría (viene de Categorías). Cada fila es táctil y abre un **Sheet inferior** (no modal centrado) para reeditar la categoría. Swipe horizontal para borrar. Estados: `pending_ai`, `pending_review`, `confirmed`, `corrected`, `duplicate`, `ignored`.

## 2. Tokens reales (override color — `mobile/src/theme/tokens.ts:5`)

MASTER sugería `#020617/#22C55E`; **este proyecto usa**:

| Rol | Hex | Token `C.*` | Uso en Movimientos |
|-----|-----|-------------|--------------------|
| bg | `#0C1322` | `C.bg` | fondo pantalla |
| surface | `#182238` | `C.surface` | fila, sheet panel, tag |
| surfaceAlt | `#223052` | `C.surfaceAlt` | chip inactivo, input, toggle off, summary |
| border | `rgba(148,163,184,0.16)` | `C.border` | bordes fila/chip/sheet |
| primary | `#38BDF8` | `C.primary` | chip activo, borde activo, switch on, botón Guardar |
| primarySoft | `rgba(56,189,248,0.15)` | `C.primarySoft` | fondo chip activo |
| text | `#F1F5F9` | `C.text` | merchant, título sheet |
| dim | `#94A3B8` | `C.dim` | meta (categoría·fecha), label chip inactivo |
| faint | `#64748B` | `C.faint` | hint, chevron |
| positive | `#34D399` | `C.positive` | monto ingreso |
| negative | `#F87171` | `C.negative` | fondo swipe delete |
| warning | `#FBBF24` | `C.warning` | borde izquierdo fila `pending_review` |

Radios `R`: `sm 10 / md 14 / lg 20 / pill 999`. Espaciado `SP`: `xs 4 sm 8 md 12 lg 16 xl 20 xxl 24`.

## 3. Tipografía (override — no web fonts en RN)

- **RN usa fuente nativa del sistema** (no Fira/Inter del MASTER). Pesos: `600` merchant, `700` labels/chips, `800` montos/títulos.
- Tamaños: título sheet `17/800`, merchant fila `15/600`, meta `12`, monto `15/800`, chip label `11/600`, hint `11`.
- Formateo CLP: `Intl.NumberFormat("es-CL",{currency:"CLP"})` (`mobile/src/lib/format.ts` — `fmtCLP`), fecha `fmtDate`.

## 4. Layout

- `FlatList` virtualizada (100 items, `keyExtractor: id`) — `padding:16` + `paddingBottom:96` (espacio FAB).
- `SwipeRow` (`mobile/src/components/ui/SwipeRow.tsx:8`): `PanResponder` umbral 12px, revela fondo rojo 90px "Borrar". `marginBottom:8`, `borderRadius:12`, `overflow:hidden` (evita fuga de fondo).
- Fila (`s.row`): `bg C.surface`, `p:14`, `r:12`, `gap:10`, `minH:68`, `flexDirection:row`. `rowPending`: `borderLeft 3px #f59e0b` solo para `pending_review`.
- Tap target: fila entera `Pressable` ≥48dp alto (68 cumple, `references/quick-reference.md: Touch 44pt/48dp`). Gap entre targets `≥8px` (gap 8/10).

## 5. Componentes de esta página

### 5.1 Fila — `Pressable` táctil

```
[SwipeRow]
  └ Pressable (pressed opacity 0.75) onPress → openEdit(tx)
     ├ CategoryCircle 36 (slug→color/bg de categoryIconsV2.ts, fallback "otros")
     ├ center flex:1 ─ header [merchant flex TitleCase + StatusBadge] + meta [categoría|Ingreso|Transferencia|Sin categoría · fecha]
     ├ amount (sign: + income / ± transfer / − expense; color: #34d399 / C.dim / #fff)
     ├ pending? → ✓ confirmBtn (32×32, bg #10b981) : chevron-right 18 C.faint
```

- Toda fila (incluido `corrected`) es táctil. `confirmed` ya no requiere ✎ dedicado.
- `StatusBadge` (`StatusBadge.tsx:4`): `pending_ai`→Pendiente IA, `pending_review`→Por revisar, `confirmed`→Confirmado, `corrected`→Corregido, `duplicate`/`ignored`→gris.

### 5.2 Sheet de edición — `Sheet.tsx:4` (bottom sheet)

Reemplaza al Modal centrado `width:88%` anterior (el "recuadro feo").

```
Sheet visible={!!editingTx} title="Categoría del movimiento"
  ├ summary (row, bg C.surfaceAlt, border C.border, p12, r R.md)
  │   ├ merchant TitleCase (15/700) + meta fecha·CLP (12 dim)
  │   └ StatusBadge del tx
  ├ hint "Elige una categoría" (11 faint)
  ├ ScrollView horizontal (contentContainer gap10, pV4 pR16)
  │   └ catChip × N (width 92, p10, r R.md, bg C.surfaceAlt / active border C.primary bg C.primarySoft)
  │       ├ CategoryCircle 34
  │       └ label 11/600 (dim → C.primary si activo)
  ├ toggleRow (p12, r R.md, bg C.surfaceAlt, border)
  │   ├ "Guardar para este comercio" (13/700) + sub "Aplicar a futuros movimientos de 'Jumbo'" (11 dim)
  │   └ switch 46×28 r999 (off: C.surfaceAlt+border; on: C.primary; thumb 20 r999 dim→#04121F)
  └ btnRow gap10 mt16
      ├ Cancelar (flex1, bg C.surfaceAlt) → setEditingTx(null)
      └ Guardar (flex1, bg C.primary, opacity 0.5 si !selectedCat, disabled) → saveCategory()
```

- Selección preseleccionada: `selectedCat = tx.category_id ?? null` al abrir (`openEdit`).
- No hay scroll vertical dentro del Sheet (chips son horizontales); el Sheet ocupa solo lo necesario (`justifyContent:flex-end`, handle 40×4).

### 5.3 Regla futura — toggle `savePref`

- Default `true` (ON). Controla `update_rule` en `PATCH /v1/transactions/:id`.
- Antes: `Alert` con "¿Cambiar preferencia? Mantener X / Cambiar a Y" (pedía fetch de rules). Ahora: un único toggle inline, elimina el Alert y el fetch previo.

## 6. Estados y flujo

1. Usuario toca fila (cualquier estado, incluido `corrected`) → `openEdit(tx)` abre Sheet.
2. Elige chip (resalta con `catChipActive`) → puede alternar el toggle.
3. "Guardar" → `PATCH {category_id, status:"corrected", update_rule:savePref}` (`backend/src/modules/transactions/routes.ts:66-94`).
4. Éxito → cierra Sheet, `onRefresh()` recarga `useShellData`, toast "Categoría actualizada" / "Categoría y preferencia guardadas".
5. Error → toast "Error al guardar categoría".

Filtros superiores no cambian; `filterCategory` (chip de Categorías) sigue filtrando la lista.

## 7. Accesibilidad (ux — override)

- Contraste `C.text #F1F5F9` sobre `C.bg #0C1322` ≈ 15:1 (>4.5:1). `C.dim` sobre `C.surface` >4.5:1.
- Touch target `≥44×44` (fila 68, chips 92×~64, botones 14p, switch 46×28).
- Iconos vía `MIcon.tsx:10` (`fromCodePoint`, no `@expo/vector-icons` que trunca >0xFFFF).
- No emojis como iconos; `StatusBadge` añade texto además de color (`color-not-only`).

## 8. Anti-patrones evitados (de quick-reference)

- ❌ Modal centrado que tapa pantalla → ✅ Sheet inferior.
- ❌ Lista plana de texto sin iconos → ✅ chips con `CategoryCircle`.
- ❌ Solo `pending/confirmed` editables → ✅ `corrected` también táctil.
- ❌ `Alert` bloqueante para regla → ✅ toggle inline.
- ❌ `ScrollView+map` para transacciones → ✅ `FlatList` virtualizada.

## 9. Pre-delivery checklist (esta página)

- [ ] Fila táctil abre Sheet en `pending_ai / pending_review / confirmed / corrected` (verificar `corrected`).
- [ ] Swipe revela "Borrar" y borra optimista + `DELETE /v1/transactions/:id`.
- [ ] Chips muestran todas las `cats` con `CategoryCircle` (fallback "otros" funciona).
- [ ] Toggle default ON; OFF guarda solo el movimiento (`update_rule:false`).
- [ ] `npx tsc --noEmit` OK (mobile) y `npx vitest run` OK (backend, 125 tests).
- [ ] Sin emojis; iconos `MIcon` visibles en release; chevron 18 faint visible.
- [ ] Sheet no tapa FAB; `paddingBottom:96` deja lista scrolleable.
