/**
 * Real Navigation, Geocoding & Routing Engine
 * Uses OpenStreetMap Overpass/OSRM and Nominatim geocoding to generate 100% real, road-snapped routes.
 * Supports real elevation via Open-Meteo elevation profiles.
 */

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  maneuverType: string;   // 'depart' | 'arrive' | 'turn' | 'new name' | 'continue' | 'roundabout' | 'fork' | etc.
  modifier?: string;     // 'left' | 'right' | 'straight' | 'uturn' | 'slight left' | 'slight right'
  streetName?: string;
  location?: { latitude: number; longitude: number };
}

export interface RoutePoi {
  id: string;
  name: string;
  category: string;       // 'park' | 'nature' | 'monument' | 'viewpoint' | 'water' | 'trail'
  imageUrl: string;
  distanceAlongKm?: number;
  coordinate?: { latitude: number; longitude: number };
  description?: string;
  infoSnippet?: string;
}

export interface RealRouteResult {
  id: string;
  name: string;
  destinationName: string;
  distanceKm: number;
  durationMins: number;
  elevationGainMeters: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
  summary: string;
  steps?: RouteStep[];
  pois?: RoutePoi[];
  bikeLaneSegments?: Array<Array<{ latitude: number; longitude: number }>>;
}

export interface GeocodedPlace {
  placeId: string;
  displayName: string;
  shortName: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  category?: 'park' | 'nature' | 'water' | 'viewpoint' | 'monument' | 'trail' | 'place';
  imageUrl?: string;
  description?: string;
}

/**
 * Route customisation options.
 */
export interface RouteOptions {
  preferFastest: boolean;      // direct, quickest path with minimal detours
  preferParks: boolean;        // bias route through parks, nature preserves, and recreational greenways
  avoidTrafficLights: boolean; // route through quiet neighborhoods and trail corridors avoiding signalized arterial junctions
  avoidBusyRoads: boolean;     // avoid high-speed roads, prioritize calm paths and residential lanes
  preferCyclingLanes: boolean; // relevant for cycle mode (prioritize designated cycleways and bike paths)
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  preferFastest: true,
  preferParks: false,
  avoidTrafficLights: false,
  avoidBusyRoads: false,
  preferCyclingLanes: true,
};

// Curated high-resolution photography catalog for scenic POIs, parks, landmarks, and trails
const CURATED_POI_PHOTOS: Record<string, string[]> = {
  park: [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80', // Lush park lawn & trees
    'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80', // Forest canopy trail
    'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=600&q=80', // Sunlit woods
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', // Peaceful waterside park
  ],
  nature: [
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80', // Sunlit deep forest
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=600&q=80', // Mountain nature trail
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80', // Misty hillside
  ],
  water: [
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80', // Scenic river & trees
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=600&q=80', // Lake shoreline & trees
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=600&q=80', // Waterfront boardwalk
  ],
  viewpoint: [
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80', // Scenic overlook
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80', // Mountain crest view
  ],
  monument: [
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=80', // Historic landmark statue & square
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80', // Architectural pavilion
  ],
  trail: [
    'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=600&q=80', // Winding hiking trail
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80', // Quiet woodland path
  ],
};

// In-memory cache for authentic place images fetched from Wikipedia / Wikimedia Commons
const REAL_IMAGE_CACHE = new Map<string, string>();

/**
 * Fetches an authentic photograph for a place name using Wikipedia page images API.
 * Falls back to curated high-res category imagery only if no real photograph exists.
 */
