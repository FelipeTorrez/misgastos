import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { categoryRoutes } from "./modules/categories/routes.js";
import { accountRoutes } from "./modules/accounts/routes.js";
import { transactionRoutes } from "./modules/transactions/routes.js";
import { budgetRoutes } from "./modules/budgets/routes.js";
import { balanceRoutes } from "./modules/balance/routes.js";
import { ingestionRoutes } from "./modules/ingestion/routes.js";
import { ruleRoutes } from "./modules/rules/routes.js";
import { settingsRoutes } from "./modules/settings/routes.js";
import { supabase, isMockMode } from "./lib/supabase.js";
import { checkSchema, type SchemaCheckResult } from "./lib/schemaCheck.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Verificación única al arrancar: /health no consulta la base por request.
// No aborta el boot (los devs sin Supabase tienen que poder levantar la app).
// En la suite no se corre: igual que el listen, un test no tiene que bootear.
let schemaStatus: SchemaCheckResult = { ok: true, missing: [] };
if (!isMockMode && process.env.NODE_ENV !== "test") {
  schemaStatus = await checkSchema(supabase, app.log);
  if (!schemaStatus.ok) {
    app.log.error(`schemaCheck: faltan columnas en la base → ${schemaStatus.missing.join(", ")}`);
  }
}

app.get("/health", async () => ({
  status: schemaStatus.ok ? "ok" : "degraded",
  version: "0.4.1-finan",
  phase: "Agente Financiero Finan (promo-hardening)",
  schema: schemaStatus,
}));

await app.register(categoryRoutes);
await app.register(accountRoutes);
await app.register(transactionRoutes);
await app.register(budgetRoutes);
await app.register(balanceRoutes);
await app.register(ingestionRoutes);
await app.register(ruleRoutes);
await app.register(settingsRoutes);

// 404
app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: "not found" }));

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).then(() => console.log(`MisGastos backend Phase 3 on ${port}`));
}
export default app;
