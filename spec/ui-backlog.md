# UI Backlog — ideas de diseño (priorizado)

> Captura de ideas del usuario para no perderlas. Se ejecutan DESPUÉS de las
> fases funcionales (9) o antes de Hardening. Nada de esto bloquea el backend.

## Estado actual de la UI
Pantallas funcionales dark-mode mínimas: Inicio (BalanceCard + evolución semanal
texto), Movimientos (lista + filtros + badges), Presupuesto (BudgetBar), Reglas,
Probar, Config. Creadas para validar flujo, no diseño final.

---

## P1 — Propuestas del usuario (esta sesión)

### 1. Inicio: balance real de "cuánto hay"
- **Idea**: que la pantalla principal muestre el dinero disponible:
  ingresos (ej: salario) menos lo gastado = balance actual.
- **Estado backend**: ya existe (`GET /v1/balance` → income/expense/balance).
- **Trabajo UI**: jerarquía visual grande para el balance, subtítulo con ingresos y
  gastos del mes, quizás comparación vs mes anterior.
- **Esfuerzo**: bajo (solo presentación).

### 2. Gráfico de categorías de gastos
- **Idea**: gráfico por categoría mostrando cuánto lleva cada una;
  **elegible entre barras o circular** (toggle por el usuario).
- **Estado backend**: `GET /v1/balance?month=` da totales globales; hace falta
  endpoint nuevo o extender balance con `by_category` (fácil: agrupar en la ruta).
- **Trabajo UI**: librería de charts RN (`react-native-svg` + `victory-native` o
  `react-native-chart-kit`) + toggle barra/pie persistido.
- **Dependencia**: nueva dependencia nativa → rebuild APK.
- **Esfuerzo**: medio.

### 3. Presupuesto mensual visual con % e iconos
- **Idea**: fijado un presupuesto mensual, ver cuánto llevas en % con iconos
  por categoría (supermercado 🛒, transporte 🚗, etc. o icon pack).
- **Estado backend**: `GET /v1/budgets` ya devuelve spent/remaining/pct por categoría.
  Falta UI de creación/edición de presupuesto en la app (hoy solo API).
- **Trabajo UI**: tarjetas con icono + barra de progreso + %; botón "+ Presupuesto";
  selector de categoría y monto; iconos por slug de categoría.
- **Esfuerzo**: medio-bajo.

## P2 — Pulido general sugerido (a confirmar con usuario)
- Sistema de diseño: paleta/tipografía centralizada (hoy estilos duplicados por pantalla).
- Navegación: pasar de tabs simples a stack+navegación real (`@react-navigation/native`).
- Estados vacíos ilustrados y skeletons de carga.
- Gráfico de evolución semanal real (hoy es texto plano).
- Onboarding primera vez (crear presupuesto global inicial).
- Icono de app y splash personalizados.

## P3 — Ideas futuras (sin definir)
- Widgets Android con balance.
- Modo claro.
- Exportar reportes mensuales PDF.

---

## Decisión pendiente
- [ ] Confirmar librería de charts (recomendado `react-native-svg` + `victory-native`).
- [ ] Definir si P1 se hace junta en una sola pasada de UI post-Phase 9.
