export interface StreetSegment {
  id: string;
  name: string;
  popularity: number;
  strokeColor: string;
  strokeWidth: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

/**
 * Generates an extensive, faint, unified-color street network.
 * All streets use the same faint electric lime tone with differing thicknesses (1.5px to 4.5px)
 * creating a subtle, clean, professional activity network overlay.
 * Coordinates are fixed geographically to ensure 100% stable alignment during camera rotation and 3D tilt.
 */
export function generateRegionalStreetNetwork(
  anchorLat: number,
  anchorLng: number
): StreetSegment[] {
  const segments: StreetSegment[] = [];

  // Exactly the same color and faint opacity for every single street
  const COLOR_FAINT_UNIFIED = 'rgba(163, 230, 53, 0.16)';
  const COLOR_FAINT_MAJOR = COLOR_FAINT_UNIFIED;
  const COLOR_FAINT_MED = COLOR_FAINT_UNIFIED;
  const COLOR_FAINT_MINOR = COLOR_FAINT_UNIFIED;

  // Span a ~4km x 4km surrounding area
  const step = 0.0028; // ~300 meters per city block

  // 1. Long North-South Avenues
  const nsIndices = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  nsIndices.forEach((i) => {
    const lngOffset = i * step;
    const isMajor = Math.abs(i) % 3 === 0;
    const isMed = Math.abs(i) % 2 === 0;

    segments.push({
      id: `ns_corridor_${i}`,
      name: `Avenue ${i + 6}`,
      popularity: isMajor ? 90 : isMed ? 70 : 50,
      strokeColor: isMajor ? COLOR_FAINT_MAJOR : isMed ? COLOR_FAINT_MED : COLOR_FAINT_MINOR,
      strokeWidth: isMajor ? 4.5 : isMed ? 2.8 : 1.5,
      coordinates: [
        { latitude: anchorLat - 0.016, longitude: anchorLng + lngOffset },
        { latitude: anchorLat - 0.008, longitude: anchorLng + lngOffset },
        { latitude: anchorLat, longitude: anchorLng + lngOffset },
        { latitude: anchorLat + 0.008, longitude: anchorLng + lngOffset },
        { latitude: anchorLat + 0.016, longitude: anchorLng + lngOffset },
      ],
    });
  });

  // 2. Long East-West Cross Streets
  const ewIndices = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  ewIndices.forEach((j) => {
    const latOffset = j * step;
    const isMajor = Math.abs(j) % 3 === 0;
    const isMed = Math.abs(j) % 2 === 0;

    segments.push({
      id: `ew_corridor_${j}`,
      name: `Street ${j + 10}`,
      popularity: isMajor ? 88 : isMed ? 68 : 48,
      strokeColor: isMajor ? COLOR_FAINT_MAJOR : isMed ? COLOR_FAINT_MED : COLOR_FAINT_MINOR,
      strokeWidth: isMajor ? 4.5 : isMed ? 2.8 : 1.5,
      coordinates: [
        { latitude: anchorLat + latOffset, longitude: anchorLng - 0.016 },
        { latitude: anchorLat + latOffset, longitude: anchorLng - 0.008 },
        { latitude: anchorLat + latOffset, longitude: anchorLng },
        { latitude: anchorLat + latOffset, longitude: anchorLng + 0.008 },
        { latitude: anchorLat + latOffset, longitude: anchorLng + 0.016 },
      ],
    });
  });

  // 3. Main Diagonal Arterial Thoroughfares (Connectors)
  segments.push(
    {
      id: 'main_diagonal_1',
      name: 'Main Thoroughfare',
      popularity: 95,
      strokeColor: COLOR_FAINT_MAJOR,
      strokeWidth: 5,
      coordinates: [
        { latitude: anchorLat - 0.015, longitude: anchorLng - 0.014 },
        { latitude: anchorLat - 0.007, longitude: anchorLng - 0.006 },
        { latitude: anchorLat, longitude: anchorLng },
        { latitude: anchorLat + 0.007, longitude: anchorLng + 0.006 },
        { latitude: anchorLat + 0.015, longitude: anchorLng + 0.014 },
      ],
    },
    {
      id: 'main_diagonal_2',
      name: 'Waterfront Diagonal Parkway',
      popularity: 92,
      strokeColor: COLOR_FAINT_MAJOR,
      strokeWidth: 4.5,
      coordinates: [
        { latitude: anchorLat + 0.015, longitude: anchorLng - 0.013 },
        { latitude: anchorLat + 0.007, longitude: anchorLng - 0.005 },
        { latitude: anchorLat, longitude: anchorLng },
        { latitude: anchorLat - 0.007, longitude: anchorLng + 0.005 },
        { latitude: anchorLat - 0.015, longitude: anchorLng + 0.013 },
      ],
    }
  );

  return segments;
}
