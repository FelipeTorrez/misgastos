/**
 * Entorno determinista para la suite.
 *
 * La ingesta elige el proveedor de IA así:
 *   createAIProvider(process.env.GROQ_API_KEY ? "groq" : "mock")
 * Si el desarrollador tiene la key exportada en su shell (por ejemplo al correr
 * probes manuales con `set -a; . ./.env`), los tests empiezan a pegarle al LLM real:
 * dependen de la cuota del minuto, de la latencia y del criterio del modelo.
 * Eso produjo un rojo intermitente real en ingestion.guard.test.ts
 * ("promo cupo 750k → transaction null").
 *
 * Regla: la suite NUNCA llama a proveedores externos. Los tests que necesitan
 * ejercitar el camino HTTP mockean fetch y setean su propia key (ver
 * src/ai/providers/GroqProvider.test.ts).
 */
delete process.env.GROQ_API_KEY;
process.env.NODE_ENV ??= "test";
