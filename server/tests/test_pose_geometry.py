import unittest
from server.pose_geometry import preferred_rotation, restore_point


class PoseGeometryTests(unittest.TestCase):
    def test_head_left_and_head_right_rotate_in_opposite_directions(self):
        points = {'shoulder_l': {'x': .2, 'y': .4, 'visibility': .9},
                  'hip_l': {'x': .7, 'y': .4, 'visibility': .9}}
        self.assertEqual(preferred_rotation(points, 1), 270)
        points['shoulder_l']['x'], points['hip_l']['x'] = .8, .3
        self.assertEqual(preferred_rotation(points, 1), 90)

    def test_upright_and_uncertain_poses_are_not_rotated(self):
        points = {'shoulder_l': {'x': .5, 'y': .2, 'visibility': .9},
                  'hip_l': {'x': .5, 'y': .7, 'visibility': .9}}
        self.assertEqual(preferred_rotation(points, 1), 0)
        points['shoulder_l']['x'] = .1; points['shoulder_l']['visibility'] = .1
        self.assertEqual(preferred_rotation(points, 1), 0)
        self.assertEqual(preferred_rotation({}, 1), 0)

    def test_rotation_maps_landmarks_back_without_rotating_preview(self):
        # Original (.2, .7) becomes (.7, .8) under a 90-degree CCW rotation.
        x, y = restore_point(.7, .8, 90)
        self.assertAlmostEqual(x, .2); self.assertAlmostEqual(y, .7)
        x, y = restore_point(.3, .2, 270)
        self.assertAlmostEqual(x, .2); self.assertAlmostEqual(y, .7)


if __name__ == '__main__': unittest.main()
