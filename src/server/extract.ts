// Turning one of the owner's own web pages into text the mascot can quote.
//
// Deliberately a tag strip and not a browser render or a model call: the input
// is the customer's own marketing site, the output is read by a model that is
// told to quote it, and neither a headless browser nor a summarisation pass
// would make the answer better. Both would make every page they add cost money.

/** Elements whose contents are never prose. Stripped with their children. */
const DROP = /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Block-level tags that should become a line break rather than run words
 *  together: without this "Pricing" and "Contact" arrive as "PricingContact". */
const BLOCK = /<\/?(p|div|section|article|header|footer|main|h[1-6]|li|tr|br|hr)\b[^>]*>/gi;

const TAG = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/** Longest page we keep. A sitemap-sized page adds noise, not knowledge. */
export const MAX_SOURCE_CHARS = 12_000;

export function htmlToText(html: string): string {
  return html
    .replace(DROP, " ")
    .replace(BLOCK, "\n")
    .replace(TAG, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function titleOf(html: string, fallback: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = m?.[1]?.replace(/\s+/g, " ").trim();
  return raw ? raw.slice(0, 160) : fallback;
}

export interface FetchedPage {
  title: string;
  text: string;
}

/**
 * Fetch one page and keep its words.
 *
 * Only http(s), because the owner is naming a page on their own site and
 * anything else here would be a request this app makes on a stranger's behalf.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That does not look like a web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https addresses can be read.");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "OpenMascot (+https://clawnify.com)", Accept: "text/html,text/plain" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`That page answered ${res.status}.`);

  const type = res.headers.get("Content-Type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    throw new Error("That address is not a web page.");
  }

  const html = await res.text();
  const text = htmlToText(html).slice(0, MAX_SOURCE_CHARS);
  if (!text) throw new Error("There were no words on that page.");
  return { title: titleOf(html, parsed.hostname + parsed.pathname), text };
}
