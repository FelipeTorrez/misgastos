import { describe, it, expect } from "vitest";
import { z } from "zod";

const Account = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(["checking","vista","savings","credit_card","cash","digital_wallet"]),
  include_in_balance: z.boolean().default(true),
});

describe("#1 Unit — accounts (ADR-001 sin investment)", () => {
  it("vista permitido", () => expect(Account.safeParse({ name: "Cuenta RUT", type: "vista" }).success).toBe(true));
  it("investment rechazado en MVP", () => expect(Account.safeParse({ name: "Fintual", type: "investment" }).success).toBe(false));
  it("digital_wallet permitido (Mach)", () => expect(Account.safeParse({ name: "Mach", type: "digital_wallet" }).success).toBe(true));
  it("nombre vacío falla", () => expect(Account.safeParse({ name: "", type: "cash" }).success).toBe(false));
  it("credit_card permitido", () => expect(Account.safeParse({ name: "Visa", type: "credit_card" }).success).toBe(true));
});
