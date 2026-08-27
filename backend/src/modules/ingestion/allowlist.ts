export type AllowlistEntry = { pkg_prefix: string; label: string; kind: string; country: string; notes?: string };

// Duplicado de mobile/src/native/allowlist.json para validación server-side
// Mantener sincronizado. Si edición manual, actualizar ambos.
export const ALLOWLIST: AllowlistEntry[] = [
  { pkg_prefix: "cl.android", label: "Banco Falabella", kind: "bank", country: "CL" },
  { pkg_prefix: "com.falabella.falabellaApp", label: "Falabella Retail", kind: "bank", country: "CL" },
  { pkg_prefix: "com.mercadopago.wallet", label: "Mercado Pago", kind: "wallet", country: "CL" },
  { pkg_prefix: "cl.bancochile", label: "Banco de Chile", kind: "bank", country: "CL" },
  { pkg_prefix: "cl.bci", label: "BCI", kind: "bank", country: "CL" },
  { pkg_prefix: "cl.santander", label: "Santander", kind: "bank", country: "CL" },
  { pkg_prefix: "cl.bancoestado", label: "BancoEstado", kind: "bank", country: "CL" },
  { pkg_prefix: "cl.scotiabank", label: "Scotiabank", kind: "bank", country: "CL" },
  { pkg_prefix: "cl.itau", label: "Itaú", kind: "bank", country: "CL" },
  { pkg_prefix: "com.google.android.apps.walletnfcrel", label: "Google Wallet", kind: "wallet", country: "CL" },
  { pkg_prefix: "com.google.android.apps.nbu.paisa", label: "Google Wallet OEM", kind: "wallet", country: "CL" },
  { pkg_prefix: "com.google.android.gms", label: "Google Play Services (Wallet via GMS)", kind: "wallet", country: "CL", notes: "Billetera de Google a veces notifica desde gms" },
  { pkg_prefix: "com.mach", label: "Mach", kind: "fintech", country: "CL" },
  { pkg_prefix: "com.tenpo", label: "Tenpo", kind: "fintech", country: "CL" },
  { pkg_prefix: "cl.tenpo", label: "Tenpo CL", kind: "fintech", country: "CL" },
];

export function isAllowlisted(pkg: string | null | undefined): boolean {
  if (!pkg) return false;
  return ALLOWLIST.some(e => pkg.startsWith(e.pkg_prefix));
}
export function allowlistHit(pkg: string | null | undefined): boolean {
  return isAllowlisted(pkg);
}
