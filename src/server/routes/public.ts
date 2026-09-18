// The half of this app that strangers reach.
//
// None of it is on the OpenAPI surface: these are plain Hono routes because the
// org's agent has no business calling them (it would be chatting with its own
// widget) and because every published route costs the agent context on every
// turn.
//
// `orgId(c)` is null on all of it. The tenant comes from the mascot key in the
// snippet, and a thread is read back only with the token this app issued for
// it, so a guessed conversation id opens nothing. Read perimeter.ts before
// adding anything here.

import { get, query, run } from "../db.js";
import { now, parseList, uid, type App } from "../env.js";
import { answer, buildContext, defaultSuggestions, type Turn } from "../ai.js";
import { handoffLine, mascotByKey, sourcesFor, type ConversationRow, type MascotRow } from "../mascot.js";
import {
  corsHeaders,
  dayStart,
  hashAddress,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES_PER_CONVERSATION,
  MAX_MESSAGES_PER_MINUTE,
  minuteAgo,
  originAllowed,
} from "../perimeter.js";
import { widgetScript } from "../widget.js";

/** The loader is read on every page view of the customer's site and changes
 *  only when the owner edits the mascot, so it is worth caching at the edge. */
const SCRIPT_CACHE = "public, max-age=120, stale-while-revalidate=600";

interface PublicMessage {
  id: string;
  role: string;
  body: string;
  author_name: string | null;
  created_at: string;
}

