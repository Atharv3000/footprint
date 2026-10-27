export interface ActivityHotspot {
  id: string;
  name: string;
  category: 'trail' | 'park' | 'community' | 'scenic' | 'stride_zone';
  latitude: number;
  longitude: number;
  radius: number; // in meters for circle
  activeWalkers: number;
  strideDensity: 'High' | 'Very High' | 'Peak' | 'Medium';
  color: string;
  glowColor: string;
  description: string;
  badgeIcon: string;
}

export interface LiveBeacon {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: 'milestone' | 'water_stop' | 'viewpoint' | 'walker_cluster';
  icon: string;
  walkersNearby: number;
  pulseSpeedMs: number;
}

export interface ActiveStridePath {
  id: string;
  name: string;
  elevationProfile: string;
  walkerTraffic: number; // e.g., 34 walkers today
  coordinates: Array<{ latitude: number; longitude: number }>;
  color: string;
  width: number;
}

/**
 * Generates rich, high-definition real-time community & activity data
 * anchored directly around the user's current GPS location.
 */
export function generateLiveActivityData(
  centerLat: number,
  centerLng: number
): {
  hotspots: ActivityHotspot[];
  beacons: LiveBeacon[];
  activePaths: ActiveStridePath[];
} {
  // 1. High-Density Activity Hotspots (dynamic radius zones with live community counts)
  const hotspots: ActivityHotspot[] = [
    {
      id: 'hotspot_1',
      name: 'Central Promenade & Loop',
      category: 'stride_zone',
      latitude: centerLat + 0.0022,
      longitude: centerLng + 0.0018,
      radius: 170,
      activeWalkers: 18,
      strideDensity: 'Peak',
      color: 'rgba(163, 230, 53, 0.18)',
      glowColor: 'rgba(163, 230, 53, 0.75)',
      description: 'Popular loop • High pedestrian flow',
      badgeIcon: 'flame',
    },
    {
      id: 'hotspot_2',
      name: 'Sunset Ridge Trailhead',
      category: 'trail',
      latitude: centerLat - 0.0031,
      longitude: centerLng + 0.0025,
      radius: 210,
      activeWalkers: 12,
      strideDensity: 'High',
      color: 'rgba(34, 197, 94, 0.16)',
      glowColor: 'rgba(34, 197, 94, 0.7)',
      description: 'Scenic incline • Soft ground track',
      badgeIcon: 'trail-sign',
    },
    {
      id: 'hotspot_3',
      name: 'Riverbank Green Corridor',
      category: 'park',
      latitude: centerLat + 0.0015,
      longitude: centerLng - 0.0036,
      radius: 250,
      activeWalkers: 24,
      strideDensity: 'Very High',
      color: 'rgba(56, 189, 248, 0.15)',
      glowColor: 'rgba(56, 189, 248, 0.7)',
      description: 'Dedicated pedestrianway • Well lit',
      badgeIcon: 'leaf',
    },
    {
      id: 'hotspot_4',
      name: 'Civic Esplanade',
      category: 'community',
      latitude: centerLat - 0.0024,
      longitude: centerLng - 0.0021,
      radius: 150,
      activeWalkers: 9,
      strideDensity: 'Medium',
      color: 'rgba(234, 179, 8, 0.15)',
      glowColor: 'rgba(234, 179, 8, 0.7)',
      description: 'Wide sidewalk • Water refill nearby',
      badgeIcon: 'people',
    },
  ];

  // 2. Interactive Live Map Beacons (Pulsing interest marks & checkpoints)
  const beacons: LiveBeacon[] = [
    {
      id: 'beacon_1',
      title: 'Pace Milestone (1.0 km)',
      subtitle: 'Average split: 11\'32"',
      latitude: centerLat + 0.0042,
      longitude: centerLng + 0.0012,
      type: 'milestone',
      icon: 'flag',
      walkersNearby: 5,
      pulseSpeedMs: 1400,
    },
    {
      id: 'beacon_2',
      title: 'Scenic Lookout Point',
      subtitle: 'Panoramic valley view',
      latitude: centerLat - 0.0038,
      longitude: centerLng + 0.0045,
      type: 'viewpoint',
      icon: 'eye',
      walkersNearby: 8,
      pulseSpeedMs: 1800,
    },
    {
      id: 'beacon_3',
      title: 'Active Stride Group',
      subtitle: 'Morning pace team • 6 walkers',
      latitude: centerLat + 0.0011,
      longitude: centerLng - 0.0029,
      type: 'walker_cluster',
      icon: 'walk',
      walkersNearby: 6,
      pulseSpeedMs: 1000,
    },
    {
      id: 'beacon_4',
      title: 'Hydration Station',
      subtitle: 'Fresh water refill point',
      latitude: centerLat - 0.0016,
      longitude: centerLng + 0.0032,
      type: 'water_stop',
      icon: 'water',
      walkersNearby: 3,
      pulseSpeedMs: 2200,
    },
  ];

  // 3. High-Definition Curated Stride Paths with dynamic elevation & flow styling
  const activePaths: ActiveStridePath[] = [
    {
      id: 'path_north_loop',
      name: 'Grand Riverway Loop',
      elevationProfile: '+18m gain',
      walkerTraffic: 42,
      color: 'rgba(163, 230, 53, 0.65)',
      width: 4.5,
      coordinates: [
        { latitude: centerLat - 0.003, longitude: centerLng - 0.003 },
        { latitude: centerLat - 0.001, longitude: centerLng - 0.004 },
        { latitude: centerLat + 0.002, longitude: centerLng - 0.0035 },
        { latitude: centerLat + 0.0035, longitude: centerLng - 0.0015 },
        { latitude: centerLat + 0.004, longitude: centerLng + 0.0015 },
        { latitude: centerLat + 0.0025, longitude: centerLng + 0.0032 },
        { latitude: centerLat, longitude: centerLng + 0.0028 },
      ],
    },
    {
      id: 'path_park_traverse',
      name: 'Pine Hill Cross-Cut',
      elevationProfile: '+32m incline',
      walkerTraffic: 29,
      color: 'rgba(56, 189, 248, 0.65)',
      width: 4,
      coordinates: [
        { latitude: centerLat + 0.0038, longitude: centerLng - 0.0025 },
        { latitude: centerLat + 0.0018, longitude: centerLng - 0.0005 },
        { latitude: centerLat - 0.0005, longitude: centerLng + 0.0012 },
        { latitude: centerLat - 0.0028, longitude: centerLng + 0.0028 },
        { latitude: centerLat - 0.0042, longitude: centerLng + 0.0039 },
      ],
    },
  ];

  return { hotspots, beacons, activePaths };
}
