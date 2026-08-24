import { z } from "zod";

export const AgentOutputSchema = z.object({
  transaction_type: z.enum(["expense","income","transfer"]),
  amount: z.number().int().positive(),
  currency: z.string().default("CLP"),
  merchant: z.string(),
  category: z.string(),
  date: z.string(), // YYYY-MM-DD
  account_hint: z.string().nullable(),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]),
  installment: z.object({
    number: z.number().int(), total: z.number().int(), original_amount: z.number().int()
  }).nullable(),
  is_recurring_candidate: z.boolean(),
  is_transfer_candidate: z.boolean(),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  reason: z.string().nullable()
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
