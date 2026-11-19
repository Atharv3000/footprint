const DEMO_EMAIL = 'alex.mercer@stridetrack.app';
export function isDemoAccount(userId: string): boolean { return userId.trim().toLowerCase() === DEMO_EMAIL; }
type RecordKind = 'workouts' | 'walks' | 'weights' | 'bodyFat' | 'photos';
/** Remove only identifiable samples; ordinary saved entries retain their original IDs and values. */
export function cleanAccountRecords<T extends { id: string; userId: string }>(userId: string, kind: RecordKind, records: T[]): T[] {
  if (!Array.isArray(records)) return [];
  return records.filter(record => {
    if (record.userId !== userId) return false;
    if (isDemoAccount(userId)) return true;
    const id = record.id;
    if (kind === 'workouts') return !/^demo_\d+$/.test(id);
    if (kind === 'walks') return !/^walk_demo_\d+$/.test(id);
    if (kind === 'weights') return !/^w_[1-5]$/.test(id);
    if (kind === 'bodyFat') return !/^bf_[1-3]$/.test(id);
    return !/^demo_photo_(recent|before)$/.test(id) && !/^demo_progress_photo_/.test(id);
  });
}
