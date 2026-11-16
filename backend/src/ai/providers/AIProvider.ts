import { z } from "zod";

export const AgentOutputSchema = z.object({
  is_transaction: z.boolean().default(true),
  transaction_type: z.enum(["expense","income","transfer","none"]),
  direction: z.enum(["in","out","internal","none"]).default("out"),
  amount: z.number().int().nonnegative(),
  currency: z.string().default("CLP"),
  merchant: z.string().default("Desconocido"),
  counterparty: z.string().nullable().default(null),
  category: z.string(),
  date: z.string().nullable().default(null), // YYYY-MM-DD
  account_hint: z.string().nullable().default(null),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]),
  installment: z.object({
    number: z.number().int(), total: z.number().int(), original_amount: z.number().int()
  }).nullable().default(null),
  is_recurring_candidate: z.boolean().default(false),
  is_transfer_candidate: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
  needs_review: z.boolean().default(true),
  reason: z.string().nullable().default(null),
  provider_fallback: z.string().optional()
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentInput = {
  normalized_text: string;
  parser_hints: { amount?: number; date?: string; merchant_guess?: string };
  categories: string[];
  user_rules: { merchant: string; preferred_category: string }[];
  locale: string;
};

export interface AIProvider {
  classify(input: AgentInput): Promise<AgentOutput>;
}

// Factory — desacoplado §32
import { GroqProvider } from "./GroqProvider.js";
export function createAIProvider(name: string): AIProvider {
  if (name === "groq") return new GroqProvider() as unknown as AIProvider;
  if (name === "mock") return new MockProvider();
  throw new Error(`Unknown provider ${name}`);
}

class MockProvider implements AIProvider {
  async classify(input: AgentInput): Promise<AgentOutput> {
    const groq = new GroqProvider() as any;
    return groq.mock(input, "mock_provider");
  }
}
