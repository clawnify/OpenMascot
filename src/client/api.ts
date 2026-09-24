// One fetch wrapper. Auth is the platform's job at the perimeter, so there is
// no token to attach and no login to build here.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export type Mode = "ai" | "human";
export type Status = "ai" | "waiting_human" | "human" | "closed";

export interface Mascot {
  id: string;
  key: string;
  name: string;
  avatar_url: string | null;
  accent: string;
  accent2: string | null;
  character_shape: string;
  character_eyes: boolean;
  greeting: string;
  tagline: string;
  mode: Mode;
  suggested: string[];
  booking_url: string | null;
  handoff_message: string;
  allowed_origins: string[];
  ai_instructions: string;
  daily_reply_cap: number;
  locale: string;
  created_at: string;
}

export interface Source {
  id: string;
  mascot_id: string;
  kind: "text" | "url";
  title: string;
  url: string | null;
  content: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  mascot_id: string;
  mascot_name: string | null;
  status: Status;
  unread: number;
  page_url: string | null;
  country: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  last_message_at: string;
  last_message_preview: string;
  created_at: string;
}

export interface Message {
  id: string;
  role: "visitor" | "assistant" | "human";
  body: string;
  author_name: string | null;
  created_at: string;
}

export interface Overview {
  conversations_today: number;
  replies_today: number;
  waiting: number;
  leads: number;
}

export type MascotWrite = Omit<Mascot, "id" | "key" | "created_at">;

export const api = {
  overview: () => request<Overview>("/api/overview"),

  mascots: () => request<{ mascots: Mascot[]; total: number }>("/api/mascots?limit=100"),
  createMascot: (body: MascotWrite) => request<Mascot>("/api/mascots", { method: "POST", body: JSON.stringify(body) }),
  updateMascot: (id: string, body: MascotWrite) =>
    request<Mascot>(`/api/mascots/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMascot: (id: string) => request<{ ok: boolean }>(`/api/mascots/${id}`, { method: "DELETE" }),

  sources: (mascotId: string) => request<{ sources: Source[]; total: number }>(`/api/mascots/${mascotId}/sources?limit=100`),
  addSource: (mascotId: string, body: { kind: "text" | "url"; title?: string; url?: string; content?: string }) =>
    request<Source>(`/api/mascots/${mascotId}/sources`, { method: "POST", body: JSON.stringify(body) }),
  editSource: (id: string, body: { title: string; content: string }) =>
    request<{ ok: boolean }>(`/api/sources/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSource: (id: string) => request<{ ok: boolean }>(`/api/sources/${id}`, { method: "DELETE" }),

  conversations: (q: { mascot?: string; status?: Status; search?: string }) => {
    const p = new URLSearchParams({ limit: "50" });
    if (q.mascot) p.set("mascot", q.mascot);
    if (q.status) p.set("status", q.status);
    if (q.search) p.set("search", q.search);
    return request<{ conversations: Conversation[]; total: number; waiting: number }>(`/api/conversations?${p}`);
  },
  thread: (id: string) => request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`),
  reply: (id: string, body: string) =>
    request<Message>(`/api/conversations/${id}/reply`, { method: "POST", body: JSON.stringify({ body }) }),
  setStatus: (id: string, status: Status) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
};
