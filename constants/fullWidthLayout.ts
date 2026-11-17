/** Horizontal layout within the current screen or presented modal frame. */
export function fullWidthBarOffset(viewportX: number, viewportWidth: number, anchorX: number, anchorWidth: number) {
  if (![viewportX,viewportWidth,anchorX,anchorWidth].every(Number.isFinite) || viewportWidth <= 0 || anchorWidth <= 0) return 0;
  // Full-screen onboarding pages can be laid out one or more viewports away.
  const pageX = ((anchorX-viewportX) % viewportWidth + viewportWidth) % viewportWidth;
  return Math.min(Math.max(0,viewportWidth-anchorWidth),pageX);
}
