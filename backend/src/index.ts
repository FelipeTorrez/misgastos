import Fastify from "fastify";
import cors from "@fastify/cors";
import { categoryRoutes } from "./modules/categories/routes.js";
import { accountRoutes } from "./modules/accounts/routes.js";
import { transactionRoutes } from "./modules/transactions/routes.js";
import { budgetRoutes } from "./modules/budgets/routes.js";
import { balanceRoutes } from "./modules/balance/routes.js";
import { ingestionRoutes } from "./modules/ingestion/routes.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", version: "0.2.0-phase3", phase: "Email Ingestion + Parser" }));

await app.register(categoryRoutes);
await app.register(accountRoutes);
await app.register(transactionRoutes);
await app.register(budgetRoutes);
await app.register(balanceRoutes);
await app.register(ingestionRoutes);

// 404
app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: "not found" }));

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).then(() => console.log(`MisGastos backend Phase 3 on ${port}`));
}
export default app;
