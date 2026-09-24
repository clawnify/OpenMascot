// Trying the assistant from inside the dashboard, without leaving a trace.
//
// The owner needs to hear what a visitor would hear, and those turns must not
// become conversations: an inbox full of the owner talking to themselves is
// worse than no preview at all, and a person picking up a real thread should
// never wonder which messages were rehearsal.
//
// So this route is stateless. It writes nothing — no conversation, no message,
// no address hash — and the transcript lives in the caller's tab for as long as
// the panel is open.
//
// It is authenticated, and that is the whole security design. The obvious
// alternative, a `test: true` on the public chat route, would hand anyone on the
// internet free answers AND a way around the daily ceiling, because the ceiling
// counts saved assistant messages and a test turn saves none. Here `orgId(c)` is
// null for a visitor, so the widget on a customer's site cannot reach it however
// its script tag is marked.

import { createRoute, orgId, z } from "@clawnify/app";
import { fail, ok, type App } from "../env.js";
import { answer, buildContext, type Turn } from "../ai.js";
import { handoffLine, mascotById, sourcesFor } from "../mascot.js";

/** The same ceiling the widget imposes on a visitor's turn. */
const MAX_MESSAGE_CHARS = 1000;
/** Enough to rehearse a conversation, not enough to use this as a free API. */
const MAX_TURNS = 30;

export function registerPreview(app: App) {
  const route = createRoute({
    method: "post",
    path: "/api/preview/chat",
    tags: ["Preview"],
    summary: "Ask an assistant a question without recording it",
    description:
      "Answers exactly as the widget would, from the same sources and with the same rules, and stores nothing. The caller holds the transcript and sends it back each turn. Spends the org's credits like any other answer, but does not count against the mascot's daily ceiling, because nothing is written for the ceiling to count.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              mascot_id: z.string(),
              messages: z
                .array(
                  z.object({
                    role: z.enum(["visitor", "assistant", "human"]),
                    body: z.string().max(MAX_MESSAGE_CHARS),
                  }),
                )
                .min(1)
                .max(MAX_TURNS),
            }),
          },
        },
      },
    },
    responses: {
      200: ok(
        "The reply",
        z.object({ reply: z.string(), handoff: z.boolean() }).openapi("PreviewReply"),
      ),
      403: fail("No organisation"),
      404: fail("No such mascot"),
    },
  });

  app.openapi(route, async (c) => {
    const org = orgId(c);
    if (!org) return c.json({ error: "No organisation on this request" }, 403);

    const { mascot_id, messages } = c.req.valid("json");
    const m = await mascotById(org, mascot_id);
    if (!m) return c.json({ error: "No such mascot" }, 404);

    // A mascot with the model switched off has nothing to preview: every reply
    // on the real thing would be the handoff line, so that is what this says.
    if (m.mode !== "ai") return c.json({ reply: handoffLine(m), handoff: true } as never);

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
        messages as Turn[],
      );
      return c.json({
        reply: result.reply || handoffLine(m),
        handoff: result.handoff || !result.reply,
      } as never);
    } catch (err) {
      // The owner is testing, so the reason is useful to them in a way it never
      // is to a visitor. Surfaced rather than swallowed into the handoff line.
      console.error("preview reply failed", err);
      return c.json({ error: err instanceof Error ? err.message : "Could not answer." }, 403);
    }
  });
}
