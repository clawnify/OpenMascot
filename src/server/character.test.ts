import { describe, expect, it } from "vitest";
import { characterSvg, contrastOn, hasCharacter, SHAPES, SHAPE_KEYS } from "./character.js";

const base = { shape: "hex", fg: "#FAB939", fg2: "#D7B047", eye: "#1d1d1b", eyes: true };

describe("contrastOn", () => {
  it("puts ink on a light face and white on a dark one", () => {
    expect(contrastOn("#FAB939")).toBe("#1d1d1b"); // the marketplace yellow
    expect(contrastOn("#4f46e5")).toBe("#ffffff"); // a saturated indigo
    expect(contrastOn("#ffffff")).toBe("#1d1d1b");
    expect(contrastOn("#000000")).toBe("#ffffff");
  });

  it("falls to white on anything it cannot read", () => {
    expect(contrastOn("")).toBe("#ffffff");
    expect(contrastOn("rebeccapurple")).toBe("#ffffff");
    expect(contrastOn("#fff")).toBe("#ffffff");
  });
});

describe("hasCharacter", () => {
  it("is off until a real shape is chosen", () => {
    expect(hasCharacter({ ...base, shape: "" })).toBe(false);
    expect(hasCharacter({ ...base, shape: "nonsense" })).toBe(false);
    expect(hasCharacter(base)).toBe(true);
  });
});

describe("characterSvg", () => {
  it("draws the chosen silhouette with both faces and eyes", () => {
    const svg = characterSvg(base, 56, "a1");
    expect(svg).toContain(SHAPES.hex.d);
    expect(svg).toContain("#FAB939");
    expect(svg).toContain("#D7B047");
    expect(svg).toContain("om-eye");
    expect(svg).toContain('width="56"');
  });

  it("omits the second face and the eyes when they are not wanted", () => {
    const svg = characterSvg({ ...base, fg2: null, eyes: false }, 34, "a2");
    expect(svg).not.toContain("#D7B047");
    expect(svg).not.toContain("om-eye");
  });

  it("gives each instance its own clip id, so two on one page do not collide", () => {
    expect(characterSvg(base, 56, "a1")).toContain("om-clip-a1");
    expect(characterSvg(base, 34, "a2")).toContain("om-clip-a2");
  });

  it("returns nothing for an unknown shape rather than a broken tag", () => {
    expect(characterSvg({ ...base, shape: "nope" }, 56, "a1")).toBe("");
  });

  it("strips characters that would break out of the attribute", () => {
    const svg = characterSvg({ ...base, fg: '#fff" onload="alert(1)' }, 56, "a1");
    expect(svg).not.toContain("onload=\"");
    expect(svg).not.toContain("<script");
  });

  it("every house shape renders and carries eyes", () => {
    for (const shape of SHAPE_KEYS) {
      const svg = characterSvg({ ...base, shape }, 56, shape);
      expect(svg, shape).toContain("om-body");
      expect(svg, shape).toContain("om-eye");
    }
  });
});

describe("contrastOn, as the widget's foreground", () => {
  /** WCAG relative luminance, independently implemented so the test does not
   *  just re-run the code it is checking. */
  function lum(hex: string): number {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function ratio(a: string, b: string): number {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it("reaches AA large-text contrast on brand colours across the range", () => {
    // #FAB939 is the case that exposed this: white on it is about 1.9:1.
    for (const brand of ["#FAB939", "#4f46e5", "#0f766e", "#c2410c", "#facc15", "#111827", "#ffffff"]) {
      expect(ratio(brand, contrastOn(brand)), brand).toBeGreaterThanOrEqual(3);
    }
  });

  it("beats plain white on a light brand colour", () => {
    expect(ratio("#FAB939", contrastOn("#FAB939"))).toBeGreaterThan(ratio("#FAB939", "#ffffff"));
  });
});
