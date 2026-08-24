export const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