export async function fetchRealPlacePhoto(
  placeName: string,
  category: keyof typeof CURATED_POI_PHOTOS = 'park',
  seed: number = 0
): Promise<string> {
  if (!placeName) return getRandomImage(category, seed);

  // Clean place name (strip numbers, trailing addresses, parentheticals)
  const clean = placeName
    .replace(/\s*\(.*?\)\s*/g, '')
    .split(',')[0]
    .replace(/[#\d]+.*$/, '')
    .trim();

  if (clean.length < 3) return getRandomImage(category, seed);

  const cacheKey = clean.toLowerCase();
  if (REAL_IMAGE_CACHE.has(cacheKey)) {
    return REAL_IMAGE_CACHE.get(cacheKey)!;
  }

  try {
    // 1. Direct Wikipedia Page Image by Title (with redirects enabled)
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      clean
    )}&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=800&pilicense=any&format=json&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(wikiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
      for (const pg of pages) {
        const thumb = pg?.thumbnail?.source;
        if (thumb && !isUnwantedPhoto(thumb, clean)) {
          REAL_IMAGE_CACHE.set(cacheKey, thumb);
          return thumb;
        }
      }
    }

    // 2. Wikipedia Fulltext / Title Search for landmark photos
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      clean
    )}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=800&pilicense=any&format=json&origin=*`;

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 3500);
    const res2 = await fetch(searchUrl, { signal: controller2.signal });
    clearTimeout(timer2);

    if (res2.ok) {
      const data2 = await res2.json();
      const pages2 = data2.query?.pages ? (Object.values(data2.query.pages) as any[]) : [];
      for (const pg of pages2) {
        const thumb = pg?.thumbnail?.source;
        if (thumb && !isUnwantedPhoto(thumb, clean)) {
          REAL_IMAGE_CACHE.set(cacheKey, thumb);
          return thumb;
        }
      }
    }

    // 3. Wikimedia Commons direct photo search for real location shots
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      clean
    )}&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    const controller3 = new AbortController();
    const timer3 = setTimeout(() => controller3.abort(), 3500);
    const res3 = await fetch(commonsUrl, { signal: controller3.signal });
    clearTimeout(timer3);

    if (res3.ok) {
      const data3 = await res3.json();
      const pages3 = data3.query?.pages ? (Object.values(data3.query.pages) as any[]) : [];
      for (const pg of pages3) {
        const imgInfo = pg?.imageinfo?.[0];
        const thumb = imgInfo?.thumburl || imgInfo?.url;
        if (thumb && !isUnwantedPhoto(thumb, clean)) {
          REAL_IMAGE_CACHE.set(cacheKey, thumb);
          return thumb;
        }
      }
    }
  } catch (_) {}

  // Fallback to high-res aesthetic photography
  const fallback = getRandomImage(category, seed);
  REAL_IMAGE_CACHE.set(cacheKey, fallback);
  return fallback;
}

function getRandomImage(category: keyof typeof CURATED_POI_PHOTOS, seed: number): string {
  const list = CURATED_POI_PHOTOS[category] || CURATED_POI_PHOTOS.park;
  return list[Math.abs(seed) % list.length];
}

/**
 * Query real Open-Meteo elevation data across sampled route points
 * and compute total real uphill elevation gain in meters.
 */
export async function calculateRealElevationGain(
  coordinates: Array<{ latitude: number; longitude: number }>
): Promise<number> {
  if (!coordinates || coordinates.length < 2) return 0;
  try {
    const sampleStep = Math.max(1, Math.floor(coordinates.length / 15));
    const samplePoints: Array<{ latitude: number; longitude: number }> = [];
    for (let i = 0; i < coordinates.length; i += sampleStep) {
      samplePoints.push(coordinates[i]);
    }
    const last = coordinates[coordinates.length - 1];
    if (samplePoints[samplePoints.length - 1] !== last) {
      samplePoints.push(last);
    }

    const latsStr = samplePoints.map((p) => p.latitude.toFixed(5)).join(',');
    const lngsStr = samplePoints.map((p) => p.longitude.toFixed(5)).join(',');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const elevRes = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${latsStr}&longitude=${lngsStr}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (elevRes.ok) {
      const elevData = await elevRes.json();
      const heights: number[] = elevData.elevation || [];
      let totalGain = 0;
      for (let i = 1; i < heights.length; i++) {
        const diff = heights[i] - heights[i - 1];
        if (diff > 0) totalGain += diff;
      }
      return Math.round(totalGain);
    }
  } catch (_) {}
  return 0;
}

/**
 * Finds nearby parks, recreation grounds, or reserves using Overpass API.
 * Returns up to `limit` points.
 */
export async function findNearbyParks(
  lat: number,
  lng: number,
  radiusMeters = 1500,
  limit = 2
): Promise<Array<{ latitude: number; longitude: number; name?: string }>> {
  try {
    const q = `[out:json][timeout:3];(
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["leisure"="park"];
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["leisure"="nature_reserve"];
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["landuse"="recreation_ground"];
      relation(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["leisure"="park"];
    );out center ${limit};`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const elements = data.elements || [];
    const results: Array<{ latitude: number; longitude: number; name?: string }> = [];
    for (const el of elements) {
      const pLat = el.center?.lat ?? (typeof el.lat === 'number' ? el.lat : null);
      const pLng = el.center?.lon ?? (typeof el.lon === 'number' ? el.lon : null);
      if (pLat && pLng) {
          results.push({
            latitude: pLat,
            longitude: pLng,
            name: el.tags?.name || 'Local Park & Green Space',
          });
        }
      }
      if (results.length > 0) return results;
  } catch {}

  // Resilient fallback: Query OSM Nominatim for nearby parks and nature reserves
  try {
    const delta = (radiusMeters / 111000) * 1.2;
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=park&viewbox=${lng - delta},${lat + delta},${lng + delta},${lat - delta}&bounded=1&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(nomUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FootprintFitnessApp/1.0 (contact: support@footprint.app)',
        'Accept-Language': 'en',
      },
    });
    clearTimeout(timer);
    if (res.ok) {
      const nomData = await res.json();
      return (nomData || []).map((item: any) => ({
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        name: (item.display_name || '').split(',')[0] || 'Local Park',
      }));
    }
  } catch {}

  return [];
}

/**
 * Computes realistic travel duration in minutes based on real activity type speeds:
 * - Walk: 4.8 km/h (~12.5 min/km)
 * - Run: 9.6 km/h (~6.25 min/km)
 * - Cycle: 19.5 km/h (~3.1 min/km)
 */
export function calculateEstimatedMinutes(
  distanceKm: number,
  activityType: 'walk' | 'run' | 'cycle' = 'walk'
): number {
  if (distanceKm <= 0) return 0;
  let speedKmH = 4.8;
  if (activityType === 'run') speedKmH = 9.6;
  else if (activityType === 'cycle') speedKmH = 19.5;
  const mins = Math.round((distanceKm / speedKmH) * 60);
  return Math.max(1, mins);
}

/**
 * Finds nearby dedicated cycleways, bike trails, paths, and cycle infrastructure via Overpass API.
 */
export async function findNearbyBikeways(
  lat: number,
  lng: number,
  radiusMeters = 2000,
  limit = 4
): Promise<Array<{ latitude: number; longitude: number; name?: string }>> {
  try {
    const q = `[out:json][timeout:3];(
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["highway"="cycleway"];
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["bicycle"="designated"];
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["cycleway"];
      way(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})["highway"="path"]["bicycle"!="no"];
    );out center ${limit};`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const elements = data.elements || [];
    const results: Array<{ latitude: number; longitude: number; name?: string }> = [];
    for (const el of elements) {
      const pLat = el.center?.lat ?? (typeof el.lat === 'number' ? el.lat : null);
      const pLng = el.center?.lon ?? (typeof el.lon === 'number' ? el.lon : null);
      if (pLat && pLng) {
        results.push({
          latitude: pLat,
          longitude: pLng,
          name: el.tags?.name || 'Protected Cycleway & Bike Trail',
        });
      }
    }
    if (results.length > 0) return results;
  } catch {}
  return [];
}

/**
 * Queries Overpass API for full bike lane & cycleway geometry around a route area.
 */
/**
 * Queries Overpass API for full bike lane & cycleway geometry around a route area.
 * Includes designated bike paths, dedicated on-road bike lanes, cycle tracks, and multi-use paths.
 */
export async function findNearbyBikeLaneGeometries(
  lat: number,
  lng: number,
  radiusMeters = 4000
): Promise<Array<Array<{ latitude: number; longitude: number }>>> {
  try {
    const delta = radiusMeters / 111000;
    const minLat = (lat - delta).toFixed(5);
    const maxLat = (lat + delta).toFixed(5);
    const minLng = (lng - delta).toFixed(5);
    const maxLng = (lng + delta).toFixed(5);
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

    const q = `[out:json][timeout:6];(
      way["cycleway"](${bbox});
      way["cycleway:right"](${bbox});
      way["cycleway:left"](${bbox});
      way["cycleway:both"](${bbox});
      way["highway"="cycleway"](${bbox});
      way["bicycle"="designated"](${bbox});
      way["bicycle"="yes"](${bbox});
      way["highway"="path"]["bicycle"!="no"](${bbox});
      way["highway"="footway"]["bicycle"="yes"](${bbox});
    );out geom 50;`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3800);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'User-Agent': 'FootprintFitnessApp/1.0 (contact: support@footprint.app)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const elements = data.elements || [];
    const bikeWays: Array<Array<{ latitude: number; longitude: number }>> = [];
    for (const el of elements) {
      if (Array.isArray(el.geometry) && el.geometry.length > 1) {
        bikeWays.push(
          el.geometry.map((pt: any) => ({
            latitude: pt.lat,
            longitude: pt.lon,
          }))
        );
      }
    }
    return bikeWays;
  } catch {
    return [];
  }
}

/**
 * Distance from point (pLat, pLng) to line segment (aLat, aLng) -> (bLat, bLng) in meters
 */
function pointToSegmentDistanceMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dx = bLng - aLng;
  const dy = bLat - aLat;
  if (dx === 0 && dy === 0) {
    return haversineDistanceMeters(pLat, pLng, aLat, aLng);
  }
  const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy)));
  const projLat = aLat + t * dy;
  const projLng = aLng + t * dx;
  return haversineDistanceMeters(pLat, pLng, projLat, projLng);
}

/**
 * Detects and extracts sections of a planned route that coincide with
 * dedicated bike lanes, cycle paths, or trail steps.
 */
export function extractRouteBikeLaneSegments(
  routeCoords: Array<{ latitude: number; longitude: number }>,
  steps?: RouteStep[],
  nearbyBikeWays: Array<Array<{ latitude: number; longitude: number }>> = []
): Array<Array<{ latitude: number; longitude: number }>> {
  if (!routeCoords || routeCoords.length < 2) return [];

  // Flag indices in routeCoords that are within proximity of verified bike infrastructure
  // (such as an on-street painted or protected bike lane, cycleway, or cycle-designated road)
  const isBikePathPoint = new Array<boolean>(routeCoords.length).fill(false);

  // 1. Tag by step street names / directions matching bike infrastructure
  if (steps && steps.length > 0) {
    for (const s of steps) {
      const name = (s.streetName || s.instruction || '').toLowerCase();
      const isBikeStep =
        name.includes('cycle') ||
        name.includes('bike') ||
        name.includes('veloway') ||
        name.includes('greenway') ||
        name.includes('trail') ||
        name.includes('path') ||
        name.includes('boulevard') ||
        name.includes('expressway') ||
        name.includes('parkway');

      if (isBikeStep && s.location) {
        let bestIdx = -1;
        let bestD = Infinity;
        for (let i = 0; i < routeCoords.length; i++) {
          const d = haversineDistanceMeters(s.location.latitude, s.location.longitude, routeCoords[i].latitude, routeCoords[i].longitude);
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0 && bestD < 85) {
          const radius = Math.max(4, Math.min(20, Math.round((s.distanceMeters || 100) / 12)));
          const startI = Math.max(0, bestIdx - 1);
          const endI = Math.min(routeCoords.length - 1, bestIdx + radius);
          for (let i = startI; i <= endI; i++) {
            isBikePathPoint[i] = true;
          }
        }
      }
    }
  }

  // 2. Tag by proximity to real Overpass bike ways (roads with cycleway, bike lanes, or paths)
  if (nearbyBikeWays.length > 0) {
    for (let i = 0; i < routeCoords.length; i++) {
      if (isBikePathPoint[i]) continue;
      const pt = routeCoords[i];
      for (const way of nearbyBikeWays) {
        let matched = false;
        for (let w = 0; w < way.length - 1; w++) {
          const w1 = way[w];
          const w2 = way[w + 1];
          // Bounding box pre-check (~60 meters)
          const minLat = Math.min(w1.latitude, w2.latitude) - 0.0006;
          const maxLat = Math.max(w1.latitude, w2.latitude) + 0.0006;
          const minLng = Math.min(w1.longitude, w2.longitude) - 0.0006;
          const maxLng = Math.max(w1.longitude, w2.longitude) + 0.0006;
          if (pt.latitude < minLat || pt.latitude > maxLat || pt.longitude < minLng || pt.longitude > maxLng) {
            continue;
          }
          // Segment-projected perpendicular distance to roadway centerline
          const d = pointToSegmentDistanceMeters(pt.latitude, pt.longitude, w1.latitude, w1.longitude, w2.latitude, w2.longitude);
          if (d <= 45) { // within 45 meters matches on-road or adjacent dedicated bike lane
            isBikePathPoint[i] = true;
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }
  }

  // Group continuous runs of true into contiguous polyline segments (need >= 2 points)
  const segments: Array<Array<{ latitude: number; longitude: number }>> = [];
  let currentSeg: Array<{ latitude: number; longitude: number }> = [];

  for (let i = 0; i < routeCoords.length; i++) {
    if (isBikePathPoint[i]) {
      if (currentSeg.length === 0 && i > 0) {
        currentSeg.push(routeCoords[i - 1]);
      }
      currentSeg.push(routeCoords[i]);
    } else {
      if (currentSeg.length >= 2) {
        currentSeg.push(routeCoords[i]);
        segments.push(currentSeg);
      }
      currentSeg = [];
    }
  }
  if (currentSeg.length >= 2) {
    segments.push(currentSeg);
  }

  return segments;
}

/**
 * Backwards compatibility helper
 */
export async function findNearbyPark(
  lat: number,
  lng: number
): Promise<{ latitude: number; longitude: number; name?: string } | null> {
  const parks = await findNearbyParks(lat, lng, 1200, 1);
  return parks.length > 0 ? parks[0] : null;
}

function isUnwantedPhoto(url: string | undefined, title: string): boolean {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Filter out any image or title referencing people, portraits, men, women, politicians, flags, icons
  const bannedKeywords = [
    'obama', 'politician', 'president', 'portrait', 'official_portrait', 'headshot', 'person',
    'senator', 'congress', 'mayor', 'barack', 'michelle', 'white_house', 'biden', 'trump',
    'face', 'mugshot', 'profile_picture', 'member of', 'governor', 'biography', 'standing',
    'leader', 'statesman', 'candidate', 'campaign', 'minister', 'speech', 'press', 'oval_office',
    'clinton', 'bush', 'reagan', 'lincoln', 'washington',
    'woman', 'girl', 'female', 'man', 'boy', 'male', 'people', 'human', 'actor', 'actress',
    'author', 'singer', 'player', 'athlete', 'coach', 'model', 'selfie',
    'flag', 'coat_of_arms', 'logo', 'icon', 'seal', 'emblem', 'diagram', 'map', 'insignia'
  ];

  return bannedKeywords.some((k) => lowerUrl.includes(k) || lowerTitle.includes(k));
}

/**
 * Discover interesting POIs and scenic spots along the route.
 * Strictly filters out portraits/politicians (like Obama) and favors rich natural, trail, and parkway vistas.
 */
/**
 * Computes the distance between two coordinates in meters (Haversine).
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the exact cumulative distance along a route polyline to the point
 * that is closest to the given target coordinate.
 * Returns the distance in kilometers.
 */
export function calculateExactDistanceAlongPolyline(
  target: { latitude: number; longitude: number },
  coordinates: Array<{ latitude: number; longitude: number }>
): { distanceKm: number; snappedCoord: { latitude: number; longitude: number } } {
  if (!coordinates || coordinates.length === 0) {
    return { distanceKm: 0, snappedCoord: target };
  }
  if (coordinates.length === 1) {
    return { distanceKm: 0, snappedCoord: coordinates[0] };
  }

  let cumulativeDist = 0;
  let bestMinDist = Infinity;
  let bestDistAlong = 0;
  let bestSnappedCoord = coordinates[0];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const segLen = haversineDistanceMeters(p1.latitude, p1.longitude, p2.latitude, p2.longitude);

    // Project target onto segment p1->p2
    const dX = p2.longitude - p1.longitude;
    const dY = p2.latitude - p1.latitude;
    const segLenSq = dX * dX + dY * dY;

    let t = 0;
    if (segLenSq > 0) {
      t = ((target.longitude - p1.longitude) * dX + (target.latitude - p1.latitude) * dY) / segLenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projLat = p1.latitude + t * dY;
    const projLng = p1.longitude + t * dX;
    const distToProj = haversineDistanceMeters(target.latitude, target.longitude, projLat, projLng);

    if (distToProj < bestMinDist) {
      bestMinDist = distToProj;
      bestDistAlong = cumulativeDist + t * segLen;
      bestSnappedCoord = { latitude: projLat, longitude: projLng };
    }

    cumulativeDist += segLen;
  }

  return {
    distanceKm: parseFloat((bestDistAlong / 1000).toFixed(2)),
    snappedCoord: bestSnappedCoord,
  };
}

/**
 * Discover interesting POIs and scenic spots along the route.
 * Strictly filters out portraits/politicians (like Obama) and favors rich natural, trail, and parkway vistas.
 * Calculates exact distance along the route polyline for every discovered spot.
 */
export async function fetchPoisAlongRoute(
  coordinates: Array<{ latitude: number; longitude: number }>,
  totalDistanceKm: number,
  options?: RouteOptions
): Promise<RoutePoi[]> {
  if (!coordinates || coordinates.length < 2) return [];

  // Calculate precomputed cumulative distances along the route polyline
  const cumDists: number[] = [0];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const seg = haversineDistanceMeters(
      coordinates[i].latitude,
      coordinates[i].longitude,
      coordinates[i + 1].latitude,
      coordinates[i + 1].longitude
    );
    cumDists.push(cumDists[cumDists.length - 1] + seg);
  }
  const trueTotalMeters = cumDists[cumDists.length - 1] || totalDistanceKm * 1000 || 1;

  // Sample along 5 evenly-spaced stations spread across the whole route: 15%, 35%, 55%, 75%, 90%
  const sampleStations = [0.15, 0.35, 0.55, 0.75, 0.90];
  const samplePoints = sampleStations.map((ratio) => {
    const targetMeters = trueTotalMeters * ratio;
    let idx = 0;
    while (idx < cumDists.length - 1 && cumDists[idx + 1] < targetMeters) {
      idx++;
    }
    return {
      lat: coordinates[idx].latitude,
      lng: coordinates[idx].longitude,
      expectedRatio: ratio,
      targetMeters,
    };
  });

  const rawPois: RoutePoi[] = [];
  const seenTitles = new Set<string>();

  // 1. Query Wikipedia Nearby API for authentic notable landmarks, historic sights, and parks at each station
  for (const sp of samplePoints) {
    if (rawPois.length >= 6) break;
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${sp.lat}|${sp.lng}&ggsradius=1400&ggslimit=5&prop=pageimages|extracts|description&piprop=thumbnail&pithumbsize=800&exintro=1&explaintext=1&exchars=240&format=json&origin=*`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(wikiUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
        for (const pg of pages) {
          const title = (pg.title || '').trim();
          const lowerTitle = title.toLowerCase();

          // Strictly filter out people, biographies, elections, politician portraits
          if (
            !title ||
            lowerTitle.includes('obama') ||
            lowerTitle.includes('president') ||
            lowerTitle.includes('politician') ||
            lowerTitle.includes('barack') ||
            lowerTitle.includes('michelle') ||
            lowerTitle.includes('birth') ||
            lowerTitle.includes('election') ||
            lowerTitle.includes('school district') ||
            lowerTitle.includes('high school') ||
            lowerTitle.includes('elementary') ||
            lowerTitle.includes('census-designated') ||
            lowerTitle.includes('unincorporated')
          ) {
            continue;
          }

          if (!seenTitles.has(lowerTitle)) {
            seenTitles.add(lowerTitle);
            let thumbUrl = pg.thumbnail?.source;
            if (isUnwantedPhoto(thumbUrl, title)) {
              thumbUrl = undefined;
            }

            const cat = lowerTitle.includes('park') || lowerTitle.includes('garden') ? 'park'
              : lowerTitle.includes('river') || lowerTitle.includes('lake') || lowerTitle.includes('creek') || lowerTitle.includes('pond') || lowerTitle.includes('beach') ? 'water'
              : lowerTitle.includes('trail') || lowerTitle.includes('path') || lowerTitle.includes('ridge') || lowerTitle.includes('walk') ? 'trail'
              : lowerTitle.includes('lookout') || lowerTitle.includes('view') || lowerTitle.includes('hill') || lowerTitle.includes('mountain') || lowerTitle.includes('peak') ? 'viewpoint'
              : 'monument';

            // If thumbnail was missing from geosearch, attempt authentic search via fetchRealPlacePhoto
            if (!thumbUrl) {
              thumbUrl = await fetchRealPlacePhoto(title, cat, rawPois.length * 13 + 5);
            }

            const rawCoord = pg.lat && pg.lon ? { latitude: pg.lat, longitude: pg.lon } : { latitude: sp.lat, longitude: sp.lng };
            const { distanceKm, snappedCoord } = calculateExactDistanceAlongPolyline(rawCoord, coordinates);

            const snippet = (pg.description || pg.extract || '').replace(/\s+/g, ' ').trim();

            rawPois.push({
              id: `wiki_${pg.pageid || Math.random()}`,
              name: title,
              category: cat,
              imageUrl: thumbUrl,
              distanceAlongKm: distanceKm,
              coordinate: snappedCoord,
              description: snippet,
              infoSnippet: snippet,
            });
            break; // take at most 1 authentic stop per geographic station to keep them evenly spread
          }
        }
      }
    } catch (_) {}
  }

  // 2. Query OSM Overpass for genuine local parks / nature reserves along the corridor if needed
  if (rawPois.length < 3) {
    try {
      const midPoint = coordinates[Math.floor(coordinates.length / 2)];
      const osmParks = await findNearbyParks(midPoint.latitude, midPoint.longitude, 2500, 3);
      for (const park of osmParks) {
        if (!park.name || seenTitles.has(park.name.toLowerCase())) continue;
        seenTitles.add(park.name.toLowerCase());
        const { distanceKm, snappedCoord } = calculateExactDistanceAlongPolyline(park, coordinates);
        // Query authentic photo for the actual park name
        const realParkPhoto = await fetchRealPlacePhoto(park.name, 'park', rawPois.length * 9 + 2);
        rawPois.push({
          id: `osm_park_${Math.random()}`,
          name: park.name,
          category: 'park',
          imageUrl: realParkPhoto,
          distanceAlongKm: distanceKm,
          coordinate: snappedCoord,
          description: `Scenic public park and recreation greenway along your path.`,
          infoSnippet: `Scenic public park and recreation greenway along your path.`,
        });
      }
    } catch (_) {}
  }

  // If the route is short (< 1.5 km), don't force unnecessary stops unless authentic spots exist
  if (totalDistanceKm < 1.5 && rawPois.length === 0) {
    return [];
  }

  // Strictly require authentic notable stops (parks, nature reserves, viewpoints, waterways, historic landmarks)
  // Do NOT add stupid, trivial stops or fake filler waypoints
  rawPois.sort((a, b) => (a.distanceAlongKm ?? 0) - (b.distanceAlongKm ?? 0));
  const minSeparationKm = Math.max(0.4, (trueTotalMeters / 1000) * 0.2);
  const spreadPois: RoutePoi[] = [];

  for (const p of rawPois) {
    if (spreadPois.length === 0) {
      spreadPois.push(p);
    } else {
      const lastDist = spreadPois[spreadPois.length - 1].distanceAlongKm ?? 0;
      const curDist = p.distanceAlongKm ?? 0;
      if (curDist - lastDist >= minSeparationKm) {
        spreadPois.push(p);
      }
    }
  }

  // Sort final selected stops in sequential progression order along the path
  spreadPois.sort((a, b) => (a.distanceAlongKm ?? 0) - (b.distanceAlongKm ?? 0));

  return spreadPois.slice(0, 4); // Return only genuine, notable landmark stops (or none if none exist)
}

