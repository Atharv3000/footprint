import unittest

from server.counter import RepCounter


def pose(down=False):
    points = {'nose': (.5, .47 if down else .2), 'hip_l': (.4, .55 if down else .3),
              'hip_r': (.6, .55 if down else .3), 'shoulder_l': (.35, .62 if down else .35),
              'shoulder_r': (.65, .62 if down else .35), 'elbow_l': (.2 if down else .3, .61 if down else .55),
              'elbow_r': (.8 if down else .7, .61 if down else .55),
              'wrist_l': (.25, .75), 'wrist_r': (.75, .75)}
    return {n: {'x': x, 'y': y, 'visibility': .95} for n, (x, y) in points.items()}


class CounterTests(unittest.TestCase):
    def setUp(self): self.counter = RepCounter(); self.now = 0

    def feed(self, points, repeats=1):
        for _ in range(repeats):
            self.now += .45
            result = self.counter.update(points, self.now)
        return result

    def top(self): self.feed(pose(), 5)

    def test_full_head_on_cycle_counts_once(self):
        self.top(); self.feed(pose(True), 3)
        result = self.feed(pose(), 3)
        self.assertEqual(result['rep_count'], 1)
        self.feed(pose(), 8)
        self.assertEqual(self.counter.count, 1)

    def test_starting_at_bottom_does_not_count(self):
        self.feed(pose(True), 5); self.top()
        self.assertEqual(self.counter.count, 0)

    def test_single_frame_jitter_is_not_a_rep(self):
        self.top(); self.feed(pose(True)); self.feed(pose(), 4)
        self.assertEqual(self.counter.count, 0)

    def test_one_visible_arm_is_enough(self):
        self.top(); self.feed(pose(True), 3)
        hidden = pose(True); hidden['elbow_l']['visibility'] = .1
        self.assertTrue(self.feed(hidden)['valid'])
        self.feed(pose(), 4)
        self.assertEqual(self.counter.count, 1)

    def test_standing_arm_bends_rejected(self):
        points = pose(); points['hip_l']['y'] = points['hip_r']['y'] = .95
        result = self.feed(points, 5)
        self.assertFalse(result['valid'])
        self.assertIn('Body detected', result['feedback'])
        self.assertEqual(self.counter.count, 0)

    def test_head_motion_with_straight_arms_is_not_a_rep(self):
        self.top()
        points = pose(); points['nose']['y'] += .2
        self.feed(points, 5); self.feed(pose(), 5)
        self.assertEqual(self.counter.count, 0)

    def test_gap_discards_incomplete_rep_and_recalibrates(self):
        self.top(); self.feed(pose(True), 3); self.now += 2
        self.feed(pose(), 5)
        self.assertEqual(self.counter.count, 0)

    def test_pause_preserves_total_but_not_partial_cycle(self):
        self.top(); self.feed(pose(True), 3); self.feed(pose(), 3)
        self.counter.reset_cycle()
        self.assertEqual(self.counter.count, 1)
        self.assertEqual(self.counter.phase, 'ready')

    def test_zero_length_segments_are_rejected(self):
        self.top(); points = pose()
        for side in ('l', 'r'): points['elbow_' + side] = points['wrist_' + side].copy()
        self.assertFalse(self.feed(points)['valid'])

    def test_face_centering_is_not_required_for_side_on_counting(self):
        points = pose(); points['nose']['x'] = .98
        self.assertTrue(self.feed(points)['valid'])

    def test_two_reps_and_no_duplicate_on_holds(self):
        self.top()
        for _ in range(2): self.feed(pose(True), 3); self.feed(pose(), 3)
        self.assertEqual(self.counter.count, 2)

    def test_side_on_cycle_without_face_or_far_arm(self):
        top = {n: {'x': x, 'y': y, 'visibility': .95} for n, (x, y) in {
            'shoulder_l': (.35, .3), 'elbow_l': (.35, .5), 'wrist_l': (.35, .7), 'hip_l': (.75, .3)}.items()}
        bottom = {n: p.copy() for n, p in top.items()}
        bottom['shoulder_l']['y'] = .57; bottom['hip_l']['y'] = .55
        bottom['elbow_l'].update(x=.2, y=.56)
        self.feed(top, 4); self.feed(bottom, 3)
        result = self.feed(top, 3)
        self.assertEqual(result['view_mode'], 'side'); self.assertEqual(result['rep_count'], 1)

    def test_brief_dropout_does_not_erase_an_observed_bottom(self):
        self.top(); self.feed(pose(True), 3); self.feed({})
        self.feed(pose(), 3)
        self.assertEqual(self.counter.count, 1)

    def test_extended_occlusion_requires_fresh_calibration(self):
        self.top(); self.feed(pose(True), 3); self.feed({}, 5)
        self.assertIsNone(self.counter.top_height)
        self.feed(pose(), 4)
        self.assertEqual(self.counter.count, 0)

    def test_battle_go_retains_recent_top_calibration_and_counts_first_rep(self):
        self.top(); self.counter.begin_set(self.now)
        self.assertIsNotNone(self.counter.top_height)
        self.feed(pose(True), 3); self.feed(pose(), 3)
        self.assertEqual(self.counter.count, 1)

    def test_battle_go_does_not_preserve_a_prestart_bottom(self):
        self.top(); self.feed(pose(True), 3); self.counter.begin_set(self.now)
        self.assertIsNone(self.counter.top_height)
        self.feed(pose(), 4)
        self.assertEqual(self.counter.count, 0)

    def test_battle_go_discards_stale_calibration(self):
        self.top(); self.counter.begin_set(self.now + 2)
        self.assertIsNone(self.counter.top_height)


if __name__ == '__main__': unittest.main()
