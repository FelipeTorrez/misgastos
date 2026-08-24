import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId } from "../../lib/supabase.js";

const CreateAccount = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(["checking","vista","savings","credit_card","cash","digital_wallet"]),
  currency: z.string().default("CLP"),
  include_in_balance: z.boolean().default(true),
  last4: z.string().optional(),
  credit_limit: z.number().int().optional(),
  color: z.string().optional(),
  icon: z.string().optional()
});

export async function accountRoutes(app: FastifyInstance) {
  app.get("/v1/accounts", async (req) => {
    const userId = getUserId(req);
    const { data } = await supabase.from("accounts").select("*").eq("user_id", userId).order("created_at");
    return data ?? [];
  });

  app.post("/v1/accounts", async (req, reply) => {
    const userId = getUserId(req);
    const parsed = CreateAccount.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { data, error } = await supabase.from("accounts").insert({ ...parsed.data, user_id: userId }).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch("/v1/accounts/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const { data, error } = await supabase.from("accounts").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  app.delete("/v1/accounts/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const { error } = await supabase.from("accounts").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
