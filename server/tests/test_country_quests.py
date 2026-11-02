import json
from pathlib import Path
import tempfile
import unittest
from server.country_quests import CountryQuests


CATALOG = Path(__file__).parents[2] / 'assets/data/countryBorders.json'


class CountryQuestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = CountryQuests(Path(self.temp.name)/'quests.sqlite3', CATALOG)
        self.host = 'a'*72; self.friend = 'b'*72
        self.quest = self.service.create(dict(walkerKey=self.host, name='Host', countryId='JPN', title='Team Japan'))
        self.code = self.quest['code']

    def tearDown(self): self.temp.cleanup()

    def join(self, key=None):
        return self.service.join(dict(walkerKey=key or self.friend, name='Friend', code=self.code))

    def sync(self, steps, key=None, action='sync'):
        return self.service.update(dict(walkerKey=key or self.host, code=self.code, steps=steps, action=action))

    def test_trusted_country_goal_and_invite_privacy(self):
        self.assertGreater(self.quest['goalSteps'], 100000)
        with self.assertRaises(ValueError): self.service.create(dict(walkerKey=self.host, countryId='unknown'))
        preview = self.service.preview(dict(code=self.code))
        self.assertNotIn('members', preview)
        self.assertNotIn(self.host, json.dumps(self.quest))

    def test_many_friends_sum_totals_and_retries_do_not_duplicate(self):
        self.join(); self.join('c'*72)
        self.sync(2000); self.sync(3000, self.friend)
        state = self.sync(3000, self.friend)
        self.assertEqual(state['totalSteps'], 5000)
        self.assertEqual(len(state['members']), 3)
        self.assertEqual(len(self.join()['members']), 3)
        self.assertEqual(self.sync(1000, self.friend)['totalSteps'], 3000)

    def test_capability_required_and_owner_controls(self):
        self.join()
        with self.assertRaises(PermissionError): self.sync(100, 'x'*72)
        with self.assertRaises(PermissionError): self.sync(0, self.friend, 'close')
        with self.assertRaises(ValueError): self.sync(0, self.host, 'leave')
        self.assertEqual(self.sync(0, action='close')['status'], 'closed')

    def test_leaving_preserves_contribution_but_stops_updates(self):
        self.join(); self.sync(3000, self.friend)
        state = self.sync(0, self.friend, 'leave')
        self.assertTrue(state['left']); self.assertEqual(state['totalSteps'], 3000)
        with self.assertRaises(PermissionError): self.sync(10000, self.friend)
        with self.assertRaises(ValueError): self.join()

    def test_invalid_totals_rejected(self):
        for value in (-1, 1.5, True, '100', float('nan'), 1000000001):
            with self.assertRaises(ValueError): self.sync(value)

    def test_completion_and_persistence(self):
        state = self.sync(self.quest['goalSteps'])
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(self.sync(0)['totalSteps'], self.quest['goalSteps'])
        other = CountryQuests(self.service.path, CATALOG)
        self.assertTrue(other.load(self.code)['completed'])
        with self.assertRaises(ValueError): self.join()

    def test_limit_fifty_walkers(self):
        for n in range(49): self.join(f'{n:072d}')
        self.assertEqual(len(self.service.load(self.code)['members']), 50)
        with self.assertRaises(ValueError): self.join('z'*72)

    def test_http_two_device_shared_progress(self):
        from fastapi.testclient import TestClient
        from server import app as service
        old_store, old_token = service.country_quests, service.TOKEN
        service.country_quests, service.TOKEN = self.service, 'country-test-token'
        try:
            client = TestClient(service.app); headers = {'Authorization': 'Bearer '+service.TOKEN}
            self.assertEqual(client.post('/rep-api/countries', json={'action': 'preview', 'code': self.code}).status_code, 401)
            joined = client.post('/rep-api/countries', headers=headers, json={'action': 'join', 'code': self.code, 'walkerKey': self.friend, 'name': 'Friend'})
            self.assertEqual(joined.status_code, 200)
            client.post('/rep-api/countries', headers=headers, json={'action': 'sync', 'code': self.code, 'walkerKey': self.friend, 'steps': 9876})
            host = client.post('/rep-api/countries', headers=headers, json={'action': 'get', 'code': self.code, 'walkerKey': self.host})
            self.assertEqual(host.json()['totalSteps'], 9876)
            self.assertEqual(client.post('/rep-api/countries', headers=headers, json={'action': 'get', 'code': self.code, 'walkerKey': 'wrong'*16}).status_code, 403)
        finally: service.country_quests, service.TOKEN = old_store, old_token


if __name__ == '__main__': unittest.main()