export function registerPublic(app: App) {
  // ── The loader ──────────────────────────────────────────────────────────
  //
  // A <script src> sends no Origin header, so this is not the place to enforce
  // the allowlist — the API calls are. What it serves is public by nature: the
  // mascot's name, colour and greeting, the same things every visitor sees.
  app.get("/w/:file", async (c) => {
    const key = c.req.param("file").replace(/\.js$/, "");
    const m = await mascotByKey(key);
    if (!m) return c.text("// unknown mascot", 404, { "Content-Type": "application/javascript" });

    const origin = new URL(c.req.url).origin;
    return c.body(
      widgetScript({
        origin,
        key: m.key,
        name: m.name,
        accent: m.accent,
        avatarUrl: m.avatar_url,
        greeting: m.greeting || `Hi, I'm ${m.name}. Ask me anything.`,
        tagline: m.tagline,
        suggested: defaultSuggestions(m.suggested),
      }),
      200,
      { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": SCRIPT_CACHE },
    );
  });

  // ── Preflight ───────────────────────────────────────────────────────────
  //
  // Answered for every origin, without a database read.
  //
  // A preflight is not a security boundary and must not be treated as one. It
  // carries no body, so the mascot key the widget posts is not available here,
  // and it is the request that FOLLOWS which decides anything. Refusing the
  // preflight only means the browser never sends that request, so the visitor
  // sees a CORS failure instead of the app's own answer — which is how this
  // route was broken: it looked for the key in the query string, the widget
  // sends it in the body, and every visitor's first message failed.
  //
  // Nothing leaks: the answer is identical whatever origin asks and whatever
  // keys exist. Enforcement lives on the real request below.
  app.options("/api/public/*", (c) => c.body(null, 204, corsHeaders(c.req.header("Origin") ?? null)));

  // ── A visitor says something ────────────────────────────────────────────
  app.post("/api/public/chat", async (c) => {
    const body = await c.req.json().catch(() => null);
    const key = str(body?.key);
    const origin = c.req.header("Origin") ?? null;

    // Refusals carry CORS headers on purpose: without them the browser reports
    // an opaque network error and the visitor is shown nothing, when the app has
    // a perfectly clear sentence to give them. The body is a fixed string that
    // says nothing about whether the key exists.
    const m = key ? await mascotByKey(key) : null;
    if (!m || !originAllowed(parseList(m.allowed_origins), origin)) {
      return c.json({ error: "This assistant is not available on this site." }, 403, corsHeaders(origin));
    }
    const cors = corsHeaders(origin);

    const text = str(body?.message).trim();
    if (!text) return c.json({ error: "Say something first." }, 400, cors);
    if (text.length > MAX_MESSAGE_CHARS) {
      return c.json({ error: `Please keep it under ${MAX_MESSAGE_CHARS} characters.` }, 400, cors);
    }

    const address = c.req.header("CF-Connecting-IP") ?? "local";
    const ipHash = await hashAddress(address, m.key);

    const burst = await countOne(
      `SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND role = 'visitor' AND created_at > ?`,
      [ipHash, minuteAgo()],
    );
    if (burst >= MAX_MESSAGES_PER_MINUTE) {
      return c.json({ error: "That is a lot of messages at once. Give it a moment." }, 429, cors);
    }

    // Resume or open. A conversation is only resumed when the id and the token
    // this app issued arrive together, so the id on its own is worthless.
    let convo = await resume(m, body);
    const opened = !convo;
    if (!convo) convo = await open(m, str(body?.pageUrl), c.req.header("Referer") ?? null, c.req.header("CF-IPCountry") ?? null);

    const turns = await countOne(`SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?`, [convo.id]);
    if (turns >= MAX_MESSAGES_PER_CONVERSATION) {
      return c.json({ error: "This conversation has run long. Please start a new one." }, 429, cors);
    }

    const at = now();
    await addMessage(m, convo.id, "visitor", text, null, ipHash, at);
    await touch(convo.id, text, 1);

    const out: PublicMessage[] = [];

    // A person is on it, or the owner runs this mascot without AI at all. Either
    // way the model stays out: answering over a colleague mid-conversation is
    // the failure this status exists to prevent.
    if (m.mode !== "ai" || convo.status === "human" || convo.status === "waiting_human") {
      if (opened || convo.status === "ai") {
        const line = handoffLine(m);
        out.push(await addMessage(m, convo.id, "assistant", line, m.name, null, now()));
        await setStatus(convo.id, "waiting_human");
        convo = { ...convo, status: "waiting_human" };
      }
      return c.json(
        { conversationId: convo.id, token: convo.token, status: convo.status === "ai" ? "waiting_human" : convo.status, messages: out },
        200,
        cors,
      );
    }

    // The day's ceiling. Past it the mascot stops spending and starts taking
    // messages — the widget keeps working, the bill does not keep growing.
    const today = await countOne(
      `SELECT COUNT(*) AS n FROM messages WHERE mascot_id = ? AND role = 'assistant' AND created_at >= ?`,
      [m.id, dayStart()],
    );
    if (today >= m.daily_reply_cap) {
      out.push(await addMessage(m, convo.id, "assistant", handoffLine(m), m.name, null, now()));
      await setStatus(convo.id, "waiting_human");
      return c.json({ conversationId: convo.id, token: convo.token, status: "waiting_human", messages: out }, 200, cors);
    }

    const history = await query<Turn>(
      `SELECT role, body FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 40`,
      [convo.id],
    );

    let reply: string;
    let handoff = false;
    try {
      const result = await answer(
        c.env,
        {
          name: m.name,
          tagline: m.tagline,
          locale: m.locale,
          bookingUrl: m.booking_url,
          instructions: m.ai_instructions,
        },
        buildContext(await sourcesFor(m.id)),
        history,
      );
      reply = result.reply || handoffLine(m);
      handoff = result.handoff || !result.reply;
    } catch (err) {
      // The visitor is mid-sentence on someone's website; a stack trace is not
      // an answer. Take the message instead and let a person pick it up.
      console.error("mascot reply failed", err);
      reply = handoffLine(m);
      handoff = true;
    }

    out.push(await addMessage(m, convo.id, "assistant", reply, m.name, null, now()));
    await touch(convo.id, reply, 0);
    if (handoff) await setStatus(convo.id, "waiting_human");

    return c.json(
      { conversationId: convo.id, token: convo.token, status: handoff ? "waiting_human" : "ai", messages: out },
      200,
      cors,
    );
  });

  // ── Anything said since the visitor last looked ─────────────────────────
  //
  // How a reply typed by a person reaches a browser that is still open. Polled
  // by the widget while the panel is open, so it is a single indexed read.
  app.get("/api/public/messages", async (c) => {
    const origin = c.req.header("Origin") ?? null;
    const m = await mascotByKey(c.req.query("key") ?? "");
    if (!m || !originAllowed(parseList(m.allowed_origins), origin)) {
      return c.json({ error: "This assistant is not available on this site." }, 403, corsHeaders(origin));
    }
    const cors = corsHeaders(origin);

    const convo = await byToken(m, c.req.query("conversation"), c.req.query("token"));
    if (!convo) return c.json({ error: "Unknown conversation." }, 404, cors);

    const after = c.req.query("after") ?? "1970-01-01T00:00:00.000Z";
    const messages = await query<PublicMessage>(
      `SELECT id, role, body, author_name, created_at
         FROM messages
        WHERE conversation_id = ? AND created_at > ? AND role != 'visitor'
        ORDER BY created_at ASC LIMIT 50`,
      [convo.id, after],
    );
    return c.json({ status: convo.status, messages }, 200, cors);
  });

  // ── Who was asking ──────────────────────────────────────────────────────
  app.post("/api/public/contact", async (c) => {
    const body = await c.req.json().catch(() => null);
    const origin = c.req.header("Origin") ?? null;
    const m = await mascotByKey(str(body?.key));
    if (!m || !originAllowed(parseList(m.allowed_origins), origin)) {
      return c.json({ error: "This assistant is not available on this site." }, 403, corsHeaders(origin));
    }
    const cors = corsHeaders(origin);

    const convo = await byToken(m, str(body?.conversation), str(body?.token));
    if (!convo) return c.json({ error: "Unknown conversation." }, 404, cors);

    const email = str(body?.email).trim().slice(0, 254);
    const name = str(body?.name).trim().slice(0, 120);
    if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
      return c.json({ error: "That email does not look right." }, 400, cors);
    }
    if (!email && !name) return c.json({ error: "Nothing to save." }, 400, cors);

    await run(
      `UPDATE conversations
          SET visitor_name = COALESCE(NULLIF(?, ''), visitor_name),
              visitor_email = COALESCE(NULLIF(?, ''), visitor_email),
              unread = 1
        WHERE id = ?`,
      [name, email, convo.id],
    );
    return c.json({ ok: true }, 200, cors);
  });
}

