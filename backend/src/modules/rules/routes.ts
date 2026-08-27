import { FastifyInstance } from "fastify";
import { z } from "zod";
import { isMockMode } from "../../lib/supabase.js";
import { supabase, getUserId } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";

const CreateRule = z.object({
  merchant_normalized: z.string().min(1).max(100).transform(v => v.toLowerCase().trim()),
  preferred_category_id: z.string().uuid(),
  preferred_merchant_alias: z.string().max(100).optional(),
});

const UpdateRule = z.object({
  preferred_category_id: z.string().uuid().optional(),
  preferred_merchant_alias: z.string().max(100).optional(),
});

export async function ruleRoutes(app: FastifyInstance) {
  app.get("/v1/rules", async (req: any) => {
    const userId = getUserId(req);
    if (isMockMode) return mockStore.listRules(userId);
    const { data } = await supabase.from("rules").select("*").eq("user_id", userId).order("hits_count", { ascending: false }).order("created_at", { ascending: false });
    return data ?? [];
  });

  app.post("/v1/rules", async (req: any, reply) => {
    const userId = getUserId(req);
    const parsed = CreateRule.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    if (isMockMode) {
      const rule = mockStore.upsertRule(userId, parsed.data);
      return reply.status(201).send({ ...rule, mocked: true });
    }
    const { data, error } = await supabase.from("rules").upsert(
      { user_id: userId, ...parsed.data },
      { onConflict: "user_id,merchant_normalized" }
    ).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch("/v1/rules/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const parsed = UpdateRule.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    if (isMockMode) {
      const rule = mockStore.updateRule(userId, req.params.id, parsed.data);
      if (!rule) return reply.status(404).send({ error: "rule not found" });
      return { ...rule, mocked: true };
    }
    const { data, error } = await supabase.from("rules").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", userId).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  app.delete("/v1/rules/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    if (isMockMode) {
      mockStore.deleteRule(userId, req.params.id);
      return { ok: true };
    }
    const { error } = await supabase.from("rules").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
