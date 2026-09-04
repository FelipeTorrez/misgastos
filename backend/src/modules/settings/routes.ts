import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";

const UpdateSettings = z.object({
  billing_cycle_day: z.number().int().min(1).max(28).optional(),
  billing_cycle_enabled: z.boolean().nullable().optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/v1/settings", async (req: any) => {
    const userId = getUserId(req);
    if (isMockMode) return mockStore.getSettings(userId);
    const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).limit(1);
    const row = (data ?? [])[0];
    if (!row) return null;
    return { user_id: row.user_id, billing_cycle_day: row.billing_cycle_day, billing_cycle_enabled: row.billing_cycle_enabled };
  });

  app.put("/v1/settings", async (req: any, reply) => {
    const userId = getUserId(req);
    const parsed = UpdateSettings.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());

    if (isMockMode) return mockStore.upsertSettings(userId, parsed.data as any);

    const { data: existing } = await supabase.from("user_settings").select("id").eq("user_id", userId).limit(1);
    const row = (existing ?? [])[0];
    const payload: any = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };
    if (row) {
      const { data, error } = await supabase.from("user_settings").update(payload).eq("id", row.id).select().single();
      if (error) return reply.status(400).send({ error: error.message });
      return data;
    }
    const { data, error } = await supabase.from("user_settings")
      .insert({ user_id: userId, ...parsed.data })
      .select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });
}
