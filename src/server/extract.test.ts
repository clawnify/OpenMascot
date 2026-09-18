import { describe, expect, it } from "vitest";
import { htmlToText, titleOf } from "./extract.js";

describe("htmlToText", () => {
  it("drops scripts and styles rather than quoting them at visitors", () => {
    const out = htmlToText("<style>.a{color:red}</style><p>Hello</p><script>alert(1)</script>");
    expect(out).toBe("Hello");
  });

  it("keeps words apart across block boundaries", () => {
    // A paragraph break rather than a single newline: the model reads this, and
    // a visible gap between two sections is structure it can use.
    expect(htmlToText("<h1>Pricing</h1><h2>Contact</h2>")).toBe("Pricing\n\nContact");
  });

  it("never runs two headings together", () => {
    expect(htmlToText("<h1>Pricing</h1><h2>Contact</h2>")).not.toContain("PricingContact");
  });

  it("decodes the entities a marketing page actually contains", () => {
    expect(htmlToText("<p>Tom &amp; Jerry&#39;s</p>")).toBe("Tom & Jerry's");
  });

  it("collapses the whitespace a template engine leaves behind", () => {
    // However much the source sprawls, the output never exceeds one blank line.
    expect(htmlToText("<p>a</p>\n\n\n\n<p>b</p>")).toBe("a\n\nb");
    expect(htmlToText("<p>a</p>" + "\n".repeat(40) + "<p>b</p>")).toBe("a\n\nb");
  });
});

describe("titleOf", () => {
  it("prefers the page's own title", () => {
    expect(titleOf("<title> Acme  Pricing </title>", "fallback")).toBe("Acme Pricing");
  });

  it("falls back when there is none", () => {
    expect(titleOf("<p>no title here</p>", "acme.com/pricing")).toBe("acme.com/pricing");
  });
});
