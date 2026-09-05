/**
 * How much room a cover photo is allowed, worked out from the shape we stored.
 *
 * The width is always the column's — filling it is the browser's job, and
 * leaving it to CSS intrinsic sizing (w-auto) made the layout follow whichever
 * srcSet candidate happened to be downloaded, so a 900px original rendered
 * 768px wide and sat narrower than the column around it.
 *
 * The only thing worth overriding is a portrait photo, which at full column
 * width would stand over a thousand pixels tall and push the article off the
 * screen. It is held to a readable height instead — expressed as a maximum
 * WIDTH, because capping the height of an image that is filling its width
 * either squashes it or strands it between two bars.
 */

/** Roughly a laptop's worth of height, leaving the headline and lead visible. */
export const TALLEST_COVER = 640;

export function coverMaxWidth(
  width: number,
  height: number,
): number | undefined {
  // Landscape and square fill the column: at that width they are never tall
  // enough to be in the way.
  if (height <= width) return undefined;
  // Nonsense dimensions are treated as unknown rather than turned into a
  // maxWidth of 0, which would render the cover invisible.
  if (width <= 0 || height <= 0) return undefined;
  return Math.round(TALLEST_COVER * (width / height));
}
