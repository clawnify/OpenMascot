// Who the mascot is, where it may live, and what it is allowed to spend.

import { useEffect, useState } from "react";
import type { Mascot, MascotWrite } from "./api";
import { Card, Confirm, Field, inputClass, primaryClass, quietClass } from "./ui";

const LOCALES = ["en", "nl", "de", "fr", "es", "it"];

/** Mirrors the silhouettes the server can draw. Paths are duplicated here on
 *  purpose: this is a picker preview, and importing server code into the client
 *  bundle to save six strings would be the worse trade. */
const SHAPES: Array<{ key: string; label: string; d: string; ey: number; eh: number }> = [
  { key: "circle", label: "Round", d: "M50 9A41 41 0 1 1 50 91A41 41 0 1 1 50 9Z", ey: 41, eh: 15 },
  { key: "squircle", label: "Soft square", d: "M36 10H64Q90 10 90 36V64Q90 90 64 90H36Q10 90 10 64V36Q10 10 36 10Z", ey: 41, eh: 15 },
  { key: "pill", label: "Wide", d: "M34 24H66Q92 24 92 50Q92 76 66 76H34Q8 76 8 50Q8 24 34 24Z", ey: 42, eh: 14 },
  { key: "hex", label: "Hexagon", d: "M44.80 11.00Q50.00 8.00 55.20 11.00L81.18 26.00Q86.37 29.00 86.37 35.00L86.37 65.00Q86.37 71.00 81.18 74.00L55.20 89.00Q50.00 92.00 44.80 89.00L18.82 74.00Q13.63 71.00 13.63 65.00L13.63 35.00Q13.63 29.00 18.82 26.00Z", ey: 42, eh: 13 },
  { key: "drop", label: "Drop", d: "M50 6Q46 6 44 10L20 52C10 70 22 92 50 92C78 92 90 70 80 52L56 10Q54 6 50 6Z", ey: 52, eh: 15 },
  { key: "shield", label: "Shield", d: "M38 16Q50 -2 62 16L88 62Q100 80 78 80L22 80Q0 80 12 62Z", ey: 52, eh: 14 },
];

/** Same rule as the server: ink on a light face, white on a dark one. */
function eyeColour(fg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1d1d1b" : "#ffffff";
}

function Preview({ shape, fg, fg2, eyes, size }: { shape: string; fg: string; fg2: string | null; eyes: boolean; size: number }) {
  const s = SHAPES.find((x) => x.key === shape);
  if (!s) return <span className="text-sm text-muted">No character</span>;
  const id = `pv-${shape}-${size}`;
  const eye = eyeColour(fg);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={s.d} />
        </clipPath>
      </defs>
      <path d={s.d} fill={fg} />
      {fg2 && (
        <g clipPath={`url(#${id})`}>
          <rect x="0" y="0" width="50" height="100" fill={fg2} />
        </g>
      )}
      {eyes && (
        <g clipPath={`url(#${id})`}>
          <rect x="36.5" y={s.ey} width="7.5" height={s.eh} rx={s.eh / 2} fill={eye} />
          <rect x="56" y={s.ey} width="7.5" height={s.eh} rx={s.eh / 2} fill={eye} />
        </g>
      )}
    </svg>
  );
}

