// One row per assistant: who it is, where it may be embedded, and how it
// behaves. An install can run several, which is what lets an agency put a
// different character on each client's site out of one deployment.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, OkSchema, paginate, PaginationQuery, publicKey, uid, type App } from "../env.js";

const MascotSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    avatar_url: z.string().nullable(),
    accent: z.string(),
    greeting: z.string(),
    tagline: z.string(),
    mode: z.enum(["ai", "human"]),
    suggested: z.array(z.string()),
    booking_url: z.string().nullable(),
    handoff_message: z.string(),
    allowed_origins: z.array(z.string()),
    ai_instructions: z.string(),
    daily_reply_cap: z.number(),
    locale: z.string(),
    created_at: z.string(),
  })
  .openapi("Mascot");

const WriteSchema = z.object({
  name: z.string().min(1).max(60),
  tagline: z.string().max(120).default(""),
  greeting: z.string().max(400).default(""),
  accent: z.string().max(32).default("#4f46e5"),
  avatar_url: z.string().max(500).nullish(),
  mode: z.enum(["ai", "human"]).default("ai"),
  suggested: z.array(z.string().max(120)).max(6).default([]),
  booking_url: z.string().max(500).nullish(),
  handoff_message: z.string().max(400).default(""),
  allowed_origins: z.array(z.string().max(253)).max(20).default([]),
  ai_instructions: z.string().max(4000).default(""),
  daily_reply_cap: z.number().int().min(0).max(100000).default(200),
  locale: z.string().max(12).default("en"),
});

interface Row {
  id: string;
  key: string;
  name: string;
  avatar_url: string | null;
  accent: string;
  greeting: string;
  tagline: string;
  mode: string;
  suggested: string;
  booking_url: string | null;
  handoff_message: string;
  allowed_origins: string;
  ai_instructions: string;
  daily_reply_cap: number;
  locale: string;
  created_at: string;
}

const COLUMNS = `id, key, name, avatar_url, accent, greeting, tagline, mode, suggested, booking_url,
       handoff_message, allowed_origins, ai_instructions, daily_reply_cap, locale, created_at`;

function shape(r: Row) {
  const list = (raw: string): string[] => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  return { ...r, suggested: list(r.suggested), allowed_origins: list(r.allowed_origins) };
}

export function registerMascots(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/mascots",
    tags: ["Mascots"],
    summary: "The assistants this install runs",
    request: { query: PaginationQuery },
    responses: {
      200: ok("A page of mascots", z.object({ mascots: z.array(MascotSchema), total: z.number(), page: z.number() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { limit, offset, page } = paginate(c.req.valid("query"));
    const search = `%${(c.req.valid("query").search ?? "").trim()}%`;
    const rows = await query<Row>(
      `SELECT ${COLUMNS} FROM mascots WHERE org_id = ? AND name LIKE ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      [org, search, limit, offset],
    );
    const total = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM mascots WHERE org_id = ? AND name LIKE ?`, [org, search]);
    return c.json({ mascots: rows.map(shape), total: Number(total?.n ?? 0), page } as never);
  });

  const create = createRoute({
    method: "post",
    path: "/api/mascots",
    tags: ["Mascots"],
    summary: "Create an assistant",
    description:
      "Returns the row including `key`, which is what the embed snippet carries. Give it at least one entry in allowed_origins or the widget will refuse to answer anywhere.",
    request: { body: { content: { "application/json": { schema: WriteSchema } } } },
    responses: { 200: ok("The new mascot", MascotSchema), 403: fail("No organisation") },
  });

  app.openapi(create, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    const id = uid();
    const at = now();
    await run(
      `INSERT INTO mascots (id, org_id, key, name, avatar_url, accent, greeting, tagline, mode, suggested,
                            booking_url, handoff_message, allowed_origins, ai_instructions, daily_reply_cap,
                            locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, org, publicKey(), b.name, b.avatar_url ?? null, b.accent, b.greeting, b.tagline, b.mode,
        JSON.stringify(b.suggested), b.booking_url ?? null, b.handoff_message,
        JSON.stringify(b.allowed_origins), b.ai_instructions, b.daily_reply_cap, b.locale, at, at,
      ],
    );
    const row = await get<Row>(`SELECT ${COLUMNS} FROM mascots WHERE id = ?`, [id]);
    return c.json(shape(row as Row) as never);
  });

  const read = createRoute({
    method: "get",
    path: "/api/mascots/{id}",
    tags: ["Mascots"],
    summary: "One assistant",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("The mascot", MascotSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(read, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const row = await get<Row>(`SELECT ${COLUMNS} FROM mascots WHERE id = ? AND org_id = ?`, [c.req.valid("param").id, org]);
    if (!row) return c.json({ error: "No such mascot" }, 404);
    return c.json(shape(row) as never);
  });

  const update = createRoute({
    method: "put",
    path: "/api/mascots/{id}",
    tags: ["Mascots"],
    summary: "Change an assistant",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: WriteSchema } } } },
    responses: { 200: ok("The mascot", MascotSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(update, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const id = c.req.valid("param").id;
    const b = c.req.valid("json");
    // The key is deliberately not writable: rotating it silently breaks every
    // snippet already pasted into the customer's site.
    const changed = await run(
      `UPDATE mascots SET name = ?, avatar_url = ?, accent = ?, greeting = ?, tagline = ?, mode = ?,
              suggested = ?, booking_url = ?, handoff_message = ?, allowed_origins = ?, ai_instructions = ?,
              daily_reply_cap = ?, locale = ?, updated_at = ?
        WHERE id = ? AND org_id = ?`,
      [
        b.name, b.avatar_url ?? null, b.accent, b.greeting, b.tagline, b.mode, JSON.stringify(b.suggested),
        b.booking_url ?? null, b.handoff_message, JSON.stringify(b.allowed_origins), b.ai_instructions,
        b.daily_reply_cap, b.locale, now(), id, org,
      ],
    );
    void changed;
    const row = await get<Row>(`SELECT ${COLUMNS} FROM mascots WHERE id = ? AND org_id = ?`, [id, org]);
    if (!row) return c.json({ error: "No such mascot" }, 404);
    return c.json(shape(row) as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/mascots/{id}",
    tags: ["Mascots"],
    summary: "Delete an assistant and everything it collected",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const id = c.req.valid("param").id;
    // Ordered so a failure part-way through never leaves messages pointing at a
    // conversation that is gone: the rows the widget reads die last.
    await run(`DELETE FROM messages WHERE mascot_id = ? AND org_id = ?`, [id, org]);
    await run(`DELETE FROM conversations WHERE mascot_id = ? AND org_id = ?`, [id, org]);
    await run(`DELETE FROM sources WHERE mascot_id = ? AND org_id = ?`, [id, org]);
    await run(`DELETE FROM mascots WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ ok: true } as never);
  });
}
