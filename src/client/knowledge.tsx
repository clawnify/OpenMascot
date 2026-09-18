// Everything the mascot is allowed to say. If an answer is wrong, it is wrong
// here, which is why this screen shows the stored words rather than a file name.

import { useEffect, useState } from "react";
import { api, type Source } from "./api";
import { Card, Empty, Field, inputClass, primaryClass, quietClass, Pill } from "./ui";

export function Knowledge({ mascotId, onError }: { mascotId: string; onError: (message: string) => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);

  useEffect(() => {
    void load();
  }, [mascotId]);

  async function load() {
    try {
      setSources((await api.sources(mascotId)).sources);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function addUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api.addSource(mascotId, { kind: "url", url: url.trim() });
      setUrl("");
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addText() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.addSource(mascotId, { kind: "text", title: title.trim() || "Note", content: text });
      setTitle("");
      setText("");
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card title="Read a page" hint="Fetched once and stored as words. Add the same address again to refresh it after the page changes.">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputClass} min-w-56 flex-1`}
            placeholder="https://acme.com/pricing"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addUrl()}
          />
          <button type="button" className={primaryClass} onClick={() => void addUrl()} disabled={busy || !url.trim()}>
            Read it
          </button>
        </div>
      </Card>

      <Card title="Write something down" hint="The things that are true but are not on any page: opening hours, what you do not do, how you price.">
        <div className="grid gap-3">
          <Field label="What is this about">
            <input className={inputClass} placeholder="How we price" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="What it should know">
            <textarea className={inputClass} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div>
            <button type="button" className={quietClass} onClick={() => void addText()} disabled={busy || !text.trim()}>
              Add to what it knows
            </button>
          </div>
        </div>
      </Card>

      <Card title="What it knows" hint={`${sources.length} ${sources.length === 1 ? "source" : "sources"}. Everything it says comes from here.`}>
        {sources.length === 0 ? (
          <Empty
            title="It knows nothing yet"
            hint="Until you add something, it will tell every visitor it does not know and ask them to leave a message. Read your homepage above to start."
          />
        ) : (
          <ul className="grid gap-2">
            {sources.map((s) => (
              <li key={s.id} className="rounded-lg bg-sunken p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.title}</span>
                      <Pill tone={s.kind === "url" ? "accent" : "muted"}>{s.kind === "url" ? "page" : "note"}</Pill>
                    </div>
                    {s.url && <p className="truncate text-xs text-faint">{s.url}</p>}
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{s.content.slice(0, 220)}</p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button type="button" className={quietClass} onClick={() => setEditing(s)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={quietClass}
                      onClick={async () => {
                        await api.deleteSource(s.id);
                        await load();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <Card title={`Editing ${editing.title}`} hint="Correct what it says by correcting what it read.">
          <div className="grid gap-3">
            <input className={inputClass} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <textarea
              className={inputClass}
              rows={10}
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={primaryClass}
                onClick={async () => {
                  await api.editSource(editing.id, { title: editing.title, content: editing.content });
                  setEditing(null);
                  await load();
                }}
              >
                Save
              </button>
              <button type="button" className={quietClass} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
