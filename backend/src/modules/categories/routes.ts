import { FastifyInstance } from "fastify";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";

// Categorías del sistema con UUIDs estables (coinciden con migración 001).
// El mobile usa estos mismos UUIDs como fallback offline.
export const SYSTEM_CATEGORIES = [
  { id: "00000000-0000-0000-0000-000000000001", slug: "supermercado", name: "Supermercado", user_id: null },
  { id: "00000000-0000-0000-0000-000000000002", slug: "transporte", name: "Transporte", user_id: null },
  { id: "00000000-0000-0000-0000-000000000003", slug: "suscripciones", name: "Suscripciones", user_id: null },
  { id: "00000000-0000-0000-0000-000000000004", slug: "restaurantes", name: "Restaurantes", user_id: null },
  { id: "00000000-0000-0000-0000-000000000005", slug: "servicios", name: "Servicios", user_id: null },
  { id: "00000000-0000-0000-0000-000000000006", slug: "otros", name: "Otros", user_id: null },
];

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/v1/categories", async (req) => {
    const userId = getUserId(req);
    if (isMockMode) return SYSTEM_CATEGORIES;
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order("name");
      if (error || !data?.length) return SYSTEM_CATEGORIES;
      return data;
    } catch {
      return SYSTEM_CATEGORIES;
    }
  });
}
