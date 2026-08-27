/**
 * Setup Supabase para MisGastos — un solo comando:
 *   1. Aplica migraciones SQL en orden (tabla _migrations como control)
 *   2. Crea usuario demo en Supabase Auth (vía service_role)
 *   3. Imprime el DEFAULT_DEV_USER_ID para pegar en .env
 *
 * Requiere en backend/.env:
 *   DATABASE_URL  (Connection string -> pestaña Session pooler)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: npm run setup-supabase   (desde backend/)
 */
import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "supabase", "migrations");

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) fail("Falta DATABASE_URL en backend/.env (Project Settings → Database → Connection string → usa la de 'Session pooler').");
if (!SUPABASE_URL || !SERVICE_KEY) fail("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en backend/.env (Project Settings → API).");

// ---------- 1. Migraciones ----------
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`);
const { rows } = await client.query(`select name from _migrations`);
const applied = new Set(rows.map(r => r.name));

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
for (const f of files) {
  if (applied.has(f)) { console.log(`⏭️  ${f} (ya aplicada)`); continue; }
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
  try {
    // Transacción: si algo falla a mitad, no queda nada aplicado a medias
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`insert into _migrations(name) values ($1)`, [f]);
    await client.query("COMMIT");
    console.log(`✅ ${f} aplicada`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    fail(`Error aplicando ${f}: ${e.message}`);
  }
}
await client.end();

// ---------- 2. Usuario demo ----------
console.log("\n— Creando usuario demo —");
const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  body: JSON.stringify({ email: "demo@misgastos.cl", password: "Demo1234!", email_confirm: true })
});
const body = await res.json().catch(() => ({}));

let userId = null;
if (res.ok && body.id) {
  userId = body.id;
  console.log(`✅ Usuario demo creado`);
} else if (body?.msg?.includes("already") || body?.code === 422) {
  // ya existe: buscarlo por email
  const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=demo@misgastos.cl`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const lj = await list.json();
  const found = lj.users?.find(u => u.email === "demo@misgastos.cl");
  if (found) { userId = found.id; console.log(`ℹ️  Usuario demo ya existía`); }
}

if (!userId) fail(`No se pudo crear/encontrar el usuario demo: ${JSON.stringify(body).slice(0, 300)}`);

// ---------- 3. Resultado ----------
console.log(`
🎉 Setup completado.

Pega esto en backend/.env y reinicia el backend:

DEFAULT_DEV_USER_ID=${userId}

Verificación rápida:
  curl http://localhost:3000/v1/categories   → debe listar 14 categorías del sistema

Nota: al activar Supabase se pierden los datos de prueba del mock (.mockstore.json).
Las reglas/transacciones se crean de nuevo desde la app.
`);
