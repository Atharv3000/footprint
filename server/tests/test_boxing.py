import random
import unittest
from server.boxing import BoxingGame


def pose(hand=None, kind=None):
    result = {}
    for side, sign in [('l', 1), ('r', -1)]:
        s = (.5*sign, 0, 0); e = (.7*sign, .15, -.05)
        w = (.55*sign, 0 if kind == 'uppercut' else -.45, -.1)
        if hand == side:
            if kind == 'straight': w = (.25*sign, -.4, -1.2); e = (.35*sign, -.2, -.6)
            elif kind == 'hook': w = (-.1*sign, -.4, -.1); e = (.5*sign, .1, -.5)
            elif kind == 'uppercut': w = (.25*sign, -.55, -.2); e = (.65*sign, .1, -.5)
        for joint, v in [('shoulder', s), ('elbow', e), ('wrist', w)]:
            name = f'{joint}_{side}'
            result[name] = dict(id=name, x=.5+v[0]*.3, y=.5+v[1]*.3, z=v[2]*.3, visibility=.99)
    return result


class BoxingTests(unittest.TestCase):
    def ready(self, side='l', kind='straight'):
        game = BoxingGame(random.Random(1))
        for now in (0, .25, .5): game.update(pose(kind=kind), now)
        self.assertTrue(game.calibrated)
        game.target = dict(id=1, hand=side, kind=kind, born=0, x=(-.1 if side == 'l' else .1) if kind == 'hook' else (.25 if side == 'l' else -.25), y=-.1 if kind == 'uppercut' else -.4)
        for n in range(1, 8): game.update(pose(kind=kind), .5+n*.25)
        return game

    def test_six_requested_punches(self):
        for side in ('l', 'r'):
            for kind in ('straight', 'hook', 'uppercut'):
                with self.subTest(side=side, kind=kind):
                    game = self.ready(side, kind)
                    state = game.update(pose(side, kind), 2.5)
                    self.assertEqual(state['rep_count'], 1)
                    self.assertEqual(state['boxing']['score'], 100)
                    game.update(pose(side, kind), 2.75)
                    self.assertEqual(game.hits, 1)

    def test_wrong_hand_and_stationary_guard_do_not_score(self):
        game = self.ready()
        game.update(pose('r', 'straight'), 2.5)
        self.assertEqual(game.hits, 0)
        for n in range(10): game.update(pose(), 2.75+n*.25)
        self.assertEqual(game.hits, 0)
        self.assertEqual(game.misses, 1)

    def test_camera_orientation_preserves_anatomical_hands(self):
        for side in ('l', 'r'):
            for kind in ('straight', 'hook', 'uppercut'):
                game = self.ready(side, kind)
                game.pause()
                for n in range(5):
                    points = pose(kind=kind)
                    for p in points.values(): p['x'] = 1-p['x']
                    game.update(points, 3+n*.25)
                points = pose(side, kind)
                for p in points.values(): p['x'] = 1-p['x']
                self.assertEqual(game.update(points, 4.25)['rep_count'], 1, (side, kind))

    def test_http_boxing_reset_frames_pause_and_return_to_reps(self):
        from fastapi.testclient import TestClient
        from server import app as service
        class FakeVision:
            def analyze(self, image, upright=False):
                if image != 'fixture': raise ValueError('Bad frame')
                return pose(), 1, 'preview'
        old_token, old_vision = service.TOKEN, service.vision
        service.TOKEN = 'boxing-fixture-token'; service.vision = FakeVision()
        try:
            api = TestClient(service.app); headers = {'Authorization': 'Bearer '+service.TOKEN}
            session = api.post('/rep-api/session', headers=headers).json()
            headers['X-Rep-Session'] = session['session']
            response = api.post('/rep-api/command', headers=headers, json={'type': 'reset', 'exercise': 'boxing'})
            self.assertEqual(response.status_code, 200)
            state = api.post('/rep-api/frame', headers=headers, json={'image': 'fixture'}).json()['messages'][0]
            self.assertEqual(state['type'], 'pose'); self.assertIn('boxing', state)
            self.assertEqual(api.post('/rep-api/command', headers=headers, json={'type': 'pause'}).status_code, 200)
            self.assertEqual(api.post('/rep-api/command', headers=headers, json={'type': 'reset', 'exercise': 'squats'}).status_code, 200)
            self.assertIsNone(service.sessions[session['session']].boxing)
            api.post('/rep-api/close', headers=headers)
        finally:
            service.TOKEN, service.vision = old_token, old_vision

    def test_early_and_wrong_direction_do_not_score(self):
        game = BoxingGame()
        for now in (0, .25, .5): game.update(pose(), now)
        game.target.update(hand='l', kind='straight', x=.25, y=-.4)
        game.update(pose('l', 'straight'), .75)
        self.assertEqual(game.hits, 0)
        game = self.ready('l', 'uppercut')
        game.update(pose('l', 'straight'), 2.5)
        self.assertEqual(game.hits, 0)

    def test_tracking_loss_and_network_gap_freeze_without_hits(self):
        game = self.ready(); clock = game.clock
        state = game.update({}, 5)
        self.assertFalse(state['valid']); self.assertEqual(game.clock, clock)
        game.update(pose('l', 'straight'), 8)
        self.assertEqual(game.hits, 0); self.assertEqual(game.clock, clock)

    def test_bad_visibility_and_nonfinite_points_rejected(self):
        for key, value in [('visibility', .2), ('x', float('nan'))]:
            points = pose(); points['wrist_l'][key] = value
            self.assertFalse(BoxingGame().update(points, 0)['valid'])

    def test_random_bag_contains_all_six_and_round_finishes(self):
        game = BoxingGame(random.Random(42)); kinds = set()
        for _ in range(6):
            game.spawn(); kinds.add((game.target['hand'], game.target['kind']))
        self.assertEqual(len(kinds), 6)
        game = self.ready(); game.clock = 59.9
        state = game.update(pose(), 2.5)
        self.assertTrue(state['boxing']['finished']); self.assertIsNone(state['boxing']['target'])
        self.assertEqual(state['boxing']['remaining'], 0)


if __name__ == '__main__': unittest.main()
