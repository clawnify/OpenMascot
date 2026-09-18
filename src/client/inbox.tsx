// Every conversation the mascot had, and the place a person steps in.

import { useEffect, useRef, useState } from "react";
import { api, type Conversation, type Message, type Status } from "./api";
import { Card, Empty, inputClass, Pill, primaryClass, quietClass } from "./ui";

const FILTERS: Array<{ id: "all" | Status; label: string }> = [
  { id: "waiting_human", label: "Needs a person" },
  { id: "human", label: "Ours" },
  { id: "all", label: "Everything" },
];

const TONE: Record<Status, "accent" | "success" | "warning" | "muted"> = {
  waiting_human: "warning",
  human: "success",
  ai: "muted",
  closed: "muted",
};

const LABEL: Record<Status, string> = {
  waiting_human: "Needs a person",
  human: "One of us",
  ai: "Answered itself",
  closed: "Closed",
};

export function Inbox({ mascotId, onError }: { mascotId: string; onError: (message: string) => void }) {
  const [filter, setFilter] = useState<"all" | Status>("waiting_human");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Conversation[]>([]);
  const [open, setOpen] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void list();
  }, [mascotId, filter, search]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [open?.messages.length]);

  async function list() {
    try {
      const res = await api.conversations({
        mascot: mascotId,
        status: filter === "all" ? undefined : filter,
        search: search.trim() || undefined,
      });
      setRows(res.conversations);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function show(id: string) {
    try {
      setOpen(await api.thread(id));
      setDraft("");
      await list();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function send() {
    if (!open || !draft.trim() || sending) return;
    setSending(true);
    try {
      const message = await api.reply(open.conversation.id, draft.trim());
      setOpen({
        conversation: { ...open.conversation, status: "human" },
        messages: [...open.messages, message],
      });
      setDraft("");
      await list();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function move(status: Status) {
    if (!open) return;
    await api.setStatus(open.conversation.id, status);
    setOpen({ ...open, conversation: { ...open.conversation, status } });
    await list();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                filter === f.id
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          placeholder="Search what was said, or an email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {rows.length === 0 ? (
          <Empty
            title="Nothing here"
            hint={
              filter === "waiting_human"
                ? "Nobody is waiting on you. Conversations land here the moment the mascot cannot answer or somebody asks for a person."
                : "No conversations yet. They will appear as soon as someone talks to the widget on your site."
            }
          />
        ) : (
          <ul className="grid gap-1.5">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void show(r.id)}
                  className={`w-full rounded-lg p-3 text-left ${
                    open?.conversation.id === r.id ? "bg-sunken shadow-[inset_0_0_0_1px_var(--border)]" : "hover:bg-sunken"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.visitor_name || r.visitor_email || "Someone on your site"}
                    </span>
                    {r.unread > 0 && <Pill tone="accent">new</Pill>}
                    <span className="ml-auto flex-none text-xs text-faint tnum">{when(r.last_message_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">{r.last_message_preview || "…"}</p>
                  <div className="mt-1.5">
                    <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open ? (
        <Card
          title={open.conversation.visitor_name || open.conversation.visitor_email || "Someone on your site"}
          hint={[open.conversation.page_url, open.conversation.country].filter(Boolean).join(" · ") || undefined}
          action={
            <div className="flex flex-none gap-2">
              {open.conversation.status !== "human" ? (
                <button type="button" className={quietClass} onClick={() => void move("human")}>
                  Take over
                </button>
              ) : (
                <button type="button" className={quietClass} onClick={() => void move("ai")}>
                  Hand back
                </button>
              )}
              <button type="button" className={quietClass} onClick={() => void move("closed")}>
                Close
              </button>
            </div>
          }
        >
          <div className="max-h-[26rem] overflow-y-auto rounded-lg bg-sunken p-3">
            <div className="grid gap-2">
              {open.messages.map((m) => (
                <div key={m.id} className={m.role === "visitor" ? "justify-self-start" : "justify-self-end"}>
                  {m.role !== "visitor" && m.author_name && (
                    <p className="mb-0.5 text-right text-xs text-faint">{m.author_name}</p>
                  )}
                  <p
                    className={`max-w-[34rem] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "visitor" ? "bg-surface shadow-[inset_0_0_0_1px_var(--border)]" : "bg-primary text-on-primary"
                    }`}
                  >
                    {m.body}
                  </p>
                </div>
              ))}
              <div ref={bottom} />
            </div>
          </div>

          {open.conversation.status === "closed" ? (
            <p className="mt-3 text-sm text-muted">This conversation is closed. Reply to reopen it.</p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Write as yourself"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            <button type="button" className={primaryClass} onClick={() => void send()} disabled={sending || !draft.trim()}>
              {sending ? "Sending" : "Send"}
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            Sending takes this conversation over. The mascot stays out of it until you hand it back.
          </p>
        </Card>
      ) : (
        <Card title="Pick a conversation" hint="The thread opens here, and you can answer in it as yourself.">
          <Empty title="Nothing open" hint="Choose one on the left to read it." />
        </Card>
      )}
    </div>
  );
}

function when(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
