/**
 * Normalización única de merchant para reglas.
 *
 * La regla se escribe (POST /v1/rules, PATCH /v1/transactions con
 * update_rule) y se lee (`findRule` en ingesta y POST /v1/transactions)
 * con esta misma función, para que "MERPAGO LABALIZA    Las Condes  CHL"
 * matchee la regla "merpago labaliza".
 */

/** Sufijos geográficos (país / comuna / ciudad) que se recortan del final. */
const TRAILING_GEO_SUFFIXES = [
  // país
  "chl",
  "cl",
  "chile",
  // RM — comunas
  "las condes",
  "providencia",
  "vitacura",
  "lo barnechea",
  "la dehesa",
  "nunoa",
  "ñuñoa",
  "macul",
  "la florida",
  "puente alto",
  "maipu",
  "maipú",
  "san miguel",
  "san joaquin",
  "san joaquín",
  "la cisterna",
  "el bosque",
  "penalolen",
  "peñalolén",
  "la reina",
  "lo espejo",
  "quilicura",
  "huechuraba",
  "recoleta",
  "independencia",
  "conchali",
  "conchalí",
  "renca",
  "pudahuel",
  "cerrillos",
  "estacion central",
  "estación central",
  "santiago centro",
  "santiago",
  "region metropolitana",
  "región metropolitana",
  // otras ciudades CL
  "concepcion",
  "concepción",
  "valparaiso",
  "valparaíso",
  "vina del mar",
  "viña del mar",
  "antofagasta",
  "iquique",
  "la serena",
  "coquimbo",
  "rancagua",
  "talca",
  "temuco",
  "valdivia",
  "osorno",
  "puerto montt",
  "arica",
  "calama",
  "copiapo",
  "copiapó",
];

// Más largos primero: "santiago centro" antes que "santiago".
const SORTED_SUFFIXES = [...TRAILING_GEO_SUFFIXES].sort((a, b) => b.length - a.length);

/** lowercase + colapsar espacios + sin puntuación + sin sufijo ciudad/país. */
export function normalizeMerchant(input: string | null | undefined): string {
  if (input == null) return "";
  let s = String(input).toLowerCase().trim();
  if (!s) return "";
  // Puntuación → espacio (conserva letras, dígitos y espacios).
  s = s.replace(/[.,;:!?"'()[\]{}*\-–—_/\\|@#$%^&+=~`<>]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Recorta sufijos geográficos del final, en cadena ("las condes chl").
  let stripped = true;
  while (stripped && s) {
    stripped = false;
    for (const suf of SORTED_SUFFIXES) {
      if (s === suf) {
        s = "";
        stripped = true;
        break;
      }
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, s.length - suf.length - 1).trimEnd();
        stripped = true;
        break;
      }
    }
  }
  return s;
}

type RuleLike = { merchant_normalized: string };

/**
 * Procesadores de pago: el texto del banco trae al procesador, no al
 * comercio real, así que ninguna IA puede acertar la categoría. La ingesta
 * manda estos casos a cola de revisión en vez de aceptar la categoría
 * inventada (metadata.review_reason = 'payment_processor').
 */
export const PAYMENT_PROCESSORS = [
  "merpago",
  "payu",
  "redgloba",
  "mach",
  "webpay",
  "transbank",
  "khipu",
  "flow",
];

/**
 * true si el merchant (crudo o ya normalizado) es un procesador de pagos.
 * Match por token exacto; prefijo solo para nombres largos (>4), para no
 * confundir "mach"/"flow"/"payu" con palabras que los contienen.
 */
export function isPaymentProcessor(merchantRaw: string | null | undefined): boolean {
  const norm = normalizeMerchant(merchantRaw);
  if (!norm) return false;
  const words = norm.split(" ");
  return PAYMENT_PROCESSORS.some((p) =>
    words.some((w) => w === p || (p.length > 4 && w.startsWith(p))),
  );
}

/**
 * Segundo intento de match cuando no hay igualdad exacta: el merchant
 * empieza con o contiene la regla. Solo reglas de >=6 caracteres y se
 * devuelve el match más largo (evita falsos positivos de 3 letras).
 */
export function findBestRuleMatch<T extends RuleLike>(
  merchantRaw: string | null | undefined,
  rules: T[],
): T | null {
  const norm = normalizeMerchant(merchantRaw);
  if (!norm) return null;
  let best: T | null = null;
  let bestLen = 0;
  for (const r of rules) {
    const rn = normalizeMerchant(r.merchant_normalized);
    if (!rn || rn.length < 6) continue;
    if (norm === rn || norm.startsWith(rn) || norm.includes(rn)) {
      if (rn.length > bestLen) {
        best = r;
        bestLen = rn.length;
      }
    }
  }
  return best;
}
