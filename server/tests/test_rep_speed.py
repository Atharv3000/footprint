"""Rotation tracking (one pose run per frame) and capture-time rep timing."""
import unittest
from unittest import mock

from server import app as service
from server.vision import Vision

LYING = {'shoulder_l': {'x': .8, 'y': .4, 'visibility': .9}, 'hip_l': {'x': .3, 'y': .4, 'visibility': .9}}
ARM = {**LYING, 'elbow_l': {'x': .8, 'y': .6, 'visibility': .9}, 'wrist_l': {'x': .8, 'y': .8, 'visibility': .9}}
STANDING = {'shoulder_l': {'x': .5, 'y': .2, 'visibility': .9}, 'hip_l': {'x': .5, 'y': .7, 'visibility': .9}}


def fake_vision(by_rotation):
    """A Vision whose network returns ``by_rotation[angle]`` and records each run."""
    vision = Vision.__new__(Vision)
    vision.detections = 0
    calls = []

    def points(detector, rgb, rotation=0):
        calls.append(rotation); vision.detections += 1
        return by_rotation.get(rotation, {})
    vision._points = points
    return vision, calls


class RotationTrackingTests(unittest.TestCase):
    def test_lying_body_needs_one_run_once_rotation_is_known(self):
        vision, calls = fake_vision({0: LYING, 90: LYING})
        track = {}
        self.assertEqual(vision._locate(None, None, 1, False, track)[1], 90)
        self.assertEqual(calls, [0, 90])  # first frame: find the rotation
        track['rotation'] = 90
        calls.clear()
        points, rotation = vision._locate(None, None, 1, False, track)
        self.assertEqual((points, rotation, calls), (LYING, 90, [90]))

    def test_standing_up_falls_back_to_the_full_search(self):
        vision, calls = fake_vision({0: STANDING, 90: STANDING})
        points, rotation = vision._locate(None, None, 1, False, {'rotation': 90})
        self.assertEqual((points, rotation), (STANDING, 0))
        self.assertEqual(calls, [90, 0])

    def test_untracked_and_upright_calls_keep_the_old_behaviour(self):
        vision, calls = fake_vision({0: LYING, 90: LYING})
        self.assertEqual(vision._locate(None, None, 1, False, None)[1], 90)
        self.assertEqual(calls, [0, 90])
        calls.clear()
        self.assertEqual(vision._locate(None, None, 1, True, {'rotation': 90}), (LYING, 0))
        self.assertEqual(calls, [0])

    def test_no_person_tries_both_sideways_rotations_once(self):
        vision, calls = fake_vision({270: ARM})
        points, rotation = vision._locate(None, None, 1, False, {'rotation': 90})
        self.assertEqual((points, rotation), (ARM, 270))
        self.assertEqual(sorted(calls), [0, 90, 270])


class CaptureTimeTests(unittest.TestCase):
    def stamps(self, frames):
        client = service.Client()
        out = []
        for server_now, captured_at in frames:
            with mock.patch.object(service.time, 'monotonic', lambda: server_now):
                out.append(service.frame_time(client, captured_at))
        return out

    def test_upload_delay_does_not_change_rep_timing(self):
        # Photos taken 0.25 s apart arrive with 0.1-0.6 s of varying network delay.
        stamps = self.stamps([(100.1, 5000), (100.85, 5250), (100.7 + .4, 5500), (101.35, 5750)])
        gaps = [round(b - a, 3) for a, b in zip(stamps, stamps[1:])]
        self.assertEqual(gaps, [.25, .25, .25])

    def test_stamps_never_run_ahead_of_the_server_or_backwards(self):
        stamps = self.stamps([(10.0, 1000), (10.1, 1900), (10.2, 1800)])
        self.assertLessEqual(stamps[1], 10.1)
        self.assertGreater(stamps[2], stamps[1])

    def test_large_drift_reanchors_and_bad_values_use_arrival_time(self):
        stamps = self.stamps([(10.0, 1000), (20.0, 1250), (21.0, None), (22.0, 'x'), (23.0, float('nan')), (24.0, True)])
        self.assertEqual(stamps[1], 20.0)
        self.assertEqual(stamps[2:], [21.0, 22.0, 23.0, 24.0])


if __name__ == '__main__': unittest.main()
