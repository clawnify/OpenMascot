// The dashboard deep-links by loading the app at a path and restores that path
// on reload, so "which screen does this path mean" is a real contract, not an
// internal detail. It shipped wrong once: the app always booted to its home
// screen, so ?at=/knowledge rendered Overview with /knowledge in the URL.

import { describe, expect, it } from "vitest";

type View = "overview" | "inbox" | "knowledge" | "settings";
const PATHS: Record<View, string> = {
  overview: "/",
  inbox: "/inbox",
  knowledge: "/knowledge",
  settings: "/settings",
};

/** Mirrors app.tsx. Kept pure here so it can be tested without a DOM. */
function viewFor(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/";
  const hit = (Object.keys(PATHS) as View[]).find((v) => PATHS[v] === path);
  return hit ?? "overview";
}

describe("viewFor", () => {
  it("opens the screen the dashboard asked for", () => {
    expect(viewFor("/knowledge")).toBe("knowledge");
    expect(viewFor("/inbox")).toBe("inbox");
    expect(viewFor("/settings")).toBe("settings");
  });

  it("treats the root as the home screen", () => {
    expect(viewFor("/")).toBe("overview");
    expect(viewFor("")).toBe("overview");
  });

  it("ignores a trailing slash, which a host may or may not send", () => {
    expect(viewFor("/knowledge/")).toBe("knowledge");
    expect(viewFor("/inbox//")).toBe("inbox");
  });

  it("falls back to home rather than rendering nothing", () => {
    expect(viewFor("/does-not-exist")).toBe("overview");
    expect(viewFor("/knowledge/extra")).toBe("overview");
  });

  it("round-trips every screen through its own path", () => {
    for (const v of Object.keys(PATHS) as View[]) expect(viewFor(PATHS[v])).toBe(v);
  });
});
