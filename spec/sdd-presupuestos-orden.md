# SDD — Orden de presupuestos por límite (mayor a menor)

> Estado: **Propuesto** — 2026-08-29 · `mobile/src/screens/Presupuesto.tsx:27` (derivación de `rows`), `mobile/src/lib/useShellData.ts:6` (`Budget.amount`)
> Relacionado: `spec/ui-redesign-plan.md` (U5 Presupuestos), `spec/ui-redesign-plan.md:188` (Categorías: "orden por gasto desc" como precedente), `docs/decisions/004-budgets.md`, `HANDOFF.md` § Presupuestos

---

## 1. Problema

La sub-tab **Presupuestos** muestra las metas por categoría en el **orden en que fueron creadas** (que es el orden de `SELECT` sin `ORDER BY` del backend). Hoy si el usuario creó primero `Comida 50.000`, después `Casa 65.000` y hoy `Vivienda 300.000`, la lista aparece como una escalera de creación, no por relevancia.

Cuando la lista es corta (2-5 categorías) el desorden se nota poco; al crecer el usuario debe recorrer visualmente la lista para entender "dónde está el dinero que más importa". El usuario pide que la lista se **ordene por el tamaño del límite, de mayor a menor, sin importar cuándo fue creada cada meta**.

## 2. Goals / Non-Goals

**Goals:**
- G1 — La lista de metas por categoría se muestra ordenada por `amount` **descendente** (mayor límite primero).
- G2 — El orden es **independiente de la fecha de creación** (no depende del orden del `SELECT` del backend).
- G3 — Cambio local y de bajo riesgo: sin tocar contrato de API ni sumar costos de servidor.

**Non-Goals:**
- NG1 — No alterar la sub-tab global ni la tarjeta de Metas (solo la lista por categoría).
- NG2 — No cambiar el contrato `GET /v1/budgets` (sigue devolviendo el mismo shape; el orden se resuelve en cliente).

  - Alternativa valorada y descartada: agregar `ORDER BY amount DESC` en `budgets/routes.ts:27`. Invasiva en backend, obligaría a reintroducir y manterer una convención de orden en el servidor, y rompería el orden natural que el `IASheet` nunca usó. Además rompe la prueba de contrato existente.
- NG3 — No modificar `SwipeRow`, filtros, ni el editor (Sheet "Configurar límites").
- NG4 — No cambiar la unidad de orden (por `amount`, no por `spent`/`pct`). El pedido explícito es por límite.

## 3. Diseño UX (flujo)

```
meta: budgets del mes (sin orden garantizado)
   │  filter b.category_id (excluye global)      (igual que hoy)
   ▼
rows = useMemo( budgets.filter(...).sort((a,b)=> b.amount - a.amount), [budgets] )
   │
   ▼
ScrollView de SwipeRow (mayor límite arriba)
   300.000 · Vivienda          ── 70%
    65.000 · Casa              ── 12%
    50.000 · Comida            ── 44%
```

- Empate de montos (dos metas idénticas): secundario por nombre (locale-sort `es`) para que el orden sea determinista.
- El editor Sheet y el orden de los *chips* de categorías no cambian (ahí se mantiene el orden de `cats`).
- La interacción (swipe borrar, tap editar, Configurar, Copiar del mes anterior) permanece idéntica.

## 4. Especificación visual

Sin cambios de token ni de layout. Se mantienen `s.row` (surface, p14, r12), `CategoryCircle 40`, nombre + `spent` + `de {amount}` + `Progress pct`. Único comportamiento nuevo: **orden de renderizado** de las filas. No hay cambios de color, tipografía ni espaciado, por lo que no se requiere página en `design-system/misgastos/pages/`.

## 5. Contrato API (sin cambios)

`GET /v1/budgets?month=YYYY-MM-01` (`budgets/routes.ts:27-33`) sigue devolviendo `Budget[]` con `amount`. El cliente es quien ordena. No hay cambio de shape, ni de body/enums, ni de tests de backend.

## 6. Implementación (cambios en `mobile/src/screens/Presupuesto.tsx`)