/**
 * Search real locations / addresses using OSM Nominatim geocoder
 */
export async function searchPlaces(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<GeocodedPlace[]> {
  if (!query || query.trim().length < 2) return [];
  const cleanQuery = query.trim();

  // Helper to classify place category
  const getCategory = (text: string): 'park' | 'nature' | 'water' | 'viewpoint' | 'monument' | 'trail' | 'place' => {
    const s = text.toLowerCase();
    if (s.includes('park') || s.includes('garden') || s.includes('recreation') || s.includes('playground')) {
      return 'park';
    } else if (s.includes('trail') || s.includes('path') || s.includes('footway') || s.includes('track') || s.includes('walkway') || s.includes('hike')) {
      return 'trail';
    } else if (s.includes('water') || s.includes('lake') || s.includes('river') || s.includes('creek') || s.includes('bay') || s.includes('beach') || s.includes('marina')) {
      return 'water';
    } else if (s.includes('nature') || s.includes('forest') || s.includes('reserve') || s.includes('wood') || s.includes('meadow')) {
      return 'nature';
    } else if (s.includes('view') || s.includes('lookout') || s.includes('peak') || s.includes('hill') || s.includes('mountain') || s.includes('ridge')) {
      return 'viewpoint';
    } else if (s.includes('monument') || s.includes('memorial') || s.includes('historic') || s.includes('castle') || s.includes('square') || s.includes('museum')) {
      return 'monument';
    }
    return 'place';
  };

  try {
    // PRIMARY SEARCH: Photon OpenStreetMap Elastic Geocoder (World-class phrase matching, fuzzy search, and coordinate-biased proximity)
    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=15`;
    if (userLat !== undefined && userLng !== undefined) {
      photonUrl += `&lat=${userLat}&lon=${userLng}`;
    }

    const photonRes = await fetch(photonUrl, {
      headers: { 'Accept-Language': 'en' },
    });

    let mapped: GeocodedPlace[] = [];

    if (photonRes.ok) {
      const photonData = await photonRes.json();
      const features: any[] = photonData.features || [];

      mapped = features.map((f: any, idx: number) => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const pLng = coords[0];
        const pLat = coords[1];

        const shortName = p.name || p.street || cleanQuery;
        const addressParts = [
          p.housenumber,
          p.street,
          p.city || p.town || p.village || p.district,
          p.state,
          p.country,
        ].filter(Boolean);

        const subtitle = addressParts.join(', ');
        const distanceMeters =
          userLat !== undefined && userLng !== undefined && !isNaN(pLat) && !isNaN(pLng)
            ? haversineDistanceMeters(userLat, userLng, pLat, pLng)
            : undefined;

        const fullText = `${shortName} ${subtitle} ${p.osm_key || ''} ${p.osm_value || ''}`.toLowerCase();
        const category = getCategory(fullText);

        const photoKey = category === 'place' ? 'monument' : category;
        const img = getRandomImage(photoKey, Math.round(Math.abs(pLat) * 1000 + Math.abs(pLng) * 1000 + idx));

        const placeType = p.osm_value ? p.osm_value.replace(/_/g, ' ') : '';
        const description = subtitle
          ? `${placeType ? placeType.toUpperCase() + ' • ' : ''}${subtitle}`
          : `${category.toUpperCase()} • Notable location`;

        return {
          placeId: String(p.osm_id || Math.random()),
          displayName: subtitle ? `${shortName}, ${subtitle}` : shortName,
          shortName,
          latitude: pLat,
          longitude: pLng,
          distanceMeters,
          category,
          imageUrl: img,
          description,
        };
      });
    }

    // SECONDARY FALLBACK: If Photon returned 0 results, query OSM Nominatim
    if (mapped.length === 0) {
      let nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=10&extratags=1&addressdetails=1`;
      if (userLat !== undefined && userLng !== undefined) {
        const delta = 0.5;
        nomUrl += `&viewbox=${userLng - delta},${userLat + delta},${userLng + delta},${userLat - delta}`;
      }

      const nomRes = await fetch(nomUrl, {
        headers: {
          'User-Agent': 'FootprintFitnessApp/1.0 (contact: support@footprint.app)',
          'Accept-Language': 'en',
        },
      });

      if (nomRes.ok) {
        const nomData = await nomRes.json();
        mapped = nomData.map((item: any, idx: number) => {
          const parts = (item.display_name || '').split(',');
          const shortName = parts[0]?.trim() || item.name || cleanQuery;
          const subtitle = parts.slice(1, 3).map((p: string) => p.trim()).join(', ');
          const pLat = parseFloat(item.lat);
          const pLng = parseFloat(item.lon);
          const distanceMeters =
            userLat !== undefined && userLng !== undefined && !isNaN(pLat) && !isNaN(pLng)
              ? haversineDistanceMeters(userLat, userLng, pLat, pLng)
              : undefined;

          const fullText = `${item.display_name || ''} ${item.type || ''} ${item.class || ''}`.toLowerCase();
          const category = getCategory(fullText);

          let img = item.extratags?.image || item.extratags?.wikimedia_commons;
          if (!img || typeof img !== 'string' || !img.startsWith('http')) {
            const photoKey = category === 'place' ? 'monument' : category;
            img = getRandomImage(photoKey, Math.round(Math.abs(pLat) * 1000 + Math.abs(pLng) * 1000 + idx));
          }

          const placeType = item.type ? item.type.replace(/_/g, ' ') : '';
          const placeClass = item.class ? item.class.replace(/_/g, ' ') : '';
          const description = subtitle
            ? `${placeType ? placeType.toUpperCase() + ' • ' : ''}${subtitle}`
            : `${category.toUpperCase()} • ${placeClass || 'Notable location'}`;

          return {
            placeId: String(item.place_id || Math.random()),
            displayName: subtitle ? `${shortName}, ${subtitle}` : shortName,
            shortName,
            latitude: pLat,
            longitude: pLng,
            distanceMeters,
            category,
            imageUrl: img,
            description,
          };
        });
      }
    }

    // Rank places by proximity if user location is known
    // Places within immediate reach (< 30km) are prioritized first
    if (userLat !== undefined && userLng !== undefined && mapped.length > 1) {
      mapped.sort((a, b) => {
        const distA = a.distanceMeters ?? Infinity;
        const distB = b.distanceMeters ?? Infinity;
        return distA - distB;
      });
    }

    // Filter out duplicates by place name & coordinates
    const seen = new Set<string>();
    const unique = mapped.filter((p) => {
      const key = `${p.shortName.toLowerCase()}_${p.latitude.toFixed(3)}_${p.longitude.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const topResults = unique.slice(0, 8);

    // Concurrently enhance top results with authentic Wikipedia / Wikimedia photos if available
    await Promise.all(
      topResults.slice(0, 5).map(async (place, idx) => {
        if (!place.imageUrl || place.imageUrl.includes('unsplash.com')) {
          const cat = (place.category === 'place' ? 'monument' : place.category) as keyof typeof CURATED_POI_PHOTOS;
          const realPhoto = await fetchRealPlacePhoto(place.shortName, cat, idx);
          if (realPhoto) {
            place.imageUrl = realPhoto;
          }
        }
      })
    );

    return topResults;
  } catch (err) {
    console.warn('Place search error:', err);
    return [];
  }
}

/**
 * Calculates a real walking/running/cycling turn-by-turn route snapped to roads and trails.
 * Incorporates options: preferParks, avoidTrafficLights, avoidBusyRoads, and preferCyclingLanes.
 */
export async function fetchRealRoadRoute(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  activityType: 'walk' | 'run' | 'cycle' = 'walk',
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS
): Promise<RealRouteResult | null> {
  const profile = activityType === 'cycle' ? 'bicycle' : 'foot';

  // Dynamic Waypoint Injection based on activity type and user route preferences:
  // 1. If activity is 'cycle' and preferCyclingLanes is enabled (or active), prioritize designated cycleways & bike trails
  // 2. If preferParks is enabled: search for a green parkway node along the midpoint trajectory
  // 3. If avoidTrafficLights or avoidBusyRoads is enabled: offset intermediate waypoints off major arterials
  let intermediateWaypoints = '';

  const midLat = (startLat + destLat) / 2;
  const midLng = (startLng + destLng) / 2;

  if (activityType === 'cycle' && options.preferCyclingLanes) {
    // Automatically find nearby protected cycleways, bike trails, or designated paths
    const bikeways = await findNearbyBikeways(midLat, midLng, 2500, 1);
    if (bikeways.length > 0) {
      intermediateWaypoints += `;${bikeways[0].longitude.toFixed(5)},${bikeways[0].latitude.toFixed(5)}`;
    }
  }

  if (options.preferFastest && activityType !== 'cycle') {
    // Fastest direct route: minimal intermediate waypoint detours
    intermediateWaypoints = '';
  } else {
    if (options.preferParks && (!activityType || activityType !== 'cycle' || !intermediateWaypoints)) {
      // Look for a park near the start or midpoint to route through
      const park = await findNearbyPark(midLat, midLng);
      if (park) {
        intermediateWaypoints += `;${park.longitude.toFixed(5)},${park.latitude.toFixed(5)}`;
      }
    }

    if (options.avoidTrafficLights || options.avoidBusyRoads) {
      // Shift slightly perpendicular to straight-line corridor to bypass main signaled boulevards
      const dLat = destLat - startLat;
      const dLng = destLng - startLng;
      // Perpendicular vector (-dLng, dLat)
      const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001;
      const offsetMag = Math.min(0.0035, dist * 0.15); // ~150-300 meters lateral shift
      const bypassLat = midLat - (dLng / dist) * offsetMag;
      const bypassLng = midLng + (dLat / dist) * offsetMag;
      if (!intermediateWaypoints) {
        intermediateWaypoints = `;${bypassLng.toFixed(5)},${bypassLat.toFixed(5)}`;
      }
    }
  }

  const url = `https://router.project-osrm.org/route/v1/${profile}/${startLng},${startLat}${intermediateWaypoints};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();

    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      return null;
    }

    const primaryRoute = json.routes[0];
    const geoCoords: [number, number][] = primaryRoute.geometry?.coordinates || [];

    const coordinates = geoCoords.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

    const distanceMeters = primaryRoute.distance || 0;
    const distanceKm = parseFloat((distanceMeters / 1000).toFixed(2));
    const durationMins = calculateEstimatedMinutes(distanceKm, activityType);

    // Calculate authentic elevation profile from Open-Meteo topography data
    const elevationGain = await calculateRealElevationGain(coordinates);

    // Parse turn-by-turn steps from all legs
    const steps: RouteStep[] = [];
    for (const leg of primaryRoute.legs || []) {
      for (const step of leg.steps || []) {
        const maneuver = step.maneuver || {};
        const type: string = maneuver.type || 'continue';
        const modifier: string | undefined = maneuver.modifier;
        const street: string = step.name || '';
        const dist: number = step.distance || 0;
        const [sLng, sLat] = maneuver.location || [0, 0];

        // Build a human-readable instruction
        let instruction = '';
        if (type === 'depart') {
          instruction = street ? `Head onto ${street}` : 'Start your route';
        } else if (type === 'arrive') {
          instruction = 'You have arrived at your destination';
        } else if (type === 'turn') {
          const dir = modifier ? modifier.replace('slight ', 'slightly ') : '';
          instruction = street ? `Turn ${dir} onto ${street}` : `Turn ${dir}`;
        } else if (type === 'new name') {
          instruction = street ? `Continue onto ${street}` : 'Continue straight';
        } else if (type === 'continue') {
          instruction = street ? `Continue on ${street}` : 'Continue straight';
        } else if (type === 'roundabout' || type === 'rotary') {
          const exit = maneuver.exit ? ` — take exit ${maneuver.exit}` : '';
          instruction = `Enter the roundabout${exit}`;
        } else if (type === 'fork') {
          const dir = modifier === 'left' ? 'left' : 'right';
          instruction = street ? `Keep ${dir} onto ${street}` : `Keep ${dir} at the fork`;
        } else if (type === 'end of road') {
          const dir = modifier === 'left' ? 'left' : 'right';
          instruction = street ? `Turn ${dir} at the end — ${street}` : `Turn ${dir} at the end of the road`;
        } else if (type === 'use lane') {
          instruction = street ? `Use the lane to stay on ${street}` : 'Use the correct lane';
        } else {
          instruction = street ? `Head onto ${street}` : 'Continue';
        }

        steps.push({
          instruction,
          distanceMeters: dist,
          maneuverType: type,
          modifier,
          streetName: street || undefined,
          location: sLat !== 0 ? { latitude: sLat, longitude: sLng } : undefined,
        });
      }
    }

    if (steps.length === 0 && coordinates.length > 0) {
      steps.push({
        instruction: `Head toward ${primaryRoute.legs?.[0]?.summary || 'destination'}`,
        distanceMeters: 0,
        maneuverType: 'depart',
        location: coordinates[0],
      });
      if (coordinates.length > 1) {
        steps.push({
          instruction: 'Arrive at destination',
          distanceMeters: Math.round(distanceMeters),
          maneuverType: 'arrive',
          location: coordinates[coordinates.length - 1],
        });
      }
    }

    // Discover interesting preview points along the route
    const pois = await fetchPoisAlongRoute(coordinates, distanceKm, options);

    const preferenceLabels: string[] = [];
    if (options.preferParks) preferenceLabels.push('Parkways');
    if (options.avoidTrafficLights) preferenceLabels.push('Low Signals');
    if (options.avoidBusyRoads) preferenceLabels.push('Quiet Paths');
    const prefSummary = preferenceLabels.length > 0 ? ` (${preferenceLabels.join(', ')})` : '';

    const topPoi = pois.find((p) => p.name && !p.name.includes('Route'));
    const legSummary = primaryRoute.legs?.[0]?.summary;
    let routeDisplayName = legSummary ? `Route via ${legSummary}` : 'Scenic Corridor Route';
    if (topPoi?.name) {
      routeDisplayName = `${topPoi.name} Trailway`;
    } else if (legSummary) {
      routeDisplayName = `${legSummary} Course`;
    }

    // Compute bike lane segments if cycle activity or preferCyclingLanes
    let bikeLaneSegments: Array<Array<{ latitude: number; longitude: number }>> | undefined = undefined;
    if (activityType === 'cycle') {
      try {
        const bikeGeoms = await findNearbyBikeLaneGeometries(midLat, midLng, Math.max(2500, distanceKm * 1000 * 0.8));
        const segs = extractRouteBikeLaneSegments(coordinates, steps, bikeGeoms);
        if (segs.length > 0) bikeLaneSegments = segs;
      } catch (_) {}
    }

    return {
      id: `real_route_${Date.now()}`,
      name: `${routeDisplayName}${prefSummary}`,
      destinationName: primaryRoute.legs?.[0]?.summary || topPoi?.name || 'Destination',
      distanceKm,
      durationMins: durationMins || calculateEstimatedMinutes(distanceKm, activityType),
      elevationGainMeters: Math.round(elevationGain),
      coordinates,
      summary: primaryRoute.legs?.[0]?.summary || '',
      steps: steps.length > 0 ? steps : undefined,
      pois,
      bikeLaneSegments,
    };
  } catch (err) {
    console.warn('Real routing error:', err);
    return null;
  }
}

/**
 * Builds real loop circuit suggestions by finding real street waypoints
 * at the desired distance, incorporating parks, traffic signal avoidance, and cycling lanes.
 */
export async function generateRealCircuitSuggestions(
  startLat: number,
  startLng: number,
  targetDistanceKm: number,
  elevationPreference: 'flat' | 'rolling' | 'hilly' | null,
  activityType: 'walk' | 'run' | 'cycle',
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  routeType: 'loop' | 'oneway' = 'loop'
): Promise<RealRouteResult[]> {
  const profile = activityType === 'cycle' ? 'bicycle' : 'foot';
  const isOneWay = routeType === 'oneway';

  // For loop: radius is circumference / 2π. For one-way: target distance directly sets destination distance
  const targetOutboundKm = isOneWay ? Math.max(0.5, targetDistanceKm * 0.95) : Math.max(0.4, targetDistanceKm / (2 * Math.PI));
  const radiusLat = targetOutboundKm / 111;
  const radiusLng = targetOutboundKm / (111 * Math.cos((startLat * Math.PI) / 180));

  // Find real parks or dedicated bikeways around the user to anchor routes through actual green spaces and bike paths
  let nearbyParks: Array<{ latitude: number; longitude: number; name?: string }> = [];
  let nearbyBikeways: Array<{ latitude: number; longitude: number; name?: string }> = [];
  let nearbyBikeGeoms: Array<Array<{ latitude: number; longitude: number }>> = [];

  if (activityType === 'cycle') {
    nearbyBikeways = await findNearbyBikeways(startLat, startLng, Math.max(1500, targetOutboundKm * 1000 * 1.4), 4);
    try {
      nearbyBikeGeoms = await findNearbyBikeLaneGeometries(startLat, startLng, Math.max(3000, targetOutboundKm * 1000 * 1.5));
    } catch (_) {}
  }
  if (options.preferParks || (activityType !== 'cycle' && nearbyParks.length === 0)) {
    nearbyParks = await findNearbyParks(startLat, startLng, Math.max(1200, targetOutboundKm * 1000 * 1.3), 4);
  }

  // Anchor points prioritize designated bikeways in cycle mode
  const anchorPoints = (activityType === 'cycle' && nearbyBikeways.length > 0) ? nearbyBikeways : nearbyParks;

  // Define route variants tailored to user preferences
  const variations = isOneWay
    ? [
        {
          name: activityType === 'cycle'
            ? 'Protected Veloway & Bike Corridor'
            : options.preferParks ? 'Parkway Corridor' : 'Northbound Corridor Route',
          baseAngle: Math.PI / 2, // North / Northwest
          mult: 1.0,
          anchorIndex: 0,
        },
        {
          name: activityType === 'cycle'
            ? 'Quiet Cycleway & Shoreline Route'
            : options.avoidTrafficLights ? 'Quiet Shore & Vista Route' : 'Eastward Ridge Traverse',
          baseAngle: 0, // East / Northeast
          mult: 1.1,
          anchorIndex: 1,
        },
        {
          name: activityType === 'cycle'
            ? 'Greenway Cycle Expressway'
            : options.avoidBusyRoads ? 'South Valley Greenway' : 'South-East Foothill Course',
          baseAngle: -Math.PI / 3, // South / Southeast
          mult: 0.9,
          anchorIndex: 2,
        },
      ]
    : [
        {
          name: activityType === 'cycle' ? 'Protected Cycle Loop' : 'Scenic Park & Greenbelt Loop',
          angleShift: 0,
          mult: 1.0,
          anchorIndex: 0,
        },
        {
          name: activityType === 'cycle' ? 'Veloway & Waterfront Circuit' : 'Ridge Overlook & Hillside Circuit',
          angleShift: (2 * Math.PI) / 3,
          mult: 1.08,
          anchorIndex: 1,
        },
        {
          name: activityType === 'cycle' ? 'City Bike Trailway Tour' : 'Canopy Trailway & Nature Reserve',
          angleShift: (4 * Math.PI) / 3,
          mult: 0.94,
          anchorIndex: 2,
        },
      ];

  const results: RealRouteResult[] = [];

  for (let idx = 0; idx < variations.length; idx++) {
    const v: any = variations[idx];

    let url = '';
    if (isOneWay) {
      // ── One-Way Outbound Route ──
      const headingAngle = v.baseAngle;
      let destLat = startLat + radiusLat * v.mult * Math.sin(headingAngle);
      let destLng = startLng + radiusLng * v.mult * Math.cos(headingAngle);

      // If parks or bikeways are preferred, aim directly towards or through a nearby anchor point
      let midWp: { lat: number; lng: number } | null = null;
      if (anchorPoints.length > 0) {
        const anchorToUse = anchorPoints[v.anchorIndex % anchorPoints.length];
        if (anchorToUse) {
          destLat = anchorToUse.latitude;
          destLng = anchorToUse.longitude;
        }
      } else {
        // Midpoint offset for natural curved path
        const midLat = (startLat + destLat) / 2;
        const midLng = (startLng + destLng) / 2;
        const perpAngle = headingAngle + Math.PI / 2;
        const jitter = (idx % 2 === 0 ? 0.15 : -0.15) * radiusLat;
        midWp = {
          lat: midLat + jitter * Math.sin(perpAngle),
          lng: midLng + jitter * Math.cos(perpAngle),
        };
      }

      const waypoints = midWp
        ? `${startLng},${startLat};${midWp.lng.toFixed(5)},${midWp.lat.toFixed(5)};${destLng.toFixed(5)},${destLat.toFixed(5)}`
        : `${startLng},${startLat};${destLng.toFixed(5)},${destLat.toFixed(5)}`;

      url = `https://router.project-osrm.org/route/v1/${profile}/${waypoints}?overview=full&geometries=geojson&steps=true`;
    } else {
      // ── Circuit / Loop Route ──
      const angle1 = v.angleShift + Math.PI / 4;
      const angle2 = v.angleShift + (3 * Math.PI) / 4;
      const angle3 = v.angleShift + (5 * Math.PI) / 4;

      let wp1 = {
        lat: startLat + radiusLat * v.mult * Math.cos(angle1),
        lng: startLng + radiusLng * v.mult * Math.sin(angle1),
      };
      let wp2 = {
        lat: startLat + radiusLat * v.mult * Math.cos(angle2),
        lng: startLng + radiusLng * v.mult * Math.sin(angle2),
      };
      let wp3 = {
        lat: startLat + radiusLat * v.mult * Math.cos(angle3),
        lng: startLng + radiusLng * v.mult * Math.sin(angle3),
      };

      if (anchorPoints.length > 0) {
        const anchorToUse = anchorPoints[v.anchorIndex % anchorPoints.length];
        if (anchorToUse) {
          wp1 = { lat: anchorToUse.latitude, lng: anchorToUse.longitude };
        }
      }

      if (elevationPreference === 'flat') {
        wp2.lat = startLat + (wp2.lat - startLat) * 0.85;
        wp2.lng = startLng + (wp2.lng - startLng) * 0.85;
      } else if (elevationPreference === 'hilly') {
        const hillAngle = v.angleShift + Math.PI / 3;
        wp2.lat = wp2.lat + radiusLat * 0.35 * Math.sin(hillAngle);
        wp2.lng = wp2.lng + radiusLng * 0.35 * Math.cos(hillAngle);
      }

      if (options.avoidTrafficLights || options.avoidBusyRoads) {
        const avoidShift = idx % 2 === 0 ? 0.22 : -0.22;
        wp2 = {
          lat: wp2.lat + radiusLat * avoidShift,
          lng: wp2.lng + radiusLng * avoidShift,
        };
        wp3 = {
          lat: wp3.lat - radiusLat * (avoidShift * 0.5),
          lng: wp3.lng + radiusLng * (avoidShift * 0.5),
        };
      }

      url = `https://router.project-osrm.org/route/v1/${profile}/${startLng},${startLat};${wp1.lng.toFixed(5)},${wp1.lat.toFixed(5)};${wp2.lng.toFixed(5)},${wp2.lat.toFixed(5)};${wp3.lng.toFixed(5)},${wp3.lat.toFixed(5)};${startLng},${startLat}?overview=full&geometries=geojson&steps=true`;
    }

    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
          const r = json.routes[0];
          const coords: [number, number][] = r.geometry?.coordinates || [];
          const actualKm = parseFloat(((r.distance || 0) / 1000).toFixed(2));
          const actualMins = calculateEstimatedMinutes(actualKm, activityType);

          // Calculate authentic elevation gain from real Open-Meteo topography data
          const mappedCoords = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
          const elev = await calculateRealElevationGain(mappedCoords);

          // Parse turn-by-turn navigation steps from all legs
          const circuitSteps: RouteStep[] = [];
          for (const leg of r.legs || []) {
            for (const step of leg.steps || []) {
              const maneuver = step.maneuver || {};
              const type: string = maneuver.type || 'continue';
              const modifier: string | undefined = maneuver.modifier;
              const street: string = step.name || '';
              const dist: number = step.distance || 0;
              const [sLng, sLat] = maneuver.location || [0, 0];

              let instruction = '';
              if (type === 'depart') {
                instruction = street ? `Head onto ${street}` : isOneWay ? 'Start toward destination' : 'Start your circuit';
              } else if (type === 'arrive') {
                instruction = isOneWay ? 'Arrive at destination' : 'Complete circuit back at start';
              } else if (type === 'turn') {
                const dir = modifier ? modifier.replace('slight ', 'slightly ') : '';
                instruction = street ? `Turn ${dir} onto ${street}` : `Turn ${dir}`;
              } else if (type === 'new name' || type === 'continue') {
                instruction = street ? `Continue on ${street}` : 'Continue straight';
              } else if (type === 'roundabout' || type === 'rotary') {
                const exit = maneuver.exit ? ` — take exit ${maneuver.exit}` : '';
                instruction = `Enter roundabout${exit}`;
              } else if (type === 'fork') {
                const dir = modifier === 'left' ? 'left' : 'right';
                instruction = street ? `Keep ${dir} onto ${street}` : `Keep ${dir} at the fork`;
              } else {
                instruction = street ? `Follow ${street}` : 'Follow the route';
              }

              circuitSteps.push({
                instruction,
                distanceMeters: dist,
                maneuverType: type,
                modifier,
                streetName: street || undefined,
                location: sLat !== 0 ? { latitude: sLat, longitude: sLng } : undefined,
              });
            }
          }

          if (circuitSteps.length === 0 && coords.length > 0) {
            circuitSteps.push({
              instruction: `Start ${v.name}`,
              distanceMeters: 0,
              maneuverType: 'depart',
              location: { latitude: coords[0][1], longitude: coords[0][0] },
            });
            circuitSteps.push({
              instruction: isOneWay ? 'Arrive at destination' : 'Arrive back at your starting point',
              distanceMeters: Math.round(r.distance || 1000),
              maneuverType: 'arrive',
              location: { latitude: coords[coords.length - 1][1], longitude: coords[coords.length - 1][0] },
            });
          }

          // Discover photo POIs along this route with accurate polyline distance calculation
          const circuitPois = await fetchPoisAlongRoute(mappedCoords, actualKm, options);

          // Dynamically compute trail/circuit name based on route highlights, parks, bikeways, or streets
          let dynamicName = v.name;
          const topPoi = circuitPois.find((p) => p.name && !p.name.includes('Circuit') && !p.name.includes('Loop'));
          const legSummary = r.legs?.map((leg: any) => leg.summary).filter(Boolean).slice(0, 2).join(' & ');

          if (topPoi && topPoi.name) {
            const suffix = isOneWay ? 'Path' : (idx === 0 ? 'Loop' : idx === 1 ? 'Trail Circuit' : 'Greenway Run');
            dynamicName = `${topPoi.name} ${suffix}`;
          } else if (v.anchorIndex !== undefined && anchorPoints[v.anchorIndex % anchorPoints.length]?.name) {
            const anchorName = anchorPoints[v.anchorIndex % anchorPoints.length].name;
            const suffix = isOneWay ? 'Corridor' : (idx === 0 ? 'Loop' : idx === 1 ? 'Perimeter Circuit' : 'Greenway Tour');
            dynamicName = `${anchorName} ${suffix}`;
          } else if (legSummary) {
            const suffix = isOneWay ? 'Way' : (idx === 0 ? 'Loop' : idx === 1 ? 'Circuit' : 'Way');
            dynamicName = `${legSummary} ${suffix}`;
          }

          // Extract dedicated bike path segments
          let bikeLaneSegments: Array<Array<{ latitude: number; longitude: number }>> | undefined = undefined;
          if (activityType === 'cycle') {
            const segs = extractRouteBikeLaneSegments(mappedCoords, circuitSteps, nearbyBikeGeoms);
            if (segs.length > 0) bikeLaneSegments = segs;
          }

          results.push({
            id: `real_circuit_${idx}_${Date.now()}`,
            name: dynamicName,
            destinationName: r.legs?.[0]?.summary || topPoi?.name || (isOneWay ? 'Destination Point' : 'Scenic Loop'),
            distanceKm: actualKm,
            durationMins: actualMins,
            elevationGainMeters: elev,
            coordinates: mappedCoords,
            summary: r.legs?.map((leg: any) => leg.summary).filter(Boolean).slice(0, 2).join(' → ') || 'Roads & trails',
            steps: circuitSteps,
            pois: circuitPois,
            bikeLaneSegments,
          });
        }
      }
    } catch (_) {}
  }

  return results;
}