/* ------------------------------- helpers -------------------------------- */

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function countOne(sql: string, args: unknown[]): Promise<number> {
  const row = await get<{ n: number }>(sql, args);
  return Number(row?.n ?? 0);
}

async function byToken(m: MascotRow, id: string | undefined, token: string | undefined): Promise<ConversationRow | null> {
  if (!id || !token) return null;
  return (await get<ConversationRow>(
    `SELECT id, org_id, mascot_id, token, status FROM conversations WHERE id = ? AND token = ? AND mascot_id = ?`,
    [id, token, m.id],
  )) as ConversationRow | null;
}

function resume(m: MascotRow, body: unknown): Promise<ConversationRow | null> {
  const b = body as { conversationId?: unknown; token?: unknown } | null;
  return byToken(m, str(b?.conversationId) || undefined, str(b?.token) || undefined);
}

async function open(m: MascotRow, pageUrl: string, referrer: string | null, country: string | null): Promise<ConversationRow> {
  const id = uid();
  const token = uid().replace(/-/g, "") + uid().replace(/-/g, "");
  const at = now();
  await run(
    `INSERT INTO conversations (id, org_id, mascot_id, token, status, unread, page_url, referrer, country,
                                last_message_at, last_message_preview, created_at)
     VALUES (?, ?, ?, ?, 'ai', 0, ?, ?, ?, ?, '', ?)`,
    [id, m.org_id, m.id, token, pageUrl.slice(0, 500), (referrer ?? "").slice(0, 300), (country ?? "").slice(0, 2), at, at],
  );
  return { id, org_id: m.org_id, mascot_id: m.id, token, status: "ai" };
}

async function addMessage(
  m: MascotRow,
  conversationId: string,
  role: string,
  body: string,
  authorName: string | null,
  ipHash: string | null,
  at: string,
): Promise<PublicMessage> {
  const id = uid();
  await run(
    `INSERT INTO messages (id, org_id, mascot_id, conversation_id, role, body, author_name, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, m.org_id, m.id, conversationId, role, body, authorName, ipHash, at],
  );
  return { id, role, body, author_name: authorName, created_at: at };
}

/** `unread` is set by the visitor's side only: a reply the team wrote is
 *  already read by definition. */
function touch(conversationId: string, preview: string, unread: 0 | 1): Promise<unknown> {
  return run(
    `UPDATE conversations
        SET last_message_at = ?, last_message_preview = ?, unread = MAX(unread, ?)
      WHERE id = ?`,
    [now(), preview.slice(0, 160), unread, conversationId],
  );
}

/** Never downgrades a conversation a person already took: the model losing a
 *  race with a colleague must not hand the thread back to itself. */
function setStatus(conversationId: string, status: string): Promise<unknown> {
  return run(`UPDATE conversations SET status = ? WHERE id = ? AND status != 'human'`, [status, conversationId]);
}