- Importar `useMemo` desde `react` (junto a `useState`).
- Reemplazar la línea 27:
  ```ts
  const rows = budgets.filter(b => b.category_id) as Budget[];
  ```
  por una derivación memoizada y ordenada:
  ```ts
  const rows = useMemo(() => {
    return budgets
      .filter((b): b is Budget => Boolean(b.category_id))
      .slice()
      .sort((a, b) => b.amount - a.amount || (a.categories?.name ?? "").localeCompare(b.categories?.name ?? "", "es"));
  }, [budgets]);
  ```
  - `.slice()` evita mutar el arreglo provisto por el estado de `useShellData`.
  - Orden principal: `b.amount - a.amount` (descendente).
  - Desempate determinista por nombre (case-insensitive locale `es`), suficiente para que `rows.map` no quede bailando entre builds.
- El resto del componente (`rows.length === 0`, `.map(b => ...)`, Sheet, `copyPrev`) no cambia.

Nota RN (aplicada la guía `ui-ux-pro-max`, `--stack react-native`/lists): el orden se deriva con `useMemo` sobre `[budgets]` (no inline en render) para evitar recomputar el `sort` en cada `pressed`/re-render; se mantiene `keys` por `b.id` para que las filas SwipeRow no pierdan identidad al reordenarse.

## 7. Testing / Verificación

- **Mobile typecheck**: `cd mobile; npx tsc --noEmit` (sin errores nuevos; los 2 preexistentes en `Amount.tsx`/`ListRow.tsx` quedan igual).
- **Backend**: `cd backend; npx vitest run` (125/125) — **sin cambio de contrato** no debería tocar nada, se corre como regresión.
- **Manual / ADb** (release embebido, `gradlew assembleRelease` → `adb install -r`):
  1. Crear en orden: Comida 50k → Casa 65k → Vivienda 300k (con `POST /v1/budgets` o UI).
  2. Abrir sub-tab **Presupuestos** → verificar orden Vivienda (300k) · Casa (65k) · Comida (50k).
  3. Editar Casa a 90k → recarga → Casa sube arriba de Vivienda (si 90k < 300k no; probar con un monto intermedio) → verificar reordenamiento tras `onRefresh`.
  4. Igualar dos montos → verificar desempate por nombre (orden alfabético `es`).
  5. Regresión: swipe borrar, tap editar, `Copiar del mes anterior`, Sheet configuración y toast intactos.

## 8. Riesgos / Alternativas

- **Riesgo**: el reordenamiento tras guardar/editar se percibe como "saltos" al cambiar una meta (una fila sube/baja). Mitigación: es esperable y mínimo (lista corta); no se anima el reorden (evita LayoutAnimation extra que podría chocar con `SwipeRow`).
- **Riesgo**: el orden cambia la posición de las filas → la clave visual `b.id` (no índice) garantiza que `SwipeRow` mantenga su historial de swipe y `Pressable` no pierda foco. Se cumple con `key={b.id}` ya existente.
- **Alternativa descartada** (NG2): ordenar en backend con `ORDER BY amount DESC`. Requería editar `budgets/routes.ts:27`, actualizar la prueba de contrato y fijar una convención de orden que además influiría en cualquier consumidor futuro. También aleja el orden de la UX donde se decide (cliente). Se elige cliente ∎ "orden por gasto desc" de Categorías es precedente del repositorio.
- **Alternativa descartada**: ordenar por `spent` o `pct`. El pedido es sobre el **límite** (`amount`); ordenar por gasto cambiaría semánticamente la lista y podría ocultar metas altas sin gasto.

## 9. Rollout

1. Aprobación de este SDD.
2. Editar `Presupuesto.tsx` (línea 27) con el `useMemo` de la §6.
3. `cd mobile; npx tsc --noEmit` (typecheck).
4. `cd backend; npx vitest run` (regresión 125/125).
5. Build release (`assembleRelease`), `adb install -r`, `uiautomator dump` + `screencap` para verificar el orden visual en device.
6. QA: crear editar borrar metas y confirmar reorden + regresiones de la §7.
7. Cierre: marcar `Estado: Implementado` y actualizar `HANDOFF.md` § Presupuestos si aplica.
