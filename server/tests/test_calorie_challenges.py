import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from server.calorie_challenges import CalorieChallenges


class ChallengesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.service = CalorieChallenges(Path(self.tmp.name) / 'db.sqlite3')
        self.created = self.service.create(dict(name='Host', mode='cut', target=2000, days=7, timezone='UTC'))
        self.code = self.created['challenge']['code']

    def tearDown(self): self.tmp.cleanup()

    def join(self): return self.service.join(dict(code=self.code, name='Friend'))

    def update(self, key=None, **kwargs):
        return self.service.update(dict(code=self.code, key=key or self.created['key'], **kwargs))

    def test_invite_start_and_private_keys(self):
        self.assertEqual(self.created['challenge']['status'], 'waiting')
        joined = self.join()
        self.assertEqual(joined['challenge']['status'], 'active')
        self.assertEqual(joined['challenge']['you'], 1)
        self.assertNotIn('secret', str(joined['challenge']))
        self.assertNotEqual(joined['key'], self.created['key'])
        with self.assertRaises(ValueError): self.join()

    def test_target_validation(self):
        for target in (0, 999, 10001, float('nan'), True, '2000'):
            with self.assertRaises(ValueError): self.service.create(dict(target=target, mode='cut', days=7))
        self.assertEqual(self.service.create(dict(target=10000, mode='bulk', days=1))['challenge']['target'], 10000)

    def test_capability_required(self):
        self.join()
        with self.assertRaises(PermissionError): self.update(key='wrong', totals={})

    def test_zero_food_does_not_score(self):
        self.join()
        with self.assertRaises(ValueError): self.update(totals={}, complete=True)

    def test_completion_idempotent_and_edit_recalculates(self):
        today = self.join()['challenge']['today']
        self.update(totals={today: 1900}, complete=True)
        state = self.update(totals={today: 1900}, complete=True)
        self.assertEqual(state['players'][0]['score'], 1)
        state = self.update(totals={today: 2500})
        self.assertEqual(state['players'][0]['score'], 0)
        self.assertFalse(state['players'][0]['complete'])

    def test_independent_scores_and_persistence(self):
        joined = self.join(); today = joined['challenge']['today']
        self.update(totals={today: 2000}, complete=True)
        state = self.update(key=joined['key'], totals={today: 1800}, complete=True)
        self.assertEqual([p['score'] for p in state['players']], [1, 1])
        other = CalorieChallenges(self.service.path)
        self.assertEqual(other.load(self.code)['players'][0]['totals'][today], 2000)

    def test_invalid_totals_rejected(self):
        today = self.join()['challenge']['today']
        for totals in ({today: -1}, {today: float('inf')}, {today: True}, {'9999-99-99': 2000}):
            with self.assertRaises(ValueError): self.update(totals=totals)

    def test_cancel_ends_for_both(self):
        joined = self.join()
        self.update(cancel=True)
        self.assertEqual(self.update(key=joined['key'], totals={})['status'], 'cancelled')

    def test_finished_freezes_result(self):
        today = self.join()['challenge']['today']
        self.update(totals={today: 2000}, complete=True)
        room = self.service.load(self.code)
        room['end'] = (datetime.fromisoformat(today) - timedelta(days=1)).date().isoformat()
        self.service.save(room)
        state = self.update(totals={})
        self.assertEqual(state['status'], 'finished')
        self.assertEqual(state['winner'], 0)
        self.assertEqual(state['players'][0]['score'], 1)

    def test_invite_expires(self):
        room = self.service.load(self.code)
        room['created'] = '2000-01-01T00:00:00+00:00'; self.service.save(room)
        with self.assertRaises(ValueError): self.join()

    def test_http_two_phone_flow_and_auth(self):
        from fastapi.testclient import TestClient
        from server import app as service
        old_store, old_token = service.calorie_challenges, service.TOKEN
        service.calorie_challenges = self.service; service.TOKEN = 'test-calorie-service-token'
        try:
            client = TestClient(service.app)
            headers = {'Authorization': 'Bearer ' + service.TOKEN}
            self.assertEqual(client.post('/rep-api/calories', json={'action': 'preview', 'code': self.code}).status_code, 401)
            preview = client.post('/rep-api/calories', headers=headers, json={'action': 'preview', 'code': self.code})
            self.assertEqual(preview.json()['target'], 2000)
            self.assertNotIn('players', preview.json())
            guest = client.post('/rep-api/calories', headers=headers, json={'action': 'join', 'code': self.code, 'name': 'Friend'}).json()
            today = guest['challenge']['today']
            updated = client.post('/rep-api/calories', headers=headers, json={'action': 'update', 'code': self.code, 'key': guest['key'], 'totals': {today: 2000}, 'complete': True})
            self.assertEqual(updated.status_code, 200)
            host = client.post('/rep-api/calories', headers=headers, json={'action': 'get', 'code': self.code, 'key': self.created['key']}).json()
            self.assertEqual(host['players'][1]['score'], 1)
            self.assertEqual(client.post('/rep-api/calories', headers=headers, json={'action': 'get', 'code': self.code, 'key': 'wrong'}).status_code, 403)
        finally:
            service.calorie_challenges, service.TOKEN = old_store, old_token


if __name__ == '__main__': unittest.main()
