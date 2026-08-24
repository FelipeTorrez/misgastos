import { FastifyInstance } from "fastify";
import { supabase, getUserId } from "../../lib/supabase.js";

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/v1/categories", async (req) => {
    const userId = getUserId(req);
    const { data } = await supabase
      .from("categories")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("name");
    return data ?? [];
  });
}
