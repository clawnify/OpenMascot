// What the mascot is allowed to know. Everything it says is grounded in these
// rows, so this screen is the one that decides whether it is useful or
// embarrassing.

import { createRoute, orgId, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, OkSchema, paginate, PaginationQuery, uid, type App } from "../env.js";
import { fetchPage, MAX_SOURCE_CHARS } from "../extract.js";

const SourceSchema = z
  .object({
    id: z.string(),
    mascot_id: z.string(),
    kind: z.enum(["text", "url"]),
    title: z.string(),
    url: z.string().nullable(),
    content: z.string(),
    updated_at: z.string(),
  })
  .openapi("Source");

export function registerSources(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/mascots/{id}/sources",
    tags: ["Knowledge"],
    summary: "What one assistant knows",
    request: { params: z.object({ id: z.string() }), query: PaginationQuery },
    responses: {
      200: ok("A page of sources", z.object({ sources: z.array(SourceSchema), total: z.number(), page: z.number() })),
      403: fail("No organisation"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const { limit, offset, page } = paginate(c.req.valid("query"));
    const id = c.req.valid("param").id;
    const sources = await query(
      `SELECT id, mascot_id, kind, title, url, content, updated_at
         FROM sources WHERE mascot_id = ? AND org_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      [id, org, limit, offset],
    );
    const total = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM sources WHERE mascot_id = ? AND org_id = ?`, [id, org]);
    return c.json({ sources, total: Number(total?.n ?? 0), page } as never);
  });

  const add = createRoute({
    method: "post",
    path: "/api/mascots/{id}/sources",
    tags: ["Knowledge"],
    summary: "Teach an assistant something",
    description:
      "kind=text stores what you send. kind=url fetches that page once and stores its words; it is a snapshot, so re-post the same url to refresh it after the page changes.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              kind: z.enum(["text", "url"]).default("text"),
              title: z.string().max(160).default(""),
              url: z.string().max(500).optional(),
              content: z.string().max(MAX_SOURCE_CHARS).default(""),
            }),
          },
        },
      },
    },
    responses: { 200: ok("The source", SourceSchema), 400: fail("Could not read it"), 403: fail("No organisation") },
  });

  app.openapi(add, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const mascotId = c.req.valid("param").id;
    const owns = await get<{ id: string }>(`SELECT id FROM mascots WHERE id = ? AND org_id = ?`, [mascotId, org]);
    if (!owns) return c.json({ error: "No such mascot" }, 403);

    const b = c.req.valid("json");
    let title = b.title;
    let content = b.content;

    if (b.kind === "url") {
      if (!b.url) return c.json({ error: "Give me the address of the page to read." }, 400);
      try {
        const page = await fetchPage(b.url);
        title = title || page.title;
        content = page.text;
      } catch (err) {
        // The owner typed this address; the reason it failed is the only useful
        // thing we can tell them, so it is passed through rather than flattened.
        return c.json({ error: err instanceof Error ? err.message : "Could not read that page." }, 400);
      }
    }

    if (!content.trim()) return c.json({ error: "There is nothing to learn here." }, 400);

    const id = uid();
    const at = now();
    await run(
      `INSERT INTO sources (id, org_id, mascot_id, kind, title, url, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, org, mascotId, b.kind, title || "Untitled", b.url ?? null, content, at, at],
    );
    const row = await get(`SELECT id, mascot_id, kind, title, url, content, updated_at FROM sources WHERE id = ?`, [id]);
    return c.json(row as never);
  });

  const edit = createRoute({
    method: "put",
    path: "/api/sources/{id}",
    tags: ["Knowledge"],
    summary: "Correct something an assistant knows",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ title: z.string().max(160), content: z.string().max(MAX_SOURCE_CHARS) }),
          },
        },
      },
    },
    responses: { 200: ok("Saved", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(edit, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const b = c.req.valid("json");
    await run(`UPDATE sources SET title = ?, content = ?, updated_at = ? WHERE id = ? AND org_id = ?`, [
      b.title, b.content, now(), c.req.valid("param").id, org,
    ]);
    return c.json({ ok: true } as never);
  });

  const remove = createRoute({
    method: "delete",
    path: "/api/sources/{id}",
    tags: ["Knowledge"],
    summary: "Make an assistant forget something",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok("Deleted", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(remove, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    await run(`DELETE FROM sources WHERE id = ? AND org_id = ?`, [c.req.valid("param").id, org]);
    return c.json({ ok: true } as never);
  });
}
