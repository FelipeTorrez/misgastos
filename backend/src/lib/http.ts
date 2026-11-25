import type { FastifyReply } from "fastify";

// 22P02 = invalid_text_representation en Postgres (p. ej. uuid malformado que
// llegó hasta la DB). Es culpa del cliente, no una caída: 400, no 503.
export function replyDbError(reply: FastifyReply, error: any) {
  if (error?.code === "22P02") {
    return reply.status(400).send({ error: "id invalido" });
  }
  return reply.status(503).send({ error: error?.message, code: "db_unavailable" });
}
