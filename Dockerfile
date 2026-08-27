# MisGastos backend — Fastify (Node 20) para Railway
FROM node:20-alpine

WORKDIR /app

# Instalar deps (usa package-lock)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copiar código y compilar a dist/
COPY backend/ ./
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

# Sin .env en el contenedor: las credenciales van como variables de Railway.
CMD ["node", "dist/index.js"]
