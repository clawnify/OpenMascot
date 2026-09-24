// The shell: which mascot you are looking at, and which of its four screens.

import { useEffect, useState } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { api, type Mascot, type MascotWrite, type Overview } from "./api";
import { Card, Empty, Field, inputClass, primaryClass, Pill } from "./ui";
import { Inbox } from "./inbox";
import { Knowledge } from "./knowledge";
import { Settings } from "./settings";

type View = "overview" | "inbox" | "knowledge" | "settings";

const PATHS: Record<View, string> = {
  overview: "/",
  inbox: "/inbox",
  knowledge: "/knowledge",
  settings: "/settings",
};

export function App() {
  const [mascots, setMascots] = useState<Mascot[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [list, counts] = await Promise.all([api.mascots(), api.overview()]);
        setMascots(list.mascots);
        setCurrent(list.mascots[0]?.id ?? null);
        setOverview(counts);
      } catch (e) {
        setError((e as Error).message);
        setMascots([]);
      }
    })();
  }, []);

  function go(next: View) {
    setView(next);
    reportLocation(PATHS[next]);
  }

  const mascot = mascots?.find((m) => m.id === current) ?? null;

  const nav: AppNavItem[] = [
    { id: "overview", label: "Overview", href: "/", home: true },
    { id: "inbox", label: "Conversations", href: "/inbox", icon: "message-square", color: "blue", count: overview?.waiting },
    { id: "knowledge", label: "What it knows", href: "/knowledge", icon: "book-open", color: "violet" },
    { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav
        title="OpenMascot"
        icon="message-square"
        groups={[{ items: nav }]}
        active={view}
        onNavigate={(item) => go(item.id as View)}
      />

      <main className="min-w-0 flex-1 p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em]">
              {view === "overview" ? "Overview" : view === "inbox" ? "Conversations" : view === "knowledge" ? "What it knows" : "Settings"}
            </h1>
            <p className="mt-1 text-sm text-muted">{SUBTITLE[view]}</p>
          </div>
          {mascots && mascots.length > 1 && (
            <select
              className={`${inputClass} w-auto`}
              value={current ?? ""}
              onChange={(e) => setCurrent(e.target.value)}
              aria-label="Which mascot"
            >
              {mascots.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <div className="mt-6 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>}

        <div className="mt-6">
          {mascots === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !mascot ? (
            <FirstMascot
              onCreated={(m) => {
                setMascots([m]);
                setCurrent(m.id);
                go("knowledge");
              }}
              onError={setError}
            />
          ) : view === "overview" ? (
            <OverviewScreen mascot={mascot} counts={overview} onGo={go} />
          ) : view === "inbox" ? (
            <Inbox mascotId={mascot.id} onError={setError} />
          ) : view === "knowledge" ? (
            <Knowledge mascotId={mascot.id} onError={setError} />
          ) : (
            <Settings
              mascot={mascot}
              origin={window.location.origin}
              onSave={async (body) => {
                const saved = await api.updateMascot(mascot.id, body);
                setMascots((list) => (list ?? []).map((m) => (m.id === saved.id ? saved : m)));
              }}
              onDelete={async () => {
                await api.deleteMascot(mascot.id);
                const left = (mascots ?? []).filter((m) => m.id !== mascot.id);
                setMascots(left);
                setCurrent(left[0]?.id ?? null);
                go("overview");
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

const SUBTITLE: Record<View, string> = {
  overview: "Who is on your site, and what they are asking.",
  inbox: "Every conversation, and the ones waiting on a person.",
  knowledge: "Everything it is allowed to say comes from here.",
  settings: "Who it is, where it lives, and what it may spend.",
};

function OverviewScreen({
  mascot,
  counts,
  onGo,
}: {
  mascot: Mascot;
  counts: Overview | null;
  onGo: (view: View) => void;
}) {
  const ready = mascot.allowed_origins.length > 0;
  return (
    <div className="grid gap-5">
      <Card
        title={mascot.name}
        hint={mascot.mode === "ai" ? "Answers on its own, and you can take any conversation over." : "Takes messages. Every reply is yours."}
        action={<Pill tone={ready ? "success" : "warning"}>{ready ? "Live" : "Not installed"}</Pill>}
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Conversations today", value: counts?.conversations_today },
            { label: "Answered today", value: counts?.replies_today },
            { label: "Waiting on a person", value: counts?.waiting },
            { label: "Left an email", value: counts?.leads },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-muted">{s.label}</dt>
              {/* data-lg: the KPI value is 32px semibold, per DESIGN.md typography. */}
              <dd className="mt-0.5 text-[2rem] leading-[1.1] font-semibold tnum">{s.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {!ready && (
        <Card title="One thing left" hint="It will not answer anyone until you tell it which website it belongs on.">
          <button type="button" className={primaryClass} onClick={() => onGo("settings")}>
            Add your website
          </button>
        </Card>
      )}

      <Card title="How it behaves" hint="The rules it follows, whatever a visitor asks.">
        <ul className="grid gap-2 text-sm text-muted">
          <li>It answers only from what you put in “What it knows”. It never fills a gap with a guess.</li>
          <li>When it does not know, or somebody asks for a person, the conversation moves to Conversations and waits for you.</li>
          <li>Once you reply in a conversation, it stays quiet there until you hand it back.</li>
          <li>
            After {mascot.daily_reply_cap} answers in a day it stops answering and takes messages instead, so a copied snippet
            cannot run up your bill.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function FirstMascot({ onCreated, onError }: { onCreated: (m: Mascot) => void; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const body: MascotWrite = {
        name: name.trim(),
        tagline: "",
        greeting: `Hi, I'm ${name.trim()}. Ask me anything.`,
        accent: "#4f46e5",
        accent2: null,
        // A new install gets a character by default. The empty shape exists for
        // installs that predate this and already have an avatar, not for new ones.
        character_shape: "circle",
        character_eyes: true,
        avatar_url: null,
        mode: "ai",
        suggested: [],
        booking_url: null,
        handoff_message: "",
        allowed_origins: domain.trim() ? [domain.trim()] : [],
        ai_instructions: "",
        daily_reply_cap: 200,
        locale: "en",
      };
      onCreated(await api.createMascot(body));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Name your mascot" hint="The character that greets everyone who lands on your site.">
      <Empty
        title="Nothing here yet"
        hint="Give it a name and the website it belongs on. You can change everything afterwards, including which questions it is good at."
      />
      <div className="mt-4 grid max-w-md gap-3">
        <Field label="What is it called">
          <input className={inputClass} placeholder="Pip" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Which website" hint="Only this site may use it.">
          <input className={inputClass} placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </Field>
        <div>
          <button type="button" className={primaryClass} onClick={() => void create()} disabled={busy || !name.trim()}>
            Create it
          </button>
        </div>
      </div>
    </Card>
  );
}
