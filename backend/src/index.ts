import Fastify from "fastify";
const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", version: "0.1.0" }));
app.get("/v1/balance", async (req) => {
  // TODO Phase 1: query Supabase with RLS
  return { income: 0, expense: 0, balance: 0 };
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: "0.0.0.0" }).then(() => console.log(`Backend on ${port}`));