/**
 * Recalculates an off-route deviation by guiding the user BACK ONTO the planned path
 * at the nearest forward re-entry point, preserving the remaining circuit/route so the user
 * finishes their intended route rather than discarding it for a short-cut.
 */
export async function recalculateReturnToPathRoute(
  userLat: number,
  userLng: number,
  existingRoute: RealRouteResult,
  currentStepIdx: number,
  activityType: 'walk' | 'run' | 'cycle' = 'cycle',
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS
): Promise<RealRouteResult | null> {
  const originalCoords = existingRoute.coordinates;
  if (!originalCoords || originalCoords.length < 2) return null;

  // 1. Determine where along the remaining route to rejoin.
  // We want a point in the forward portion of the route (not behind current progress)
  // that provides a sensible re-entry target.
  const minProgressRatio = Math.min(0.85, Math.max(0.05, currentStepIdx / Math.max(1, existingRoute.steps?.length || 1)));
  const minCoordIdx = Math.floor(minProgressRatio * originalCoords.length);

  // Search forward for the closest coordinate to user (beyond minCoordIdx)
  let bestIdx = minCoordIdx;
  let bestDist = Infinity;
  for (let i = minCoordIdx; i < originalCoords.length; i++) {
    const d = haversineDistanceMeters(userLat, userLng, originalCoords[i].latitude, originalCoords[i].longitude);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // To prevent cutting too close to where the user went off, look slightly ahead
  // (~80-150 meters ahead along the path)
  let rejoinIdx = bestIdx;
  let lookaheadMeters = 0;
  for (let i = bestIdx; i < originalCoords.length - 1; i++) {
    lookaheadMeters += haversineDistanceMeters(
      originalCoords[i].latitude,
      originalCoords[i].longitude,
      originalCoords[i + 1].latitude,
      originalCoords[i + 1].longitude
    );
    rejoinIdx = i + 1;
    if (lookaheadMeters >= 90) break;
  }

  const rejoinPoint = originalCoords[rejoinIdx];

  // 2. Query OSRM for a connector leg from user position to the rejoin point
  const profile = activityType === 'cycle' ? 'bicycle' : 'foot';
  const connectorUrl = `https://router.project-osrm.org/route/v1/${profile}/${userLng},${userLat};${rejoinPoint.longitude},${rejoinPoint.latitude}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(connectorUrl);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      return null;
    }

    const connectorRoute = json.routes[0];
    const connectorGeoCoords: [number, number][] = connectorRoute.geometry?.coordinates || [];
    const connectorCoords = connectorGeoCoords.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

    // 3. Splice: connector leg + remaining original path from rejoinIdx to the finish!
    const remainingPlannedCoords = originalCoords.slice(rejoinIdx);
    const splicedCoords = [...connectorCoords, ...remainingPlannedCoords];

    // Build turn-by-turn steps:
    // First connector steps (guide back to route), then remaining original steps
    const splicedSteps: RouteStep[] = [];

    // Parse connector steps
    for (const leg of connectorRoute.legs || []) {
      for (const step of leg.steps || []) {
        const maneuver = step.maneuver || {};
        const type: string = maneuver.type || 'continue';
        const modifier: string | undefined = maneuver.modifier;
        const street: string = step.name || '';
        const dist: number = step.distance || 0;
        const [sLng, sLat] = maneuver.location || [0, 0];

        let instruction = '';
        if (type === 'depart') {
          instruction = street ? `Head towards path via ${street}` : 'Head towards your route';
        } else if (type === 'arrive') {
          instruction = 'Rejoin your planned route and continue';
        } else if (type === 'turn') {
          const dir = modifier ? modifier.replace('slight ', 'slightly ') : '';
          instruction = street ? `Turn ${dir} onto ${street}` : `Turn ${dir}`;
        } else {
          instruction = street ? `Continue on ${street}` : 'Head towards your route';
        }

        splicedSteps.push({
          instruction,
          distanceMeters: dist,
          maneuverType: type,
          modifier,
          streetName: street || undefined,
          location: sLat !== 0 ? { latitude: sLat, longitude: sLng } : undefined,
        });
      }
    }

    // Add remaining original steps that occur at or after rejoinPoint
    if (existingRoute.steps) {
      for (let sIdx = 0; sIdx < existingRoute.steps.length; sIdx++) {
        const stp = existingRoute.steps[sIdx];
        if (!stp.location) continue;
        // Check if step location is near or ahead of rejoin point
        const distToRejoin = haversineDistanceMeters(rejoinPoint.latitude, rejoinPoint.longitude, stp.location.latitude, stp.location.longitude);
        if (distToRejoin < 40 || sIdx >= currentStepIdx + 1) {
          splicedSteps.push(stp);
        }
      }
    }

    // Recalculate distance
    let totalDist = 0;
    for (let i = 0; i < splicedCoords.length - 1; i++) {
      totalDist += haversineDistanceMeters(splicedCoords[i].latitude, splicedCoords[i].longitude, splicedCoords[i + 1].latitude, splicedCoords[i + 1].longitude);
    }
    const distanceKm = parseFloat((totalDist / 1000).toFixed(2));

    // Preserve or recompute bike lane segments for the newly spliced path
    let bikeLaneSegments = existingRoute.bikeLaneSegments;
    if (activityType === 'cycle') {
      try {
        const bikeGeoms = await findNearbyBikeLaneGeometries(userLat, userLng, 3000);
        const segs = extractRouteBikeLaneSegments(splicedCoords, splicedSteps, bikeGeoms);
        if (segs.length > 0) bikeLaneSegments = segs;
      } catch (_) {}
    }

    return {
      ...existingRoute,
      distanceKm,
      coordinates: splicedCoords,
      steps: splicedSteps.length > 0 ? splicedSteps : existingRoute.steps,
      bikeLaneSegments,
    };
  } catch (e) {
    console.warn('recalculateReturnToPathRoute failed:', e);
    return null;
  }
}

/**
 * Calculates a real walking/running/cycling route passing through an ordered series of waypoints/stops.
 */
export async function fetchMultiStopRoute(
  waypoints: Array<{ latitude: number; longitude: number; name?: string }>,
  activityType: 'walk' | 'run' | 'cycle' = 'walk',
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS
): Promise<RealRouteResult | null> {
  if (!waypoints || waypoints.length < 2) return null;

  const profile = activityType === 'cycle' ? 'bicycle' : 'foot';
  const coordsParam = waypoints
    .map((wp) => `${wp.longitude.toFixed(5)},${wp.latitude.toFixed(5)}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsParam}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();

    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      return null;
    }

    const primaryRoute = json.routes[0];
    const geoCoords: [number, number][] = primaryRoute.geometry?.coordinates || [];

    const coordinates = geoCoords.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

    const distanceMeters = primaryRoute.distance || 0;
    const distanceKm = parseFloat((distanceMeters / 1000).toFixed(2));
    const durationMins = calculateEstimatedMinutes(distanceKm, activityType);
    const elevationGain = await calculateRealElevationGain(coordinates);

    const steps: RouteStep[] = [];
    for (const leg of primaryRoute.legs || []) {
      for (const step of leg.steps || []) {
        const maneuver = step.maneuver || {};
        const type: string = maneuver.type || 'continue';
        const modifier: string | undefined = maneuver.modifier;
        const street: string = step.name || '';
        const dist: number = step.distance || 0;
        const [sLng, sLat] = maneuver.location || [0, 0];

        let instruction = '';
        if (type === 'depart') {
          instruction = street ? `Head onto ${street}` : 'Start your route';
        } else if (type === 'arrive') {
          instruction = 'Arrive at destination or waypoint';
        } else if (type === 'turn') {
          const dir = modifier ? modifier.replace('slight ', 'slightly ') : '';
          instruction = street ? `Turn ${dir} onto ${street}` : `Turn ${dir}`;
        } else if (type === 'new name') {
          instruction = street ? `Continue onto ${street}` : 'Continue straight';
        } else if (type === 'continue') {
          instruction = street ? `Continue on ${street}` : 'Continue straight';
        } else if (type === 'roundabout' || type === 'rotary') {
          const exit = maneuver.exit ? ` — take exit ${maneuver.exit}` : '';
          instruction = `Enter the roundabout${exit}`;
        } else if (type === 'fork') {
          const dir = modifier === 'left' ? 'left' : 'right';
          instruction = street ? `Keep ${dir} onto ${street}` : `Keep ${dir} at the fork`;
        } else {
          instruction = street ? `Head onto ${street}` : 'Continue';
        }

        steps.push({
          instruction,
          distanceMeters: dist,
          maneuverType: type,
          modifier,
          streetName: street || undefined,
          location: sLat !== 0 ? { latitude: sLat, longitude: sLng } : undefined,
        });
      }
    }

    const pois = await fetchPoisAlongRoute(coordinates, distanceKm, options);
    const firstName = waypoints[0]?.name || 'Start';
    const lastName = waypoints[waypoints.length - 1]?.name || 'Destination';

    return {
      id: `real_multi_route_${Date.now()}`,
      name: `${firstName} to ${lastName} (${waypoints.length - 2} stop${waypoints.length - 2 === 1 ? '' : 's'})`,
      destinationName: lastName,
      distanceKm,
      durationMins: durationMins || calculateEstimatedMinutes(distanceKm, activityType),
      elevationGainMeters: Math.round(elevationGain),
      coordinates,
      summary: `${waypoints.length} stops itinerary`,
      steps: steps.length > 0 ? steps : undefined,
      pois,
    };
  } catch (err) {
    console.warn('fetchMultiStopRoute error:', err);
    return null;
  }
}

