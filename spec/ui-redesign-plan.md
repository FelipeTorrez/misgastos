# UI Redesign Plan — MisGastos v1 "Premium Dark"

> Plan de rediseño visual/UX por fases, con checkpoints de prueba y conexión en cada una.
> Basado en: brief del usuario + análisis de referencias (Copilot Money, Revolut, YNAB,
> KuantoKuanta, Material 3) + auditoría del código UI actual.
> REGLA: proponer estructura ANTES de codificar (este documento). No perder funcionalidad existente.

---

## 📊 ESTADO ACTUAL (2026-08-26)

| Fase | Estado | Nota |
|------|--------|------|
| U0 Design System | ✅ **100%** | Iconos MCI vía MIcon.tsx verificados on-device |
| U1 Navegación+Config | ✅ **100%** | 4 tabs iconadas + header + Sheet Más + Config real (ping/health, Limpiar base, devMode) |
| U2 Inicio | ✅ **100%** | Hero balance + MonthPager + recuento categorías (solo >0, tap filtra) + últimos 5 |
| U4 Movimientos CRUD | ✅ **Adelantada** | Swipe-borrar sin popup + FAB Gasto/Ingreso + modal POST + confirmación regla didáctica |
| U5 Presupuestos UI | ✅ **Código** (falta build/install en device) | **+ re-arquitectura a shell persistente** (mes+balance fijos, sub-tabs anidados, FAB global). Barras Metas + pill Configurar + Sheet límites | 
| U6 Pulido+IA sheet local | ⬜ | quitar sonda probe, robot más grande, IA responde con datos reales, **donut Distribución (v1.1, requiere react-native-svg + prebuild)** |

### Re-arquitectura de navegación (decidida 2026-08-26, aplicada en U5)
El usuario pidió que la pantalla principal (mes + balance general) quede **fija arriba** y que uno pueda sub-navegar entre sub-tabs **sin que se mueva**, con un **FAB global [+]**. Se replicó el layout de KuantoKua:
- Bloque superior fijo: header (logo+IA+cog) → MonthPager → hero **Total Gastos** (+ingresos y **Balance** en verde a la derecha) → chip de filtro → sub-tabs `Categorías · Movimientos · Presupuestos`.
- Sub-tabs por debajo del bloque fijo (contenido scrollable; usa el mes del shell). Se eliminó la bottom tab bar; Reglas/Config/Probar/Galería quedan en el Sheet `[⚙]` (como pantallas `secondary` con botón atrás).
- FAB `[+]` global (abre modal Gasto/Ingreso), visible en todas las sub-tabs.
- **Fuente única de datos**: `mobile/src/lib/useShellData.ts` (balance+transactions+budgets del mes) → cambiar mes recalcula todo.

### Decisiones cerradas por el usuario (U5)
1. ~~Circular vs barras~~ → **barras primero**, circular post-v1
2. ~~Fuente~~ → **nativas del sistema**
3. ~~Probar~~ → **oculta tras modo desarrollador en Config**
4. ~~Filtro categorías~~ → tap en categoría de **Inicio** filtra Movimientos; chip a la IZQUIERDA; balance NUNCA filtrado
5. ~~Swipe borrar~~ → directo sin popup, optimista, tolera 400
6. ~~Fila movimientos~~ → `Categoría · fecha` (no `expense ai`), merchant Title Case
7. ~~Transferencia~~ → deferida; FAB solo Gasto/Ingreso
8. ~~Confirmación regla~~ → si ya existe regla con categoría distinta, preguntar didácticamente; `update_rule:false` para corregir solo ese movimiento (backend soporta)
9. ~~Reglas backend~~ → prompt Agente#1 Title Case sin preposiciones (corrige "jumbo on"→"Jumbo"); POST manual aplica regla si no trae categoría; parser stopwords +on/a/al
10. ~~Navegación~~ → **shell persistente** (mes+balance fijos + sub-tabs anidados + FAB global [+]) replicando KuantoKua
11. ~~Hero protagonista~~ → **Total Gastos** grande; `+ ingresos` y `Balance` en verde a la derecha
12. ~~Presupuesto global~~ → esta versión **solo por categoría** (sin tarjeta global en sub-tab Presupuestos)
13. ~~Archivo donut~~ → **v1.1** (requiere react-native-svg + prebuild); en U5 se usan **barras**
14. ~~Últimos 5 movimientos~~ → **se conservan** (sección en sub-tab Categorías)

