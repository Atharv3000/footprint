import unittest
import time
from fastapi.testclient import TestClient
from server import app as service
from server.battle import Battles
from server.tests.test_counter import pose


class FakeVision:
    def analyze(self, image):
        if image != 'fixture': raise ValueError('Invalid camera image.')
        return pose(), 1, 'preview'
    def close(self): pass


class ApiTests(unittest.TestCase):
    def setUp(self):
        service.TOKEN = 't' * 48; service.vision = FakeVision()
        service.clients.clear(); service.sessions.clear(); service.battles = Battles()
        self.client = TestClient(service.app); self.client.__enter__()
        self.auth = {'Authorization': 'Bearer ' + service.TOKEN}

    def tearDown(self): self.client.__exit__(None, None, None)

    def player(self):
        r = self.client.post('/rep-api/session', headers=self.auth)
        self.assertEqual(r.status_code, 200)
        return r.json()['player_id'], {**self.auth, 'X-Rep-Session': r.json()['session']}

    def command(self, headers, **body): return self.client.post('/rep-api/command', headers=headers, json=body)

    def test_session_auth_and_separate_player_capabilities(self):
        self.assertEqual(self.client.post('/rep-api/session').status_code, 401)
        _, headers = self.player()
        self.assertEqual(self.client.get('/rep-api/poll', headers=self.auth).status_code, 401)
        self.assertEqual(self.client.get('/rep-api/poll', headers=headers).status_code, 200)

    def test_room_invite_and_snapshot_reach_both_players(self):
        a, ah = self.player(); b, bh = self.player()
        self.command(ah, type='create', name='Alice')
        room = service.battles.get(a)
        self.command(bh, type='join', name='Bob', code=room.code)
        for headers in (ah, bh):
            messages = self.client.get('/rep-api/poll', headers=headers).json()['messages']
            state = next(m for m in messages if m['type'] == 'battle_state')
            self.assertEqual(state['players'], [a, b]); self.assertEqual(state['host_share'], .5)

    def test_client_cannot_submit_reps_or_ready_without_a_pose(self):
        _, headers = self.player(); self.command(headers, type='create', name='A')
        self.assertEqual(self.command(headers, type='rep', count=1000).status_code, 400)
        self.assertEqual(self.command(headers, type='ready', ready=True).status_code, 400)

    def test_frame_routes_pose_and_preview_but_rejects_invalid_images(self):
        a, ah = self.player(); _, bh = self.player()
        self.command(ah, type='create'); self.command(bh, type='join', code=service.battles.get(a).code)
        r = self.client.post('/rep-api/frame', headers=ah, json={'image': 'fixture'})
        self.assertEqual(r.status_code, 200); self.assertEqual(r.json()['messages'][0]['type'], 'pose')
        messages = self.client.get('/rep-api/poll', headers=bh).json()['messages']
        self.assertTrue(any(m['type'] == 'opponent_frame' for m in messages))
        service.clients[a].frame_at = 0
        self.assertEqual(self.client.post('/rep-api/frame', headers=ah, json={'image': 'bad'}).status_code, 400)

    def test_large_body_and_missing_session_are_rejected(self):
        _, h = self.player()
        self.assertEqual(self.client.post('/rep-api/frame', headers=h, content='x' * 2900001).status_code, 413)
        self.assertEqual(self.client.post('/rep-api/frame', headers=self.auth, json={'image': 'fixture'}).status_code, 401)

    def test_close_notifies_other_player_and_removes_session(self):
        a, ah = self.player(); _, bh = self.player()
        self.command(ah, type='create'); self.command(bh, type='join', code=service.battles.get(a).code)
        self.client.post('/rep-api/close', headers=ah)
        self.assertEqual(self.client.get('/rep-api/poll', headers=ah).status_code, 401)
        messages = self.client.get('/rep-api/poll', headers=bh).json()['messages']
        self.assertTrue(any(m.get('status') == 'cancelled' for m in messages))

    def test_leaving_does_not_deliver_a_stale_room_back_to_the_leaver(self):
        a, ah = self.player(); _, bh = self.player()
        self.command(ah, type='create'); self.command(bh, type='join', code=service.battles.get(a).code)
        self.assertEqual(self.command(ah, type='leave').json()['messages'], [{'type': 'left'}])
        self.assertEqual(self.client.get('/rep-api/poll', headers=ah).json()['messages'], [])
        messages = self.client.get('/rep-api/poll', headers=bh).json()['messages']
        self.assertTrue(any(m.get('status') == 'cancelled' for m in messages))

    def test_calibrated_head_on_pose_cannot_ready_for_battle(self):
        player, headers = self.player(); self.command(headers, type='create')
        client = service.clients[player]
        client.valid_at = time.monotonic(); client.counter.top_height = .3; client.counter.phase = 'up'
        client.counter.view_mode = 'head_on'
        response = self.command(headers, type='ready', ready=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn('side-on', response.json()['detail'])
        client.counter.view_mode = 'side'
        self.assertEqual(self.command(headers, type='ready', ready=True).status_code, 200)


if __name__ == '__main__': unittest.main()
