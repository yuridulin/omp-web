/**
 * The omp icon: the Pi glyph on its dark tile. It reuses the favicon so the
 * rail brand and the browser tab cannot drift apart.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <img src="/favicon.svg" width={size} height={size} alt="" aria-hidden="true" draggable={false} />
  );
}