### Siguiente elección del usuario (a decidir al retomar)
- **U6 (Pulido + IA sheet local)** es el siguiente objetivo y el último que cierra el v1 local. U3 (by_category backend) es opcional.

### Aplicado en código (resumen)
✅ Paleta #0C1322/#182238/#223052 · MonthPager centrado flechas blancas · Progress barra+icono sin % · FabMenu premium spring · chip IA robot-happy · toast tarjeta surface · Config real · **shell persistente (month+BalanceHero+sub-tabs+FAB global)** · sub-tab Categorías (distribución+últimos 5) · sub-tab Presupuestos (metas+barras+Configurar)
- Nuevos componentes: `BalanceHero`, `AddMoveModal`. Hook: `useShellData`. Screen `Dashboard` quedó sin uso (hero movido al shell).

### Pendiente aplicar
⏳ Donut "Distribución por Categoría" (v1.1, react-native-svg + prebuild)
⏳ Robot chip más grande/elipse (U6)
⏳ Quitar sonda probe GaleriaUI (U6)
⏳ Build+install del APK de U5 (solo se cambió JS → NO requiere prebuild, solo `assembleRelease`)

### Lección crítica resuelta
Glifos invisibles: @expo/vector-icons trunca codepoints>0xFFFF con fromCharCode → usar **MIcon.tsx** (fromCodePoint + fontFamily crudo). NO volver a los componentes oficiales para MCI.

---

## 1. Auditoría de la UI actual (por pantalla)

| Pantalla | Estado | Problemas |
|----------|--------|-----------|
| **App.tsx** | 6 tabs de texto plano apretados | Sin iconos, sin jerarquía; "Config" es un stub que dice "Phase 8"; sin header común |
| **Inicio/Dashboard** | BalanceCard básico + evolución semanal en TEXTO plano | Card residual "Próximo paso: Fase 1..." (copy viejo); sin selector de mes; sin categorías visuales; sin movimientos recientes |
| **Movimientos** | Funcional (filtros, badges, ✓/✎) | Badges en inglés crudo (`pending_ai`); sin agrupación por día; sin iconos de categoría; `+ Agregar` NO hace nada |
| **Presupuesto** | BudgetBar con estados correctos | Sin iconos; sin crear/editar presupuesto en UI (pide usar la API por texto ¡!); sin global destacado |
| **Categorías** | No existe como pantalla | — |
| **Reglas** | Funcional | Estética admin; irá a sección secundaria |
| **Probar** | Herramienta dev valiosa | Es dev-tool, no pantalla principal; irá a sección secundaria |
| **Global** | — | Paleta gris Tailwind genérica; estilos duplicados por pantalla; cero sombras/elevación; cero estados vacíos; cero iconografía; cero micro-interacciones |

## 2. Principios extraídos de las referencias

1. **"Color significa estado, nada más"** (patrón fintech): verde/rojo SOLO para positivo/negativo/presupuesto. El resto neutro. *(Copilot: lienzo casi monocromo donde el único ruido son los acentos de categoría.)*
2. **Los numerales son la tipografía que importa**: montos grandes con peso alto, cifras consistentes, símbolo $ más tenue que el valor. Contraste estricto sobre oscuro.
3. **Diseñar el estado pendiente/procesando** (Wise): badges legibles en español, no `pending_ai` crudo.
4. **Dark-first con disciplina de contraste** (Revolut): superfacies casi negras azules, bordes sutiles, motion escaso y funcional.
5. **Material 3**: contenedores suaves (círculos para iconos), espaciado consistente en múltiplos de 4, elevación sutil.
6. **YNAB/Kuanto**: barras de progreso claras con estados; simpleza de navegación.

## 3. Design Tokens (`src/theme/tokens.ts`)

