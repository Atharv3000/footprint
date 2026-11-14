/** Keep bottom-sheet headers below the status bar, even for explicit tall cards. */
export function sheetMaxHeight(height: number, top: number, requested?: unknown): number {
  const available = Math.max(0, height - Math.max(0, top) - 12);
  if (typeof requested === 'number' && Number.isFinite(requested)) return Math.max(0, Math.min(available, requested));
  if (typeof requested === 'string' && /^\d+(\.\d+)?%$/.test(requested)) {
    return Math.max(0, Math.min(available, height * parseFloat(requested) / 100));
  }
  return available;
}
