# UX Spec (§26-28)

## Navegación (§26)
Inicio | Movimientos | Presupuesto | Insights (placeholder) | Configuración

## Dashboard (§27)
- Balance (grande), Ingresos/Gastos, Presupuesto restante (barra), Gasto diario (sparkline), Últimos movimientos, Alertas/Insights
- Estilo: moderno, minimalista, premium, dark mode, jerarquía visual, microinteracciones, pocas acciones por pantalla
- Gráficos: recharts / victory-native, simples

## Movimientos
- Lista con filtros (fecha, categoría, cuenta, estado)
- Swipe: editar / ignorar
- Badge confianza y estado (pending_review naranja, confirmed verde, duplicate gris)

## Bandeja Revisión IA (§28)
- Card: monto, comercio, categoría, confianza%, [Confirmar] [Editar]
- Objetivo: 5-10 revisiones en segundos
- Editar -> actualiza Rule automáticamente (toast: "Recordaremos Spotify -> Suscripciones")

## Estados transacción (§29)
pending_ai -> pending_review -> confirmed | corrected | ignored | duplicate

## Agregar movimiento
- FAB + -> Tipo (gasto/ingreso/transferencia) -> monto -> comerciante -> categoría -> cuenta -> fecha

## Onboarding
- Crear cuenta inicial, categorías seed, permiso notificaciones (Android), conectar Gmail (opcional, skip)

## Accesibilidad
- Formato CLP: $32.990, sin decimales, locale es-CL
- Fecha: DD/MM/YYYY