```ts
colors: {
  bg:          "#070D1A",   // fondo profundo azul-negro
  surface:     "#111A2D",   // tarjetas
  surfaceAlt:  "#182338",   // insets anidados / inputs
  border:      "rgba(148,163,184,0.12)",
  primary:     "#38BDF8",   // cian-azul (acción, foco, activo)
  primarySoft: "rgba(56,189,248,0.15)",
  positive:    "#34D399",
  negative:    "#F87171",
  warning:     "#FBBF24",
  text:        "#F1F5F9",
  textDim:     "#94A3B8",
  textFaint:   "#64748B",
}
radius: { sm: 10, md: 14, lg: 20, pill: 999 }
space: 4-base (4/8/12/16/20/24/32)
type: {
  display: 36-40 w800 (balance hero),
  h1: 22 w800, h2: 16 w700,
  body: 14 w400, caption: 12, label: 11 w600 uppercase tracking 0.5
}
elevation: sombra muy sutil +/o borde 1px en vez de sombra (Android-friendly)
```

**Iconografía**: `@expo/vector-icons` (**MaterialCommunityIcons**, verificado que renderiza en release) — viene con Expo SDK. Ionicons se descartó (TTF desalineado en 14.1.0, sonda probe lo evidenció).
Mapa categoría-slug → icono + tinte + label es-CL (`src/theme/categoryIcons.tsx`):

| slug | icono (MCI) | tinte |
|------|-------------|-------|
| supermercado | cart | #4ADE80 |
| restaurantes | silverware-fork | #FB923C |
| transporte | car | #60A5FA |
| suscripciones | television | #C084FC |
| servicios | flash | #FBBF24 |
| vivienda | home | #2DD4BF |
| salud | heart | #F87171 |
| educacion | book-open-variant | #818CF8 |
| entretenimiento | gamepad-variant | #E879F9 |
| compras | shopping | #F472B6 |
| deudas | credit-card | #FCA5A5 |
| alimentacion | food | #A3E635 |
| otros | dots-horizontal | #94A3B8 |
| transferencias | swap-horizontal | #38BDF8 |

## 4. Nueva navegación

```
Tab bar (4):  🏠 Inicio · ⇄ Movimientos · ◎ Presupuesto · ◔ Categorías
Header (componente compartido ScreenHeader):
   Inicio → [logo MisGastos] [‹ Agosto 2026 ›] [✨ IA] [⚙]
   Resto  → [título]                        [⚙ cuando aplique]
⚙ abre Sheet secundaria → Reglas · Probar (dev) · Config
Config (real, nueva): estado backend (ping /health), modo (Supabase real/mock),
versión, usuario activo, enlace a Galería UI (dev).
```

Se elimina: copy residual de fases, tabs de texto, stub de Config.

## 5. Componentes base nuevos (`src/components/ui/`)

`Card` · `Progress` (estados ok/warn/over) · `CategoryCircle` (icono+tinte) · `Amount`
(monto formateado con jerarquía $ tenue) · `MonthPager` · `EmptyState` (icono+texto+Cta) ·
`StatusBadge` (español: Pendiente IA/Revisión/Confirmado/Corregido/Duplicado) ·
`ListRow` · `SectionHeader` (título + acción "Ver todo") · `FabMenu` (+ expande Gasto/Ingreso/
Transferencia) · `Sheet` (modal bottom redondeado) · `ScreenHeader`.

Animaciones: `LayoutAnimation` nativo (sin dependencias) para mes/FAB/barras.

---

## 6. Plan por fases (cada fase = código + tests + APK + prueba en teléfono)

### U0 — Fundación del design system
- tokens.ts · icons.tsx (mapa categorías) · componentes base listados arriba
- Pantalla temporal **Galería UI** (accesible luego vía Config) para ver todos los
  componentes con datos fake SIN conectar pantallas reales
- **Checkpoint**: compila, Galería se ve bien en device, 125 tests verdes, APK instalado

### U1 — Navegación + Header + Config real
- TabBar 4 tabs iconados; ScreenHeader; Sheet secundaria (Reglas/Probar);
  pantalla Config real con ping a `/health` mostrando estado de conexión
