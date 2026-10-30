/**
 * The Jobvance J mark: one master geometry. The header, footer, product mocks and the generated icons
 * (public/favicon.svg, public/icon-mono.svg, see scripts/generate-brand-svgs.mjs) all read these values.
 * Optical sizing is deliberate: the heavy variant is for 32px and below (header, favicon), the light one for 48px and up.
 */
export const BRAND_MARK = {
  viewBox: '0 0 40 40',
  /** translate(20 20) scale(1.3) translate(-17 -19): centres the glyph in the tile. */
  transform: 'translate(20 20) scale(1.3) translate(-17 -19)',
  /** The hook stops one unit short of the dot (its end is at 10.07, 23), so at 32px and below the knockout ring never bites the tail into a lump. */
  hook: 'M24 9v13a7 7 0 0 1-13.93 1',
  bar: 'M17 9h7',
  dot: { cx: 10, cy: 22 },
  /** A tile-coloured ring under the signal dot so it reads as its own element, not a blob on the stroke. */
  knockoutExtra: 1.6,
  variants: {
    small: { stroke: 4.8, dotRadius: 3.4 },
    large: { stroke: 4.4, dotRadius: 3.2 },
  },
} as const;

export type BrandMarkVariant = keyof typeof BRAND_MARK.variants;
