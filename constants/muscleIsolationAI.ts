import { ProgressPhoto } from '@/constants/workoutStorage';
import { aiRequest } from '@/constants/aiServer';

export type MuscleGroupTarget = 'abs' | 'chest' | 'arms' | 'shoulders' | 'back' | 'legs';

export interface MuscleCropBox {
  // Relative to the photo (0..1)
  x: number;
  y: number;
  width: number;
  height: number;
  zoomScale: number;
}

export interface MuscleAnalysisPhotoResult {
  photoId: string;
  photoUri: string;
  date: string;
  cropBox: MuscleCropBox;
  /** Relative surface detail across this user's photos (0-100); null when not measurable. */
  definitionScore: number | null;
  /** Not measurable from a photo; always null (kept for compatibility). */
  vascularityScore: number | null;
  hasMuscleVisibility: boolean;
  label: string;
  reason?: string | null;
}

export interface MuscleGroupIsolationResult {
  muscleGroup: MuscleGroupTarget;
  groupLabel: string;
  summary: string;
  photos: MuscleAnalysisPhotoResult[];
  scoreMeaning?: string;
  offline?: boolean;
  /** abs only, when body stats were passed: derived from the DXA-trained body-fat model. */
  absVisibility?: {
    absVisibility: string;
    absVisibleProbability: number;
    bodyFatForVisibleAbs: number;
    clearlyVisibleBelow: number;
    method: string;
  };
  bodyFatPercent?: number;
}

/** Optional body stats; with them the abs analysis also reports how likely visible abs are. */
export interface MuscleBodyStats {
  gender: string;
  age?: number;
  heightCm: number;
  weightKg: number;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
  athleticLevel?: string;
}

export const MUSCLE_GROUPS_CONFIG: {
  id: MuscleGroupTarget;
  label: string;
  icon: string;
  description: string;
  defaultBox: MuscleCropBox;
}[] = [
  { id: 'abs', label: 'Abs & Core', icon: 'grid-outline', description: 'Rectus abdominis, obliques & midsection', defaultBox: { x: 0.22, y: 0.35, width: 0.56, height: 0.28, zoomScale: 2.1 } },
  { id: 'chest', label: 'Chest', icon: 'shield-outline', description: 'Pectoralis major, upper chest & sternum line', defaultBox: { x: 0.20, y: 0.22, width: 0.60, height: 0.22, zoomScale: 2.2 } },
  { id: 'arms', label: 'Arms & Biceps', icon: 'barbell-outline', description: 'Biceps peak, triceps lateral head & forearms', defaultBox: { x: 0.10, y: 0.24, width: 0.80, height: 0.30, zoomScale: 1.8 } },
  { id: 'shoulders', label: 'Shoulders & Delts', icon: 'fitness-outline', description: 'Lateral, anterior & posterior deltoids', defaultBox: { x: 0.14, y: 0.16, width: 0.72, height: 0.20, zoomScale: 2.0 } },
  { id: 'back', label: 'Back & Lats', icon: 'layers-outline', description: 'Latissimus dorsi, traps & rear taper', defaultBox: { x: 0.18, y: 0.20, width: 0.64, height: 0.35, zoomScale: 1.9 } },
  { id: 'legs', label: 'Quads & Legs', icon: 'walk-outline', description: 'Quadriceps sweep, tear drop & calves', defaultBox: { x: 0.20, y: 0.55, width: 0.60, height: 0.38, zoomScale: 1.7 } },
];

const MAX_PHOTOS = 12;
const MAX_TOTAL_BASE64 = 12_000_000;

async function readBase64(uri: string): Promise<string | null> {
  try {
    // SDK 54+ object API
    const fs: any = require('expo-file-system');
    if (fs?.File) {
      const file = new fs.File(uri);
      if (typeof file.base64 === 'function') return await file.base64();
    }
  } catch {}
  try {
    const legacy: any = require('expo-file-system/legacy');
    return await legacy.readAsStringAsync(uri, { encoding: 'base64' });
  } catch {}
  return null;
}

/**
 * Finds the selected muscle group in each progress photo with the AI server
 * (pose landmarks), crops to it, and reports which photos actually show it.
 * Photos are never "scored" without being analysed: if the server is
 * unreachable, every photo is returned unscored with an explanation.
 */
export async function isolateMuscleGroupAcrossPhotos(
  photos: ProgressPhoto[],
  muscle: MuscleGroupTarget,
  body?: MuscleBodyStats
): Promise<MuscleGroupIsolationResult> {
  const cfg = MUSCLE_GROUPS_CONFIG.find((m) => m.id === muscle) || MUSCLE_GROUPS_CONFIG[0];
  const sorted = [...photos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recent = sorted.slice(-MAX_PHOTOS);

  const payload: { id: string; date: string; image: string }[] = [];
  let total = 0;
  for (const p of recent) {
    const b64 = await readBase64(p.uri);
    if (!b64) continue;
    if (total + b64.length > MAX_TOTAL_BASE64) break;
    total += b64.length;
    payload.push({ id: p.id, date: p.date, image: b64 });
  }

  const unscored = (reason: string, offline = false): MuscleGroupIsolationResult => ({
    muscleGroup: muscle,
    groupLabel: cfg.label,
    summary: reason,
    offline,
    photos: [],
  });
  if (!payload.length) return unscored('Could not read the progress photos on this device.');

  const res = await aiRequest<any>('analyze_muscle', { muscle, photos: payload, ...(body ? { body } : {}) }, 45000);
  if (!res.ok || !res.data) return unscored(res.error || 'Muscle analysis is unavailable right now.', !!res.offline);

  const byId = new Map(recent.map((p) => [p.id, p]));
  const results: MuscleAnalysisPhotoResult[] = [];
  for (const r of res.data.photos || []) {
    const p = byId.get(r.photoId);
    if (!p || !r.hasMuscleVisibility || !r.cropBox) continue;
    results.push({
      photoId: p.id,
      photoUri: p.uri,
      date: p.date,
      cropBox: r.cropBox,
      definitionScore: typeof r.definitionScore === 'number' ? r.definitionScore : null,
      vascularityScore: null,
      hasMuscleVisibility: true,
      label: cfg.label,
      reason: null,
    });
  }
  return {
    muscleGroup: muscle,
    groupLabel: cfg.label,
    summary: res.data.summary || `${results.length} of ${payload.length} photos show the ${cfg.label.toLowerCase()}`,
    scoreMeaning: res.data.scoreMeaning,
    photos: results,
    absVisibility: res.data.absVisibility,
    bodyFatPercent: res.data.bodyFatPercent,
  };
}
