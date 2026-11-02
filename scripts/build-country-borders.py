"""Build the bundled virtual-route catalog from Natural Earth's 110m GeoJSON.
Usage: python scripts/build-country-borders.py input.geojson assets/data/countryBorders.json
"""
import hashlib
import json
import math
from pathlib import Path
import sys


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def build(source):
    countries = []
    for feature in json.loads(source)['features']:
        p = feature['properties']; geometry = feature['geometry']
        if p['ADM0_A3'] == 'ATA': continue
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        rings = [ring for polygon in polygons for ring in polygon if len(ring) > 3]
        all_points = [point for ring in rings for point in ring]
        lons = sorted(set(point[0] % 360 for point in all_points))
        gap = max(range(len(lons)), key=lambda i: (lons[(i+1) % len(lons)]-lons[i]) % 360)
        start = lons[(gap+1) % len(lons)]
        coslat = math.cos(math.radians(sum(point[1] for point in all_points)/len(all_points)))
        def project(point): return (((point[0] % 360-start) % 360)*coslat, -point[1])
        projected = [project(point) for point in all_points]
        minx, maxx = min(p[0] for p in projected), max(p[0] for p in projected)
        miny, maxy = min(p[1] for p in projected), max(p[1] for p in projected)
        scale = min(920/max(maxx-minx, .001), 620/max(maxy-miny, .001))
        dx, dy = (1000-(maxx-minx)*scale)/2, (700-(maxy-miny)*scale)/2
        result = []
        for ring in rings:
            pts = [[round((project(point)[0]-minx)*scale+dx, 1), round((project(point)[1]-miny)*scale+dy, 1)] for point in ring]
            lengths = [round(distance(a, b), 3) for a, b in zip(ring, ring[1:])]
            result.append(dict(points=pts, lengths=lengths))
        result.sort(key=lambda ring: sum(ring['lengths']), reverse=True)
        countries.append(dict(id=p['ADM0_A3'], name=p.get('NAME_EN') or p['ADMIN'],
                              totalKm=round(sum(sum(r['lengths']) for r in result), 3), rings=result))
    return dict(source='Natural Earth 1:110m Admin-0 Countries; public domain',
                sourceUrl='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
                sha256=hashlib.sha256(source).hexdigest(), countries=sorted(countries, key=lambda c: c['name']))


if __name__ == '__main__':
    result = build(Path(sys.argv[1]).read_bytes())
    Path(sys.argv[2]).write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=True), encoding='utf-8')
    print(f"Built {len(result['countries'])} country/region outlines")
