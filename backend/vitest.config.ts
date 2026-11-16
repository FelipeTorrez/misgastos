import { defineConfig } from "vitest/config";

// La suite corre en la misma máquina donde a veces hay builds de Gradle/Metro
// consumiendo CPU; el default de 5s por test produce rojos falsos esporádicos
// (visto 1 vez en ~10 corridas) que bloquean merges del orquestador sin motivo.
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    // Sin paralelismo entre archivos que tocan el mockStore en disco.
    fileParallelism: false,
    // Quita GROQ_API_KEY del entorno: la suite nunca debe pegarle al LLM real.
    setupFiles: ["./tests/setup.env.ts"],
  },
});
