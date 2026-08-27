// API base del backend (Fastify). La app se comunica vía fetch a este backend.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
