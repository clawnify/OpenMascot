// The model's output is parsed, never echoed. These cases are the shapes a
// model actually returns when it does not follow instructions.

import { describe, expect, it } from "vitest";
import { buildContext, defaultSuggestions, parseAnswer } from "./ai.js";

describe("parseAnswer", () => {
  it("reads the shape it was asked for", () => {
    expect(parseAnswer('{"reply":"We ship on Tuesdays.","handoff":false}')).toEqual({
      reply: "We ship on Tuesdays.",
      handoff: false,
    });
  });

  it("survives a code fence", () => {
    expect(parseAnswer('```json\n{"reply":"Hi","handoff":true}\n```')).toEqual({ reply: "Hi", handoff: true });
  });

  it("treats bare prose as an answer rather than losing it", () => {
    expect(parseAnswer("We are open until six.")).toEqual({ reply: "We are open until six.", handoff: false });
  });

  it("hands off when there is nothing usable", () => {
    expect(parseAnswer("").handoff).toBe(true);
    expect(parseAnswer('{"reply":"","handoff":false}').handoff).toBe(true);
    expect(parseAnswer("{ broken").handoff).toBe(true);
  });

  it("only trusts a literal true for handoff", () => {
    expect(parseAnswer('{"reply":"Hi","handoff":"yes"}').handoff).toBe(false);
  });
});

describe("buildContext", () => {
  it("keeps every source while there is room", () => {
    const out = buildContext([
      { title: "Pricing", url: null, content: "From 100 euro." },
      { title: "Hours", url: "https://acme.com/hours", content: "Nine to five." },
    ]);
    expect(out).toContain("## Pricing");
    expect(out).toContain("From 100 euro.");
    expect(out).toContain("https://acme.com/hours");
  });

  it("stops at the budget instead of sending a novel", () => {
    const huge = { title: "Long", url: null, content: "x".repeat(40_000) };
    const out = buildContext([huge, { title: "Never", url: null, content: "should not appear" }]);
    expect(out.length).toBeLessThan(25_000);
    expect(out).not.toContain("should not appear");
  });
});

describe("defaultSuggestions", () => {
  it("falls back so the widget is never blank", () => {
    expect(defaultSuggestions("[]").length).toBeGreaterThan(0);
    expect(defaultSuggestions(null).length).toBeGreaterThan(0);
    expect(defaultSuggestions("not json").length).toBeGreaterThan(0);
  });

  it("uses what the owner wrote when there is any", () => {
    expect(defaultSuggestions('["Do you ship to Belgium?"]')).toEqual(["Do you ship to Belgium?"]);
  });
});
