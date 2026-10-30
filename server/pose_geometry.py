"""Pose input rotation; coordinates always return in the original camera space."""


def preferred_rotation(points, aspect):
    sides = []
    for side in ('l', 'r'):
        shoulder, hip = points.get('shoulder_' + side), points.get('hip_' + side)
        if shoulder and hip:
            sides.append((min(shoulder['visibility'], hip['visibility']), shoulder, hip))
    if not sides: return 0
    confidence, shoulder, hip = max(sides, key=lambda item: item[0])
    dx = (shoulder['x'] - hip['x']) * aspect
    dy = shoulder['y'] - hip['y']
    if confidence >= .5 and abs(dx) > .12 and abs(dx) > abs(dy) * 1.5:
        return 90 if dx > 0 else 270
    return 0


def restore_point(x, y, rotation):
    if rotation == 90: return 1 - y, x
    if rotation == 270: return y, 1 - x
    return x, y


def arm_quality(points):
    return max((min(points[n + '_' + side]['visibility'] for n in ('shoulder', 'elbow', 'wrist', 'hip'))
                for side in ('l', 'r') if all(n + '_' + side in points for n in ('shoulder', 'elbow', 'wrist', 'hip'))), default=-1)
