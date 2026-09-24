// Row shapes and the two reads the public half needs. Kept out of the route
// files so the authenticated half and the public half cannot drift on what a
// mascot is.

import { get, query } from "./db.js";

export interface MascotRow {
  id: string;
  org_id: string;
  key: string;
  name: string;
  avatar_url: string | null;
  accent: string;
  accent2: string | null;
  character_shape: string;
  character_eyes: number;
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
}

export interface ConversationRow {
  id: string;
  org_id: string;
  mascot_id: string;
  token: string;
  status: string;
}

const MASCOT_COLUMNS = `id, org_id, key, name, avatar_url, accent, accent2, character_shape,
       character_eyes, greeting, tagline, mode,
       suggested, booking_url, handoff_message, allowed_origins, ai_instructions,
       daily_reply_cap, locale`;

/** The public lookup. The key is the tenant: nothing else on a visitor request
 *  is trusted, and org_id comes off this row rather than the caller. */
export function mascotByKey(key: string): Promise<MascotRow | null> {
  return get<MascotRow>(`SELECT ${MASCOT_COLUMNS} FROM mascots WHERE key = ?`, [key]) as Promise<MascotRow | null>;
}

export function mascotById(orgId: string, id: string): Promise<MascotRow | null> {
  return get<MascotRow>(`SELECT ${MASCOT_COLUMNS} FROM mascots WHERE id = ? AND org_id = ?`, [
    id,
    orgId,
  ]) as Promise<MascotRow | null>;
}

export function sourcesFor(mascotId: string): Promise<Array<{ title: string; url: string | null; content: string }>> {
  return query(`SELECT title, url, content FROM sources WHERE mascot_id = ? ORDER BY created_at ASC`, [mascotId]);
}

/** The line a visitor gets when a person is needed, whatever the reason. */
export function handoffLine(m: MascotRow): string {
  return (
    m.handoff_message.trim() ||
    "Let me pass this to a colleague. Leave your email and someone will come back to you."
  );
}
