/**
 * Dataset 100 transacciones — Phase 2
 * Distribución realista Chile Agosto 2026
 * Categorías: vivienda, alimentación, alimentacion, transporte, salud, educación, entretenimiento, restaurantes, compras, suscripciones, deudas, servicios, transferencias, otros
 * Objetivo: validar UX y reglas financieras sin IA
 */

export type FixtureTx = {
  merchant: string;
  amount: number;
  category_slug: string;
  type: "expense" | "income" | "transfer";
  date: string; // YYYY-MM-DD
  payment_method: "debit_card" | "credit_card" | "transfer" | "cash";
  account_type: "checking" | "vista" | "credit_card" | "cash" | "digital_wallet";
};

// 100 filas determinísticas (seed fijo, no random) para tests estables
export const dataset100: FixtureTx[] = [
  // Ingresos (4)
  { merchant: "Sueldo Principal", amount: 2500000, category_slug: "otros", type: "income", date: "2026-08-01", payment_method: "transfer", account_type: "checking" },
  { merchant: "Transferencia Recibida Familia", amount: 250000, category_slug: "otros", type: "income", date: "2026-08-06", payment_method: "transfer", account_type: "vista" },
  { merchant: "Devolución SII", amount: 120000, category_slug: "otros", type: "income", date: "2026-08-12", payment_method: "transfer", account_type: "checking" },
  { merchant: "Venta Marketplace", amount: 85000, category_slug: "otros", type: "income", date: "2026-08-18", payment_method: "transfer", account_type: "vista" },

  // Alimentación / Mercados (12)
  { merchant: "Lider", amount: 32990, category_slug: "alimentacion", type: "expense", date: "2026-08-02", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Jumbo", amount: 45200, category_slug: "alimentacion", type: "expense", date: "2026-08-03", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Santa Isabel", amount: 28750, category_slug: "alimentacion", type: "expense", date: "2026-08-04", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Lider", amount: 18990, category_slug: "alimentacion", type: "expense", date: "2026-08-09", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Unimarc", amount: 52300, category_slug: "alimentacion", type: "expense", date: "2026-08-10", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Jumbo", amount: 31200, category_slug: "alimentacion", type: "expense", date: "2026-08-15", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Lider", amount: 44500, category_slug: "alimentacion", type: "expense", date: "2026-08-16", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Tottus", amount: 27800, category_slug: "alimentacion", type: "expense", date: "2026-08-17", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Santa Isabel", amount: 19500, category_slug: "alimentacion", type: "expense", date: "2026-08-20", payment_method: "cash", account_type: "cash" },
  { merchant: "Lider", amount: 38900, category_slug: "alimentacion", type: "expense", date: "2026-08-22", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Jumbo", amount: 22100, category_slug: "alimentacion", type: "expense", date: "2026-08-25", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Unimarc", amount: 41200, category_slug: "alimentacion", type: "expense", date: "2026-08-28", payment_method: "debit_card", account_type: "vista" },

  // Transporte (10)
  { merchant: "Uber", amount: 8900, category_slug: "transporte", type: "expense", date: "2026-08-02", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Copec", amount: 35000, category_slug: "transporte", type: "expense", date: "2026-08-03", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Metro", amount: 800, category_slug: "transporte", type: "expense", date: "2026-08-04", payment_method: "cash", account_type: "cash" },
  { merchant: "Cabify", amount: 12300, category_slug: "transporte", type: "expense", date: "2026-08-07", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Copec", amount: 42000, category_slug: "transporte", type: "expense", date: "2026-08-11", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Uber", amount: 6500, category_slug: "transporte", type: "expense", date: "2026-08-13", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Metro", amount: 1600, category_slug: "transporte", type: "expense", date: "2026-08-14", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Shell", amount: 38000, category_slug: "transporte", type: "expense", date: "2026-08-19", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Uber", amount: 11200, category_slug: "transporte", type: "expense", date: "2026-08-21", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Copec", amount: 30000, category_slug: "transporte", type: "expense", date: "2026-08-26", payment_method: "debit_card", account_type: "checking" },

  // Restaurantes (10)
  { merchant: "Restaurante La Mesa", amount: 28000, category_slug: "restaurantes", type: "expense", date: "2026-08-03", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "PedidosYa", amount: 15990, category_slug: "restaurantes", type: "expense", date: "2026-08-05", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Starbucks", amount: 6500, category_slug: "restaurantes", type: "expense", date: "2026-08-06", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Rappi", amount: 18900, category_slug: "restaurantes", type: "expense", date: "2026-08-08", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Dominó", amount: 22500, category_slug: "restaurantes", type: "expense", date: "2026-08-10", payment_method: "debit_card", account_type: "checking" },
  { merchant: "PedidosYa", amount: 14200, category_slug: "restaurantes", type: "expense", date: "2026-08-12", payment_method: "debit_card", account_type: "vista" },
  { merchant: "La Piojera", amount: 35000, category_slug: "restaurantes", type: "expense", date: "2026-08-15", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Starbucks", amount: 7200, category_slug: "restaurantes", type: "expense", date: "2026-08-18", payment_method: "cash", account_type: "cash" },
  { merchant: "Rappi", amount: 16500, category_slug: "restaurantes", type: "expense", date: "2026-08-20", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Bar La Playa", amount: 42000, category_slug: "restaurantes", type: "expense", date: "2026-08-24", payment_method: "credit_card", account_type: "credit_card" },

  // Suscripciones (6) — recurrentes cada 30d
  { merchant: "Spotify", amount: 7490, category_slug: "suscripciones", type: "expense", date: "2026-08-05", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Netflix", amount: 11990, category_slug: "suscripciones", type: "expense", date: "2026-08-05", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "ChatGPT Plus", amount: 18000, category_slug: "suscripciones", type: "expense", date: "2026-08-06", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "YouTube Premium", amount: 6500, category_slug: "suscripciones", type: "expense", date: "2026-08-07", payment_method: "debit_card", account_type: "checking" },
  { merchant: "iCloud", amount: 1500, category_slug: "suscripciones", type: "expense", date: "2026-08-08", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Disney+", amount: 9500, category_slug: "suscripciones", type: "expense", date: "2026-08-09", payment_method: "credit_card", account_type: "credit_card" },

  // Servicios (8)
  { merchant: "Enel", amount: 45000, category_slug: "servicios", type: "expense", date: "2026-08-10", payment_method: "transfer", account_type: "checking" },
  { merchant: "Aguas Andinas", amount: 28000, category_slug: "servicios", type: "expense", date: "2026-08-10", payment_method: "transfer", account_type: "checking" },
  { merchant: "Movistar", amount: 25000, category_slug: "servicios", type: "expense", date: "2026-08-11", payment_method: "debit_card", account_type: "vista" },
  { merchant: "VTR", amount: 35000, category_slug: "servicios", type: "expense", date: "2026-08-12", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Gasco", amount: 22000, category_slug: "servicios", type: "expense", date: "2026-08-15", payment_method: "transfer", account_type: "checking" },
  { merchant: "Enel", amount: 12000, category_slug: "servicios", type: "expense", date: "2026-08-15", payment_method: "transfer", account_type: "vista" },
  { merchant: "WOM", amount: 12990, category_slug: "servicios", type: "expense", date: "2026-08-18", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Entel", amount: 18000, category_slug: "servicios", type: "expense", date: "2026-08-20", payment_method: "debit_card", account_type: "vista" },

  // Salud (5)
  { merchant: "Farmacia Cruz Verde", amount: 18990, category_slug: "salud", type: "expense", date: "2026-08-04", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Clínica Las Condes", amount: 75000, category_slug: "salud", type: "expense", date: "2026-08-09", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Farmacia Ahumada", amount: 12300, category_slug: "salud", type: "expense", date: "2026-08-14", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Salcobrand", amount: 8900, category_slug: "salud", type: "expense", date: "2026-08-19", payment_method: "cash", account_type: "cash" },
  { merchant: "Integramédica", amount: 35000, category_slug: "salud", type: "expense", date: "2026-08-23", payment_method: "debit_card", account_type: "checking" },

  // Vivienda (4)
  { merchant: "Arriendo", amount: 650000, category_slug: "vivienda", type: "expense", date: "2026-08-05", payment_method: "transfer", account_type: "checking" },
  { merchant: "Gastos Comunes", amount: 120000, category_slug: "vivienda", type: "expense", date: "2026-08-07", payment_method: "transfer", account_type: "checking" },
  { merchant: "Easy", amount: 45000, category_slug: "vivienda", type: "expense", date: "2026-08-12", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Sodimac", amount: 78000, category_slug: "vivienda", type: "expense", date: "2026-08-19", payment_method: "debit_card", account_type: "vista" },

  // Compras (6)
  { merchant: "Falabella", amount: 120000, category_slug: "compras", type: "expense", date: "2026-08-06", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Mercado Libre", amount: 35000, category_slug: "compras", type: "expense", date: "2026-08-11", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Paris", amount: 89000, category_slug: "compras", type: "expense", date: "2026-08-14", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "AliExpress", amount: 25000, category_slug: "compras", type: "expense", date: "2026-08-16", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Falabella", amount: 55000, category_slug: "compras", type: "expense", date: "2026-08-21", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Mercado Libre", amount: 18000, category_slug: "compras", type: "expense", date: "2026-08-26", payment_method: "debit_card", account_type: "checking" },

  // Entretenimiento (5)
  { merchant: "Cine Hoyts", amount: 18000, category_slug: "entretenimiento", type: "expense", date: "2026-08-08", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Parque Arauco", amount: 35000, category_slug: "entretenimiento", type: "expense", date: "2026-08-13", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Steam", amount: 25000, category_slug: "entretenimiento", type: "expense", date: "2026-08-16", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Cine Hoyts", amount: 22000, category_slug: "entretenimiento", type: "expense", date: "2026-08-22", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Evento Lollapalooza", amount: 85000, category_slug: "entretenimiento", type: "expense", date: "2026-08-24", payment_method: "credit_card", account_type: "credit_card" },

  // Educación (3)
  { merchant: "Duoc UC", amount: 350000, category_slug: "educación", type: "expense", date: "2026-08-05", payment_method: "transfer", account_type: "checking" },
  { merchant: "Udemy", amount: 15000, category_slug: "educación", type: "expense", date: "2026-08-14", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Librería Antártica", amount: 25000, category_slug: "educación", type: "expense", date: "2026-08-20", payment_method: "debit_card", account_type: "checking" },

  // Deudas — solo categoría crédito (3)
  { merchant: "Crédito Consumo BCI", amount: 180000, category_slug: "deudas", type: "expense", date: "2026-08-10", payment_method: "transfer", account_type: "checking" },
  { merchant: "Cuota Crédito Hipotecario", amount: 450000, category_slug: "deudas", type: "expense", date: "2026-08-15", payment_method: "transfer", account_type: "checking" },
  { merchant: "Préstamo Personal", amount: 95000, category_slug: "deudas", type: "expense", date: "2026-08-20", payment_method: "transfer", account_type: "vista" },

  // Transferencias internas — NO afectan balance global (ADR-002) (2)
  { merchant: "Traspaso Vista -> Efectivo", amount: 50000, category_slug: "transferencias", type: "transfer", date: "2026-08-08", payment_method: "transfer", account_type: "vista" },
  { merchant: "Traspaso Checking -> Vista", amount: 100000, category_slug: "transferencias", type: "transfer", date: "2026-08-18", payment_method: "transfer", account_type: "checking" },

  // Otros / Alimentación (3)
  { merchant: "Feria Local", amount: 15000, category_slug: "alimentación", type: "expense", date: "2026-08-06", payment_method: "cash", account_type: "cash" },
  { merchant: "Ok Market", amount: 8900, category_slug: "alimentación", type: "expense", date: "2026-08-11", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Panadería", amount: 6500, category_slug: "alimentación", type: "expense", date: "2026-08-13", payment_method: "cash", account_type: "cash" },

  // Extra 19 para llegar a 100 (Phase 2 completado)
  { merchant: "Lider", amount: 25990, category_slug: "alimentacion", type: "expense", date: "2026-08-26", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Jumbo", amount: 33400, category_slug: "alimentacion", type: "expense", date: "2026-08-27", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Uber", amount: 7800, category_slug: "transporte", type: "expense", date: "2026-08-27", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Copec", amount: 28000, category_slug: "transporte", type: "expense", date: "2026-08-28", payment_method: "debit_card", account_type: "vista" },
  { merchant: "PedidosYa", amount: 13400, category_slug: "restaurantes", type: "expense", date: "2026-08-25", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Starbucks", amount: 5900, category_slug: "restaurantes", type: "expense", date: "2026-08-27", payment_method: "cash", account_type: "cash" },
  { merchant: "Enel", amount: 35000, category_slug: "servicios", type: "expense", date: "2026-08-25", payment_method: "transfer", account_type: "checking" },
  { merchant: "WOM", amount: 15990, category_slug: "servicios", type: "expense", date: "2026-08-26", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Farmacia Salcobrand", amount: 15600, category_slug: "salud", type: "expense", date: "2026-08-25", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Integramédica", amount: 28000, category_slug: "salud", type: "expense", date: "2026-08-27", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Mercado Libre", amount: 42000, category_slug: "compras", type: "expense", date: "2026-08-27", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Paris", amount: 67000, category_slug: "compras", type: "expense", date: "2026-08-28", payment_method: "credit_card", account_type: "credit_card" },
  { merchant: "Steam", amount: 12000, category_slug: "entretenimiento", type: "expense", date: "2026-08-28", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Cine Hoyts", amount: 15000, category_slug: "entretenimiento", type: "expense", date: "2026-08-29", payment_method: "debit_card", account_type: "vista" },
  { merchant: "Feria Local", amount: 12000, category_slug: "alimentación", type: "expense", date: "2026-08-27", payment_method: "cash", account_type: "cash" },
  { merchant: "Ok Market", amount: 10500, category_slug: "alimentación", type: "expense", date: "2026-08-28", payment_method: "debit_card", account_type: "checking" },
  { merchant: "Bono Extra", amount: 95000, category_slug: "otros", type: "income", date: "2026-08-26", payment_method: "transfer", account_type: "vista" },
  { merchant: "Arriendo Bodega", amount: 85000, category_slug: "vivienda", type: "expense", date: "2026-08-28", payment_method: "transfer", account_type: "checking" },
  { merchant: "Sodimac Extra", amount: 34000, category_slug: "vivienda", type: "expense", date: "2026-08-29", payment_method: "debit_card", account_type: "credit_card" },
];

// Totales pre-calculados para validación tests
export const expectedTotals = (() => {
  let income = 0, expense = 0, transfer = 0;
  for (const t of dataset100) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
    else transfer += t.amount;
  }
  return { income, expense, transfer, balance: income - expense, count: dataset100.length };
})();
