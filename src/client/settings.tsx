// Who the mascot is, where it may live, and what it is allowed to spend.

import { useEffect, useState } from "react";
import type { Mascot, MascotWrite } from "./api";
import { Card, Confirm, Field, inputClass, primaryClass, quietClass } from "./ui";

const LOCALES = ["en", "nl", "de", "fr", "es", "it"];

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
