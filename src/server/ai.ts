// The one place the model is called.
//
// The mascot is a front door, not a research assistant: it answers from the
// material the owner put in, and when the answer is not in there it says so and
// offers a person. That is the whole behavioural contract, and it is enforced
// in three places rather than trusted to the prompt — the material is capped
// before it is sent, the reply is parsed rather than echoed, and the caller
// decides what to do with a handoff.

import { parseList } from "./env.js";

/** Fast and cheap, because this answers a stranger's first question, not a
 *  research task. Overridable per install with MASCOT_MODEL. */
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** How much of the owner's material goes into one prompt. Roughly 6k tokens:
 *  enough for an SMB's pages, small enough that a long knowledge base cannot
 *  quietly multiply the cost of every answer. */
const MAX_CONTEXT_CHARS = 24_000;

/** Turns of history the model sees. A website chat is short by nature. */
const MAX_HISTORY = 12;

export interface MascotPersona {
  name: string;
  tagline: string;
  locale: string;
  bookingUrl: string | null;
  instructions: string;
}

export interface Turn {
  role: "visitor" | "assistant" | "human";
  body: string;
}

export interface Answer {
  reply: string;
  /** The model could not answer from the material, or the visitor asked for a
   *  person. The caller flips the conversation to waiting_human. */
  handoff: boolean;
}

/** Everything the mascot is allowed to know, trimmed to the budget. */
export function buildContext(sources: Array<{ title: string; url: string | null; content: string }>): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of sources) {
    const header = s.url ? `## ${s.title || s.url}\n(${s.url})` : `## ${s.title || "Untitled"}`;
    const block = `${header}\n${s.content.trim()}`;
    if (used + block.length > MAX_CONTEXT_CHARS) {
      const room = MAX_CONTEXT_CHARS - used;
      if (room > 400) parts.push(`${block.slice(0, room)}\n[trimmed]`);
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}

function systemPrompt(persona: MascotPersona, context: string): string {
  const booking = persona.bookingUrl
    ? `When someone wants to meet or talk to a person, give them this link: ${persona.bookingUrl}`
    : `When someone wants to meet or talk to a person, tell them you will pass it on, and set handoff.`;

  return [
    `You are ${persona.name}, the assistant on this company's own website.`,
    persona.tagline ? `You are described as: ${persona.tagline}` : "",
    "",
    "How you answer:",
    "- Use ONLY the material below. It is everything you know about this company.",
    "- If the answer is not in the material, say plainly that you do not know and set handoff to true. Never guess, and never fill a gap with something that sounds right.",
    "- Never state a price, a delivery time, a legal position or a promise that is not written in the material.",
    "- Two to four sentences. This is a chat box on a web page, not a document.",
    `- Reply in the language the visitor writes in. Default to ${persona.locale}.`,
    "- Set handoff to true whenever the visitor asks for a human, sounds unhappy, or raises anything about money, contracts or a complaint.",
    `- ${booking}`,
    persona.instructions ? `\nThe owner adds:\n${persona.instructions}` : "",
    "",
    'Answer with ONLY a JSON object, no prose around it and no code fences: { "reply": string, "handoff": boolean }',
    "",
    "--- MATERIAL ---",
    context || "(The owner has not added any material yet. You do not know anything about this company: say so and set handoff to true.)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function answer(
  env: { OPENROUTER_API_KEY?: string; MASCOT_MODEL?: string },
  persona: MascotPersona,
  context: string,
  history: Turn[],
): Promise<Answer> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("No OPENROUTER_API_KEY on this deployment");

  const messages = [
    { role: "system", content: systemPrompt(persona, context) },
    ...history.slice(-MAX_HISTORY).map((t) => ({
      // A reply typed by a colleague is still the assistant's side of the
      // conversation as far as the model is concerned: it has to read what was
      // already promised, or it contradicts its own team.
      role: t.role === "visitor" ? "user" : "assistant",
      content: t.body,
    })),
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://clawnify.com",
      "X-Title": "OpenMascot",
    },
    body: JSON.stringify({
      model: env.MASCOT_MODEL || DEFAULT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseAnswer(data.choices?.[0]?.message?.content ?? "");
}

/**
 * A model that returns prose instead of JSON must not take the widget down, so
 * unparseable output becomes the handoff it effectively is: the visitor still
 * gets a sentence, and a person still gets told.
 */
export function parseAnswer(content: string): Answer {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed) as { reply?: unknown; handoff?: unknown };
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (reply) return { reply, handoff: parsed.handoff === true };
  } catch {
    // fall through
  }
  if (trimmed && !trimmed.startsWith("{")) return { reply: trimmed.slice(0, 1200), handoff: false };
  return { reply: "", handoff: true };
}

/** Starter questions for a brand-new mascot, so the widget is never blank. */
export function defaultSuggestions(raw: string | null | undefined): string[] {
  const list = parseList(raw);
  return list.length ? list : ["What do you do?", "How does it work?", "Can I speak to someone?"];
}
