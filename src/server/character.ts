// The drawn character: a silhouette, a colour, and a pair of eyes.
//
// Deliberately procedural rather than an image. A widget avatar is 34px in the
// panel header and 56px in the launcher, and at those sizes an illustration is
// a smudge while a silhouette is a mark. It also means the character costs no
// extra request, stays crisp at any density, and can carry state by moving
// rather than by having a second badge pinned to it.
//
// Identity is exactly two things: which silhouette, and which colours. That is
// the whole reason this can be offered to the overwhelming majority of
// companies who have no mascot of their own — there is nothing to draw.

export interface CharacterSpec {
  /** Silhouette key. Empty means no character at all. */
  shape: string;
  /** Primary face colour. The mascot's own accent. */
  fg: string;
  /** Optional second face, painting the left half. Null for a flat colour. */
  fg2: string | null;
  /** Colour the eyes are knocked out in. */
  eye: string;
  eyes: boolean;
}

interface Silhouette {
  /** The outline. Authored on a 100x100 canvas. */
  d: string;
  /** Vertical placement of the eyes, and how tall they are at rest. */
  ey: number;
  eh: number;
}

/**
 * The house set.
 *
 * `hex` is a regular pointy-top hexagon, derived from its six vertices rather
 * than drawn by hand, so a company whose logo is a hexagon gets their own
 * geometry instead of an approximation of it.
 */
export const SHAPES: Record<string, Silhouette> = {
  circle: { d: "M50 9A41 41 0 1 1 50 91A41 41 0 1 1 50 9Z", ey: 41, eh: 15 },
  squircle: { d: "M36 10H64Q90 10 90 36V64Q90 90 64 90H36Q10 90 10 64V36Q10 10 36 10Z", ey: 41, eh: 15 },
  pill: { d: "M34 24H66Q92 24 92 50Q92 76 66 76H34Q8 76 8 50Q8 24 34 24Z", ey: 42, eh: 14 },
  hex: {
    d: "M44.80 11.00Q50.00 8.00 55.20 11.00L81.18 26.00Q86.37 29.00 86.37 35.00L86.37 65.00Q86.37 71.00 81.18 74.00L55.20 89.00Q50.00 92.00 44.80 89.00L18.82 74.00Q13.63 71.00 13.63 65.00L13.63 35.00Q13.63 29.00 18.82 26.00Z",
    ey: 42,
    eh: 13,
  },
  drop: { d: "M50 6Q46 6 44 10L20 52C10 70 22 92 50 92C78 92 90 70 80 52L56 10Q54 6 50 6Z", ey: 52, eh: 15 },
  shield: { d: "M38 16Q50 -2 62 16L88 62Q100 80 78 80L22 80Q0 80 12 62Z", ey: 52, eh: 14 },
};

export const SHAPE_KEYS = Object.keys(SHAPES);

/** Does this install draw a character at all? */
export function hasCharacter(spec: CharacterSpec): boolean {
  return spec.shape !== "" && spec.shape in SHAPES;
}

/**
 * One character, as inline SVG.
 *
 * Inline, and never a <defs> plus <use>: a <use> clones into a shadow tree that
 * document-level selectors cannot reach, so the CSS that animates `.body` and
 * `.eyes` silently never attaches and the character renders perfectly while
 * being completely dead. Verified the hard way.
 *
 * `uid` keeps each instance's clip path distinct, because the launcher and the
 * panel header both draw one on the same page.
 */
export function characterSvg(spec: CharacterSpec, size: number, uid: string): string {
  const s = SHAPES[spec.shape];
  if (!s) return "";
  const clip = `om-clip-${uid}`;
  const secondFace = spec.fg2
    ? `<g clip-path="url(#${clip})"><rect x="0" y="0" width="50" height="100" fill="${esc(spec.fg2)}"/></g>`
    : "";
  const eyes = spec.eyes
    ? `<g class="om-eyes" clip-path="url(#${clip})">` +
      `<rect class="om-eye" x="36.5" y="${s.ey}" width="7.5" height="${s.eh}" rx="${s.eh / 2}" fill="${esc(spec.eye)}"/>` +
      `<rect class="om-eye" x="56" y="${s.ey}" width="7.5" height="${s.eh}" rx="${s.eh / 2}" fill="${esc(spec.eye)}"/></g>`
    : "";
  return (
    `<svg class="om-ch" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<defs><clipPath id="${clip}"><path d="${s.d}"/></clipPath></defs>` +
    `<g class="om-body"><path d="${s.d}" fill="${esc(spec.fg)}"/>${secondFace}${eyes}</g></svg>`
  );
}

/**
 * What reads on top of this colour: ink on a light background, white on a dark
 * one.
 *
 * Used for the eyes knocked out of the character's face and for every surface
 * the widget paints in the brand colour. It is the same question in both cases
 * and it has one right answer, so the code answers it rather than asking the
 * owner to pick a second colour that works against the first. Getting it wrong
 * is not cosmetic: white on a light brand yellow is about 1.9:1, which fails
 * AA badly and is unreadable for anyone it fails.
 *
 * A malformed colour falls to white, the safer miss, because most brand colours
 * are dark enough to carry it.
 */
export function contrastOn(fg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  // Relative luminance, WCAG definition.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1d1d1b" : "#ffffff";
}

function esc(v: string): string {
  return v.replace(/[<>"'&]/g, "");
}
