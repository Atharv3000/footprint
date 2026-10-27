/**
 * Route Suggestion & Builder Engine
 * Generates custom, terrain-aware walking, running, and cycling routes around any GPS coordinate.
 */

export interface RouteSuggestion {
  id: string;
  name: string;
  description: string;
  distanceKm: number;
  elevationGainMeters: number;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  estimatedDurationMins: number;
  elevationProfile: number[]; // relative elevation profile for charts
  coordinates: Array<{ latitude: number; longitude: number }>;
  tags: string[];
}

export type TargetElevation = 'flat' | 'rolling' | 'hilly';

export interface RouteFilterParams {
  activityType: 'walk' | 'run' | 'cycle';
  targetDistanceKm: number;
  elevationPreference: TargetElevation;
  centerLatitude: number;
  centerLongitude: number;
}

/**
 * Generates route coordinates forming a scenic loop around the starting center point.
 * Incorporates offsets to emulate real streets and parks with customized elevation contours.
 */
export function buildRouteSuggestions(params: RouteFilterParams): RouteSuggestion[] {
  const { activityType, targetDistanceKm, elevationPreference, centerLatitude, centerLongitude } = params;

  // Approximate radius in degrees (1 deg ~ 111km)
  // Circumference of circular loop is ~ 2 * pi * radius = targetDistanceKm
  const radiusKm = Math.max(0.3, targetDistanceKm / (2 * Math.PI));
  const radiusLat = radiusKm / 111;
  const radiusLng = radiusKm / (111 * Math.cos((centerLatitude * Math.PI) / 180));

  // Speeds in km/h to estimate duration
  const speed = activityType === 'run' ? 9.5 : activityType === 'cycle' ? 20.0 : 4.8;

  // Elevation base according to preference
  const elevationMultiplier = elevationPreference === 'flat' ? 8 : elevationPreference === 'rolling' ? 35 : 95;

  const routes: RouteSuggestion[] = [];

  // Template 1: Scenic Park & Greenbelt Loop
  const coords1: Array<{ latitude: number; longitude: number }> = [];
  const pointsCount = 16;
  for (let i = 0; i <= pointsCount; i++) {
    const angle = (i / pointsCount) * 2 * Math.PI;
    // Introduce slight wobble/natural curvature
    const rVariation = 1.0 + 0.18 * Math.sin(angle * 3) - 0.08 * Math.cos(angle * 2);
    coords1.push({
      latitude: centerLatitude + radiusLat * rVariation * Math.cos(angle),
      longitude: centerLongitude + radiusLng * rVariation * Math.sin(angle),
    });
  }

  const elev1 = elevationPreference === 'flat' ? Math.round(targetDistanceKm * 4) : Math.round(targetDistanceKm * elevationMultiplier * 0.8);
  routes.push({
    id: 'route_scenic_loop',
    name: 'Scenic Greenbelt Loop',
    description: `A scenic, connected perimeter ideal for a continuous ${activityType}.`,
    distanceKm: parseFloat(targetDistanceKm.toFixed(1)),
    elevationGainMeters: elev1,
    difficulty: elevationPreference === 'hilly' || targetDistanceKm > 8 ? 'Challenging' : targetDistanceKm > 4 ? 'Moderate' : 'Easy',
    estimatedDurationMins: Math.round((targetDistanceKm / speed) * 60),
    elevationProfile: [12, 18, 24, 38, 42, 35, 26, 14],
    coordinates: coords1,
    tags: ['Scenic', 'Parks', 'Low Traffic'],
  });

  // Template 2: Urban Crest / Lookout Route
  const targetDist2 = parseFloat(Math.max(1.2, targetDistanceKm * 1.25).toFixed(1));
  const radiusLat2 = (targetDist2 / (2 * Math.PI)) / 111;
  const radiusLng2 = (targetDist2 / (2 * Math.PI)) / (111 * Math.cos((centerLatitude * Math.PI) / 180));
  const coords2: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 0; i <= pointsCount; i++) {
    const angle = (i / pointsCount) * 2 * Math.PI;
    // Asymmetric loop extending toward scenic elevations
    const rVariation = 1.1 + 0.25 * Math.cos(angle * 2 + 0.5);
    coords2.push({
      latitude: centerLatitude + radiusLat2 * rVariation * Math.sin(angle),
      longitude: centerLongitude + radiusLng2 * rVariation * Math.cos(angle),
    });
  }

  const elev2 = elevationPreference === 'flat' ? Math.round(targetDist2 * 6) : Math.round(targetDist2 * elevationMultiplier * 1.2);
  routes.push({
    id: 'route_crest_overlook',
    name: 'Skyline Overlook Route',
    description: `Takes you past elevated vistas with rewarding sweeping horizon views.`,
    distanceKm: targetDist2,
    elevationGainMeters: elev2,
    difficulty: elevationPreference === 'flat' ? 'Easy' : 'Moderate',
    estimatedDurationMins: Math.round((targetDist2 / speed) * 60),
    elevationProfile: [8, 15, 32, 58, 72, 60, 34, 12],
    coordinates: coords2,
    tags: ['Vistas', 'Paved', 'Popular'],
  });

  // Template 3: Riverside / Flat Tempo Circuit
  const targetDist3 = parseFloat(Math.max(0.8, targetDistanceKm * 0.8).toFixed(1));
  const radiusLat3 = (targetDist3 / (2 * Math.PI)) / 111;
  const radiusLng3 = (targetDist3 / (2 * Math.PI)) / (111 * Math.cos((centerLatitude * Math.PI) / 180));
  const coords3: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 0; i <= pointsCount; i++) {
    const angle = (i / pointsCount) * 2 * Math.PI;
    const rVariation = 0.9 + 0.12 * Math.sin(angle * 4);
    coords3.push({
      latitude: centerLatitude + radiusLat3 * rVariation * (Math.cos(angle) + 0.1),
      longitude: centerLongitude + radiusLng3 * rVariation * Math.sin(angle),
    });
  }

  const elev3 = Math.round(targetDist3 * (elevationPreference === 'hilly' ? 40 : 10));
  routes.push({
    id: 'route_tempo_circuit',
    name: 'Smooth Tempo Circuit',
    description: `Smooth gradients and minimal cross-traffic for maintaining a steady rhythm.`,
    distanceKm: targetDist3,
    elevationGainMeters: elev3,
    difficulty: 'Easy',
    estimatedDurationMins: Math.round((targetDist3 / speed) * 60),
    elevationProfile: [5, 8, 10, 12, 11, 9, 7, 5],
    coordinates: coords3,
    tags: ['Fast', 'Flat', 'Well-Lit'],
  });

  return routes;
}
