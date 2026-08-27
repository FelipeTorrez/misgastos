import { API_URL } from "./supabase";

export type Category = { id: string; label: string; slug: string; type?: string };

export const FALLBACK_CATEGORIES: Category[] = [
  { id: "00000000-0000-0000-0000-000000000001", label: "Supermercado", slug: "supermercado", type: "expense" },
  { id: "00000000-0000-0000-0000-000000000002", label: "Transporte", slug: "transporte", type: "expense" },
  { id: "00000000-0000-0000-0000-000000000003", label: "Suscripciones", slug: "suscripciones", type: "subscription" },
  { id: "00000000-0000-0000-0000-000000000004", label: "Restaurantes", slug: "restaurantes", type: "expense" },
  { id: "00000000-0000-0000-0000-000000000005", label: "Servicios", slug: "servicios", type: "expense" },
  { id: "00000000-0000-0000-0000-000000000006", label: "Otros", slug: "otros", type: "expense" },
];

export async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/v1/categories`);
    if (!res.ok) return FALLBACK_CATEGORIES;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return FALLBACK_CATEGORIES;
    return data.map((c: any) => ({ id: c.id, label: c.name ?? c.slug ?? c.id, slug: c.slug ?? "", type: c.type }));
  } catch {
    return FALLBACK_CATEGORIES;
  }
}
