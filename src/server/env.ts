// The shared vocabulary every route module imports: the bindings, the app type,
// and the few helpers that would otherwise be rewritten per file.

import { OpenAPIHono, z } from "@clawnify/app";

export interface Env {
  Bindings: {
    DB: D1Database;
    /**
     * Resolved by the platform from the org's own key, then the managed key
     * carrying its plan credits, so it is present without anyone visiting a
     * settings page. Only the `ai` mode spends it.
     */
    OPENROUTER_API_KEY?: string;
    /** Overrides the model the mascot answers with. */
    MASCOT_MODEL?: string;
    /** Minted per org by the platform. Present in production, absent locally. */
    CLAWNIFY_TOKEN?: string;
  };
}

export type App = OpenAPIHono<Env>;

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const OkSchema = z.object({ ok: z.boolean() }).openapi("Ok");

export function ok<T extends z.ZodTypeAny>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}

export function fail(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

export const PaginationQuery = z.object({
  page: z.string().optional().openapi({ description: "Page number (default: 1)" }),
  limit: z.string().optional().openapi({ description: "Items per page (default: 25, max: 100)" }),
  search: z.string().optional().openapi({ description: "Filter on what the visitor said" }),
});

export function paginate(q: { page?: string; limit?: string }): { limit: number; offset: number; page: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * The public identifier in the embed snippet. It is the only thing standing
 * between a stranger and an org's conversations, so it is drawn from the same
 * CSPRNG as a session token rather than slugified from a name.
 */
export function publicKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** JSON columns are stored as text; a bad parse must never take a page down. */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
