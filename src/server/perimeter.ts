// Everything that stands between a stranger on the internet and an org's
// credits. The public half of this app is embedded on someone else's website,
// so it is cross-origin by construction and cannot lean on the platform's
// perimeter the way the authenticated half does.
//
// Three defences, and each one exists because of a specific way this goes
// wrong:
//
//   1. The origin allowlist. A snippet is public by definition — view-source on
//      the customer's site hands anyone the key. The allowlist is what makes a
//      copied snippet useless somewhere else, and it doubles as the CORS gate,
//      so there is one list to keep right rather than two.
//   2. A per-address burst limit. Stops one script hammering the model.
//   3. A per-day reply ceiling per mascot. The backstop for everything the
//      first two miss: whatever happens, one mascot can only spend so much in
//      a day, and past the line it degrades to taking a message.

/** Longest message a visitor may send. Anything past this is a paste bomb. */
export const MAX_MESSAGE_CHARS = 1000;

/** Visitor messages allowed from one address in a rolling minute. */
export const MAX_MESSAGES_PER_MINUTE = 6;

/** Turns in one thread before it stops accepting more. */
export const MAX_MESSAGES_PER_CONVERSATION = 60;

/**
 * Reduce an origin or a typed-in domain to a comparable host.
 *
 * People write `acme.com` in a settings field and the browser sends
 * `https://www.acme.com`. Matching on the bare host, with `www.` dropped, is
 * what makes the obvious thing the owner types actually work. Port is kept:
 * `localhost:5173` and `localhost:3000` are different origins and dev setups
 * rely on that.
 */
export function originHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    return null;
  }
  return host.replace(/^www\./, "") || null;
}

/**
 * Is this request coming from a site the owner allowed?
 *
 * An empty list means nobody, deliberately. A fresh mascot that answered for
 * any site that pasted its snippet would be a stranger's assistant paid for by
 * the owner; the install flow fills this list from the deploy answers, so the
 * restrictive default costs a correctly-installed widget nothing.
 *
 * Loopback is always allowed: it is unreachable from anyone else's browser, and
 * refusing it means `pnpm dev` looks broken on a fresh clone.
 */
export function originAllowed(allowed: string[], origin: string | null | undefined): boolean {
  const host = originHost(origin);
  if (!host) return false;
  if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return true;
  return allowed.some((entry) => {
    const want = originHost(entry);
    return want !== null && want === host;
  });
}

/**
 * CORS for one validated origin.
 *
 * The origin is echoed rather than starred because the widget sends the
 * conversation token, and a wildcard cannot carry credentials or be narrowed
 * later without breaking every installed snippet. `Vary` keeps a CDN from
 * handing one site's allowed response to another site.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Salted hash of the caller's address, for rate limiting only.
 *
 * The salt is the mascot's own key, so the same visitor on two different
 * mascots produces two unrelated hashes and the table cannot be mined to
 * follow someone across an agency's client sites. The address itself is never
 * written down.
 */
export async function hashAddress(address: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** The UTC day a reply counts against. Matches the cap's "per day" wording. */
export function dayStart(at: Date = new Date()): string {
  return `${at.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/** The start of the rolling rate-limit window. */
export function minuteAgo(at: Date = new Date()): string {
  return new Date(at.getTime() - 60_000).toISOString();
}
