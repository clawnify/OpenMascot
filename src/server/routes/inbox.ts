// Where a person reads what the mascot has been saying, and takes over.
//
// The status column is the whole contract with the public half: once a
// conversation is `human`, nothing in this app lets the model answer in it
// again until somebody hands it back on purpose.

import { createRoute, orgId, user, z } from "@clawnify/app";
import { get, query, run } from "../db.js";
import { fail, now, ok, OkSchema, paginate, PaginationQuery, uid, type App } from "../env.js";

const ConversationSchema = z
  .object({
    id: z.string(),
    mascot_id: z.string(),
    mascot_name: z.string().nullable(),
    status: z.enum(["ai", "waiting_human", "human", "closed"]),
    unread: z.number(),
    page_url: z.string().nullable(),
    country: z.string().nullable(),
    visitor_name: z.string().nullable(),
    visitor_email: z.string().nullable(),
    last_message_at: z.string(),
    last_message_preview: z.string(),
    created_at: z.string(),
  })
  .openapi("Conversation");

const MessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["visitor", "assistant", "human"]),
    body: z.string(),
    author_name: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi("Message");

export function registerInbox(app: App) {
  const list = createRoute({
    method: "get",
    path: "/api/conversations",
    tags: ["Inbox"],
    summary: "Conversations, newest first",
    description: "Filter with mascot= and status=. status=waiting_human is the queue of people who asked for a person.",
    request: {
      query: PaginationQuery.extend({
        mascot: z.string().optional(),
        status: z.enum(["ai", "waiting_human", "human", "closed"]).optional(),
      }),
    },
    responses: {
      200: ok(
        "A page of conversations",
        z.object({ conversations: z.array(ConversationSchema), total: z.number(), page: z.number(), waiting: z.number() }),
      ),
      403: fail("No organisation"),
    },
  });

  app.openapi(list, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const q = c.req.valid("query");
    const { limit, offset, page } = paginate(q);

    const where = ["c.org_id = ?"];
    const args: unknown[] = [org];
    if (q.mascot) {
      where.push("c.mascot_id = ?");
      args.push(q.mascot);
    }
    if (q.status) {
      where.push("c.status = ?");
      args.push(q.status);
    }
    if (q.search?.trim()) {
      where.push("(c.last_message_preview LIKE ? OR c.visitor_email LIKE ? OR c.visitor_name LIKE ?)");
      const like = `%${q.search.trim()}%`;
      args.push(like, like, like);
    }
    const clause = where.join(" AND ");

    const conversations = await query(
      `SELECT c.id, c.mascot_id, m.name AS mascot_name, c.status, c.unread, c.page_url, c.country,
              c.visitor_name, c.visitor_email, c.last_message_at, c.last_message_preview, c.created_at
         FROM conversations c LEFT JOIN mascots m ON m.id = c.mascot_id
        WHERE ${clause}
        ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const total = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations c WHERE ${clause}`, args);
    const waiting = await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM conversations WHERE org_id = ? AND status = 'waiting_human'`,
      [org],
    );
    return c.json({
      conversations,
      total: Number(total?.n ?? 0),
      page,
      waiting: Number(waiting?.n ?? 0),
    } as never);
  });

  const thread = createRoute({
    method: "get",
    path: "/api/conversations/{id}",
    tags: ["Inbox"],
    summary: "One conversation and its messages",
    description: "Opening a conversation marks it read. Pass before=<ISO timestamp> to page further back.",
    request: { params: z.object({ id: z.string() }), query: z.object({ before: z.string().optional() }) },
    responses: {
      200: ok("The thread", z.object({ conversation: ConversationSchema, messages: z.array(MessageSchema) })),
      403: fail("No organisation"),
      404: fail("Not found"),
    },
  });

  app.openapi(thread, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const id = c.req.valid("param").id;
    const conversation = await get(
      `SELECT c.id, c.mascot_id, m.name AS mascot_name, c.status, c.unread, c.page_url, c.country,
              c.visitor_name, c.visitor_email, c.last_message_at, c.last_message_preview, c.created_at
         FROM conversations c LEFT JOIN mascots m ON m.id = c.mascot_id
        WHERE c.id = ? AND c.org_id = ?`,
      [id, org],
    );
    if (!conversation) return c.json({ error: "No such conversation" }, 404);

    const before = c.req.valid("query").before ?? "9999-12-31T23:59:59.999Z";
    const rows = await query<{ created_at: string }>(
      `SELECT id, role, body, author_name, created_at
         FROM messages WHERE conversation_id = ? AND created_at < ?
        ORDER BY created_at DESC LIMIT 50`,
      [id, before],
    );
    await run(`UPDATE conversations SET unread = 0 WHERE id = ? AND org_id = ?`, [id, org]);
    return c.json({ conversation, messages: rows.reverse() } as never);
  });

  const reply = createRoute({
    method: "post",
    path: "/api/conversations/{id}/reply",
    tags: ["Inbox"],
    summary: "Answer as yourself",
    description:
      "Writes a message the visitor sees on their next poll and takes the conversation over: from here the model stays out of it until someone hands it back.",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ body: z.string().min(1).max(4000) }) } } },
    },
    responses: { 200: ok("The message", MessageSchema), 403: fail("No organisation"), 404: fail("Not found") },
  });

  app.openapi(reply, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const id = c.req.valid("param").id;
    const convo = await get<{ id: string; mascot_id: string }>(
      `SELECT id, mascot_id FROM conversations WHERE id = ? AND org_id = ?`,
      [id, org],
    );
    if (!convo) return c.json({ error: "No such conversation" }, 404);

    const body = c.req.valid("json").body;
    const u = user(c);
    // `caller` can be an agent or a script, neither of which has a name. The
    // visitor still needs to see who is talking, so the mascot's own name is
    // the fallback rather than a blank byline.
    const mascot = await get<{ name: string }>(`SELECT name FROM mascots WHERE id = ?`, [convo.mascot_id]);
    const author = u?.firstName ?? u?.name ?? mascot?.name ?? "Us";

    const messageId = uid();
    const at = now();
    await run(
      `INSERT INTO messages (id, org_id, mascot_id, conversation_id, role, body, author_name, ip_hash, created_at)
       VALUES (?, ?, ?, ?, 'human', ?, ?, NULL, ?)`,
      [messageId, org, convo.mascot_id, id, body, author, at],
    );
    await run(
      `UPDATE conversations SET status = 'human', unread = 0, last_message_at = ?, last_message_preview = ? WHERE id = ?`,
      [at, body.slice(0, 160), id],
    );
    return c.json({ id: messageId, role: "human", body, author_name: author, created_at: at } as never);
  });

  const setStatus = createRoute({
    method: "post",
    path: "/api/conversations/{id}/status",
    tags: ["Inbox"],
    summary: "Take over, hand back, or close",
    description:
      "status=human takes it over and silences the model. status=ai hands it back, which is the only way a conversation a person touched starts answering itself again.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { "application/json": { schema: z.object({ status: z.enum(["ai", "waiting_human", "human", "closed"]) }) } },
      },
    },
    responses: { 200: ok("Saved", OkSchema), 403: fail("No organisation") },
  });

  app.openapi(setStatus, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    await run(`UPDATE conversations SET status = ?, unread = 0 WHERE id = ? AND org_id = ?`, [
      c.req.valid("json").status,
      c.req.valid("param").id,
      org,
    ]);
    return c.json({ ok: true } as never);
  });

  const overview = createRoute({
    method: "get",
    path: "/api/overview",
    tags: ["Inbox"],
    summary: "Today at a glance",
    description: "Screenshot-friendly counts for the home screen. Cheap: four indexed counts, no model call.",
    responses: {
      200: ok(
        "Counts",
        z.object({
          conversations_today: z.number(),
          replies_today: z.number(),
          waiting: z.number(),
          leads: z.number(),
        }),
      ),
      403: fail("No organisation"),
    },
  });

  app.openapi(overview, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);
    const since = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const one = async (sql: string, args: unknown[]) => Number((await get<{ n: number }>(sql, args))?.n ?? 0);
    return c.json({
      conversations_today: await one(`SELECT COUNT(*) AS n FROM conversations WHERE org_id = ? AND created_at >= ?`, [org, since]),
      replies_today: await one(
        `SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND role = 'assistant' AND created_at >= ?`,
        [org, since],
      ),
      waiting: await one(`SELECT COUNT(*) AS n FROM conversations WHERE org_id = ? AND status = 'waiting_human'`, [org]),
      leads: await one(`SELECT COUNT(*) AS n FROM conversations WHERE org_id = ? AND visitor_email IS NOT NULL`, [org]),
    } as never);
  });
}