- Migración de pantallas existentes al theme (fondo/superficies/tipos) sin cambiar layouts internos aún
- **Checkpoint**: las 4 pestañas navegan; Reglas y Probar funcionan desde la hoja;
  Config muestra "Conectado a Supabase · v0.3.x"; flujos anteriores intactos

### U2 — Inicio (dashboard financiero)
- Header completo (logo, MonthPager conectado a API `?month=`, chip IA placeholder)
- Hero de balance (display XL, estado negativo elegante, ingresos/gastos discretos)
- Bloque resumen del período; Top 4 categorías (mini-barras) con "Ver todas";
  últimos movimientos con link a Movimientos
- Eliminar copy viejo de fases
- **Checkpoint**: cambiar mes recarga datos; montos coinciden con curl de
  `/v1/balance?month=`; pull-to-refresh mantiene mes seleccionado

### U3 — Categorías ⚙️ *incluye cambio backend*
- **Backend**: extender `GET /v1/balance` con `by_category[{slug,name,spent,pct,budget}]`
  (une gastos del mes + presupuestos vigentes) + test nuevo
- Pantalla: lista completa con CategoryCircle, monto, %, barra estados;
  orden por gasto desc
- **Checkpoint de conexión**: Σ(gastos por categoría) == expense del mes en Supabase (verificar con SQL/curl);
  categorías sin presupuesto muestran solo gastado
- Decisión abierta aparte: gráfico circular (requeriría `react-native-svg` + rebuild)

### U4 — Movimientos + entrada manual ⚙️ *cierra hueco CRUD*
- Filas agrupadas por día (Hoy/Ayer/fecha es-CL); StatusBadge en español;
  tap → Sheet con acciones (confirmar · cambiar categoría · eliminar)
- **FabMenu expandible → Gasto/Ingreso/Transferencia** → formulario modal
  (monto, merchant, categoría con iconos, fecha default hoy) → `POST /v1/transactions` (endpoint ya existe)
- EmptyState bonito cuando no hay movimientos
- **Checkpoint**: crear gasto manual aparece en Supabase (curl GET), mueve balance,
  dispara aprendizaje de regla al corregir categoría; dedup/reglas intactos

### U5 — Presupuestos ⚙️ *cierra hueco CRUD*
- Tarjeta global destacada + lista por categoría (icono, barra, %, queda X)
- Botón "+ Presupuesto" → Sheet: elegir categoría (iconos) + monto → `POST /v1/budgets`;
  editar tocando tarjeta; eliminar con botón
- Umbrales visuales: <70% ok · 70-99% warn · ≥100% over
- **Checkpoint**: crear/editar/borrar persiste en Supabase; colores cambian al cruzar umbrales;
  Presupuesto global afecta tarjeta del Inicio

### U6 — Pulido premium + IA integrada (v1 local)
- Micro-interacciones LayoutAnimation: cambio de mes, fill de barras, FAB, confirmaciones
- **Sheet ✨ IA**: prompts sugeridos ("¿Cuánto llevo gastado?", "¿En qué gasto más?",
  "¿Voy pasado de presupuesto?") respondidos LOCALMENTE con datos reales de los endpoints
  existentes (sin LLM nuevo). Phase 9 Advisor reemplazará esto por LLM después.
- EmptyStates finales, revisión de contraste WCAG en numerales, limpieza de estilos muertos
- **Checkpoint final**: regresión completa (email→ingesta, notificación, dedup, regla post-AI,
  corrección→aprendizaje, balance/presupuestos) + build de release interno

### Protocolo transversal en cada fase
`vitest run` → `gradlew assembleDebug` → `adb install -r` → checklist en teléfono →
verificación contra Supabase con curl → recién entonces pasar a la siguiente fase.

---

## 7. Decisiones abiertas (resolver antes de U3)

1. **Gráfico circular de categorías**: ¿agregar `react-native-svg` (rebuild nativo) en U3b,
   o v1 solo barras y circular queda para v1.1?
2. **Fuente tipográfica**: system fonts (recomendado: cero riesgo, look nativo) vs
   Inter vía expo-google-fonts (más "marca propia").
3. **Probar (dev)**: ¿visible directo en la hoja ⚙ o tras un modo desarrollador en Config?
