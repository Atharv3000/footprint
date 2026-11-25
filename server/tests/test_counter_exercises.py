"""Squat and curl counting, arm relabelling and the trained-parameter loader."""
import json
import math
import tempfile
import unittest
from pathlib import Path

from server.counter import DEFAULT_PARAMS, RepCounter, load_params


def P(x, y, v=.95):
    return {'x': x, 'y': y, 'visibility': v}


def standing(hip_y=.5, knee_angle=178, cx=.5):
    """Front view, shoulders above hips, legs straight or bent at the knee."""
    pts = {}
    bend = math.radians(180 - knee_angle) / 2
    for side, dx in (('l', -.06), ('r', .06)):
        x = cx + dx
        pts[f'shoulder_{side}'] = P(x, hip_y - .25)
        pts[f'hip_{side}'] = P(x, hip_y)
        knee = (x + .2 * math.sin(bend), hip_y + .2 * math.cos(bend))
        pts[f'knee_{side}'] = P(*knee)
        pts[f'ankle_{side}'] = P(x, knee[1] + .2 * math.cos(bend))
    return pts


def arms(left, right, elbow_up=False):
    """Standing body with each forearm at the given elbow angle (degrees)."""
    pts = standing()
    for side, ang, sx in (('l', left, .44), ('r', right, .56)):
        if ang is None:
            continue
        sy = .25
        ey = sy - .15 if elbow_up else sy + .15
        pts[f'shoulder_{side}'] = P(sx, sy)
        pts[f'elbow_{side}'] = P(sx, ey)
        # Forearm rotates forward/up from hanging straight down.
        a = math.radians(180 - ang)
        direction = -1 if elbow_up else 1
        pts[f'wrist_{side}'] = P(sx + .01, ey + direction * .15 * math.cos(a))
        if not elbow_up:
            pts[f'wrist_{side}'] = P(sx + .15 * math.sin(a) * .2, ey + .15 * math.cos(a))
    return pts


class Feed:
    def __init__(self, exercise):
        self.c = RepCounter(exercise, params=DEFAULT_PARAMS); self.t = 0

    def __call__(self, pts, n=1, dt=.25):
        for _ in range(n):
            self.t += dt; r = self.c.update(pts, self.t)
        return r


class SquatTests(unittest.TestCase):
    def test_deep_squats_count(self):
        f = Feed('squats')
        f(standing(), 4)
        for _ in range(3):
            f(standing(.6, 140), 1); f(standing(.68, 80), 3); f(standing(.6, 140), 1); f(standing(), 3)
        self.assertEqual(f.c.count, 3)

    def test_front_view_squat_counts_from_hip_drop(self):
        # Knees barely change angle in a front view; the hip drop marks depth.
        f = Feed('squats')
        f(standing(.4, 178), 4)
        f(standing(.5, 150), 3); f(standing(.4, 178), 3)
        self.assertEqual(f.c.count, 1)

    def test_half_bend_does_not_count(self):
        f = Feed('squats')
        f(standing(), 4); f(standing(.52, 160), 3); f(standing(), 3)
        self.assertEqual(f.c.count, 0)

    def test_lying_body_is_rejected(self):
        f = Feed('squats')
        pts = standing()
        for side in 'lr':
            pts[f'shoulder_{side}'] = P(.2, .5); pts[f'hip_{side}'] = P(.5, .52)
        self.assertFalse(f(pts, 3)['valid'])


class CurlTests(unittest.TestCase):
    def test_barbell_curl_counts_once_for_both_arms(self):
        f = Feed('bicep_curls')
        f(arms(175, 175), 3)
        for _ in range(3):
            f(arms(40, 40), 3); f(arms(175, 175), 3)
        self.assertEqual(f.c.count, 3)

    def test_alternating_curls_count_each_arm(self):
        f = Feed('bicep_curls')
        f(arms(175, 175), 3)
        f(arms(40, 175), 3); f(arms(175, 175), 4)
        f(arms(175, 40), 3); f(arms(175, 175), 4)
        self.assertEqual(f.c.count, 2)

    def test_overhead_press_is_not_a_curl(self):
        f = Feed('bicep_curls')
        for _ in range(4):
            f(arms(170, 170, elbow_up=True), 3); f(arms(60, 60, elbow_up=True), 3)
        self.assertEqual(f.c.count, 0)

    def test_moving_hips_block_curls(self):
        f = Feed('bicep_curls')
        # Squat-like: hips drop while the arms bend, rise as they straighten.
        f(arms(175, 175), 3)
        for _ in range(4):
            pts = arms(40, 40)
            for name in ('hip_l', 'hip_r'):
                pts[name]['y'] += .15
            f(pts, 2); f(arms(175, 175), 2)
        self.assertEqual(f.c.count, 0)


class PushupRelabelTests(unittest.TestCase):
    def side_plank(self, side, bottom=False):
        y = .5 if bottom else .3
        pts = {f'shoulder_{side}': P(.35, y), f'elbow_{side}': P(.25 if bottom else .35, .55 if bottom else .5),
               f'wrist_{side}': P(.35, .7), f'hip_{side}': P(.75, y)}
        return pts

    def test_left_right_label_swap_keeps_the_rep(self):
        f = Feed('pushups')
        f(self.side_plank('l'), 4); f(self.side_plank('l', True), 4)
        # MediaPipe relabels the same near arm as "right" mid-rep.
        f(self.side_plank('r'), 3)
        self.assertEqual(f.c.count, 1)


class ParamLoaderTests(unittest.TestCase):
    def test_bad_or_unknown_values_fall_back_to_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'p.json'
            path.write_text(json.dumps({'squats': {'up_angle': 150, 'down_angle': 'x', 'evil': 1},
                                        'unknown': {'a': 1}, '_meta': {}}))
            p = load_params(path)
        self.assertEqual(p['squats']['up_angle'], 150)
        self.assertEqual(p['squats']['down_angle'], DEFAULT_PARAMS['squats']['down_angle'])
        self.assertNotIn('evil', p['squats']); self.assertNotIn('unknown', p)

    def test_missing_file_gives_defaults(self):
        self.assertEqual(load_params('/nonexistent/params.json'), DEFAULT_PARAMS)


if __name__ == '__main__':
    unittest.main()
