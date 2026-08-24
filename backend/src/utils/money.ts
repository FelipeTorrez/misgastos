export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
export function parseCLP(input: string): number {
  // "$32.990" -> 32990, "32.990,50" no usado en CLP pero soportado
  const cleaned = input.replace(/[^0-9]/g, "");
  return parseInt(cleaned, 10) || 0;
}