export function Settings({
  mascot,
  origin,
  onSave,
  onDelete,
}: {
  mascot: Mascot;
  origin: string;
  onSave: (body: MascotWrite) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [form, setForm] = useState<MascotWrite>(strip(mascot));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setForm(strip(mascot)), [mascot]);

  const set = <K extends keyof MascotWrite>(k: K, v: MascotWrite[K]) => setForm((f) => ({ ...f, [k]: v }));
  const snippet = `<script src="${origin}/w/${mascot.key}.js" async></script>`;

  async function save() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Install" hint="Paste this once, just before the closing body tag of every page it should appear on.">
        <pre className="overflow-x-auto rounded-md bg-sunken p-3 text-xs">{snippet}</pre>
        <button
          type="button"
          className={`${quietClass} mt-3`}
          onClick={() => {
            void navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy snippet"}
        </button>
      </Card>

      <Card title="Who it is" hint="What a visitor sees before they type anything.">
        <div className="grid gap-4">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="One line about it" hint="Sits under the name in the header.">
            <input className={inputClass} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Opening line">
            <textarea className={inputClass} rows={2} value={form.greeting} onChange={(e) => set("greeting", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand colour">
              <input
                type="color"
                className="h-9 w-full rounded-md bg-surface shadow-[inset_0_0_0_1px_var(--border)]"
                value={form.accent}
                onChange={(e) => set("accent", e.target.value)}
                aria-label="Brand colour"
              />
            </Field>
            <Field label="Language">
              <select className={inputClass} value={form.locale} onChange={(e) => set("locale", e.target.value)}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Picture" hint="A square image of your character. Optional.">
            <input
              className={inputClass}
              placeholder="https://…"
              value={form.avatar_url ?? ""}
              onChange={(e) => set("avatar_url", e.target.value || null)}
            />
          </Field>
          <Field label="Starter questions" hint="One per line. Shown as buttons before the visitor types.">
            <textarea
              className={inputClass}
              rows={3}
              value={form.suggested.join("\n")}
              onChange={(e) => set("suggested", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6))}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Its face"
        hint="Drawn rather than uploaded, because a picture is a smudge at the size a chat button actually is. It moves to show what it is doing."
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {SHAPES.map((sh) => (
              <button
                key={sh.key}
                type="button"
                aria-pressed={form.character_shape === sh.key}
                aria-label={sh.label}
                onClick={() => set("character_shape", sh.key)}
                className={`rounded-lg p-2 ${
                  form.character_shape === sh.key
                    ? "bg-sunken shadow-[inset_0_0_0_2px_var(--ring)]"
                    : "shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"
                }`}
              >
                <Preview shape={sh.key} fg={form.accent} fg2={form.accent2} eyes={form.character_eyes} size={40} />
              </button>
            ))}
            <button
              type="button"
              aria-pressed={form.character_shape === ""}
              onClick={() => set("character_shape", "")}
              className={`h-14 rounded-lg px-3 text-sm font-medium ${
                form.character_shape === ""
                  ? "bg-sunken text-foreground shadow-[inset_0_0_0_2px_var(--ring)]"
                  : "text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:bg-sunken"
              }`}
            >
              None
            </button>
          </div>

          {form.character_shape !== "" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Second face" hint="Paints the left half, so a flat mark reads as an object. Leave empty for one colour.">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-16 rounded-md bg-surface shadow-[inset_0_0_0_1px_var(--border)]"
                      value={form.accent2 ?? form.accent}
                      onChange={(e) => set("accent2", e.target.value)}
                      aria-label="Second face colour"
                    />
                    {form.accent2 && (
                      <button type="button" className={quietClass} onClick={() => set("accent2", null)}>
                        Clear
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Eyes" hint="They are what show whether it is thinking or waiting on you.">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.character_eyes}
                      onChange={(e) => set("character_eyes", e.target.checked)}
                    />
                    Give it eyes
                  </label>
                </Field>
              </div>
              <div className="flex items-end gap-5 rounded-lg bg-sunken p-4">
                <div className="text-center">
                  <Preview shape={form.character_shape} fg={form.accent} fg2={form.accent2} eyes={form.character_eyes} size={56} />
                  <span className="mt-1 block text-xs text-faint">launcher</span>
                </div>
                <div className="text-center">
                  <Preview shape={form.character_shape} fg={form.accent} fg2={form.accent2} eyes={form.character_eyes} size={34} />
                  <span className="mt-1 block text-xs text-faint">header</span>
                </div>
                <p className="flex-1 text-sm text-muted">
                  A picture you upload is still used anywhere bigger. Here it is replaced, because these are the
                  two sizes where a silhouette beats an illustration.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="Who answers" hint="The mascot can answer on its own, or be a way of reaching you and nothing more.">
        <div className="grid gap-4">
          <Field label="Mode">
            <select className={inputClass} value={form.mode} onChange={(e) => set("mode", e.target.value as MascotWrite["mode"])}>
              <option value="ai">Answer questions, and let us take over</option>
              <option value="human">Take messages only, we answer everything</option>
            </select>
          </Field>
          <Field label="What it says when it needs a person" hint="In message-only mode this is the whole reply a visitor gets.">
            <textarea
              className={inputClass}
              rows={2}
              value={form.handoff_message}
              onChange={(e) => set("handoff_message", e.target.value)}
            />
          </Field>
          <Field label="Booking link" hint="Offered to anyone who wants to meet. Optional.">
            <input
              className={inputClass}
              placeholder="https://cal.com/…"
              value={form.booking_url ?? ""}
              onChange={(e) => set("booking_url", e.target.value || null)}
            />
          </Field>
          {form.mode === "ai" && (
            <Field label="House rules" hint="Anything it should always or never say. Added to every answer it writes.">
              <textarea
                className={inputClass}
                rows={4}
                value={form.ai_instructions}
                onChange={(e) => set("ai_instructions", e.target.value)}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card title="Limits" hint="What stops a copied snippet from running up your bill on somebody else's website.">
        <div className="grid gap-4">
          <Field
            label="Websites allowed to use it"
            hint="One domain per line. Nothing here means it answers nowhere, which is the safe default, not a bug."
          >
            <textarea
              className={inputClass}
              rows={3}
              placeholder="acme.com"
              value={form.allowed_origins.join("\n")}
              onChange={(e) =>
                set("allowed_origins", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20))
              }
            />
          </Field>
          <Field label="Answers per day" hint="Past this it stops answering and starts taking messages until tomorrow.">
            <input
              type="number"
              min={0}
              className={`${inputClass} tnum`}
              value={form.daily_reply_cap}
              onChange={(e) => set("daily_reply_cap", Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          {form.allowed_origins.length === 0 && (
            <p className="rounded-md bg-warning-tint px-3 py-2 text-sm text-warning">
              Add the website this belongs on, or the widget will refuse every visitor.
            </p>
          )}
        </div>
      </Card>

      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="button" className={primaryClass} onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? "Saving" : "Save changes"}
        </button>
        <button type="button" className={quietClass} onClick={() => setConfirming(true)}>
          Delete this mascot
        </button>
      </div>

      {confirming && (
        <Confirm
          title={`Delete ${mascot.name}?`}
          body={`Every conversation ${mascot.name} had, and everything it knows, goes with it. The snippet already on your site will stop working. This cannot be undone.`}
          confirmLabel="Delete it"
          onConfirm={() => {
            setConfirming(false);
            void onDelete();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function strip(m: Mascot): MascotWrite {
  const { id: _id, key: _key, created_at: _created, ...rest } = m;
  return rest;
}
