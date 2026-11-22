import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from server.community_goals import CommunityGoals


class CommunityGoalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = datetime(2026, 11, 18, 12, tzinfo=timezone.utc)
        self.service = CommunityGoals(Path(self.temp.name) / 'goals.db', lambda: self.now)
        self.host, self.friend = 'a' * 72, 'b' * 72
        self.goal = self.service.create(dict(walkerKey=self.host, target=5000, title='Team steps', name='Host'))
        self.code = self.goal['code']

    def tearDown(self): self.temp.cleanup()

    def test_real_shared_totals_replace_instead_of_duplicate(self):
        joined = self.service.join(dict(code=self.code, walkerKey=self.friend, name='Friend'))
        self.assertEqual(joined['joinedAt'], self.now.isoformat())
        self.service.update(dict(code=self.code, walkerKey=self.host, steps=1000))
        result = self.service.update(dict(code=self.code, walkerKey=self.friend, steps=2000))
        self.assertEqual(result['totalSteps'], 3000)
        self.assertEqual(self.service.update(dict(code=self.code, walkerKey=self.friend, steps=2000))['totalSteps'], 3000)
        self.assertEqual(self.service.update(dict(code=self.code, walkerKey=self.friend, steps=4000))['status'], 'completed')

    def test_invalid_targets_and_private_member_access(self):
        for target in [0, 99, 1000001, True, 1.5, '1000']:
            with self.assertRaises(ValueError): self.service.create(dict(walkerKey=self.host, target=target))
        with self.assertRaises(PermissionError): self.service.update(dict(code=self.code, walkerKey=self.friend, steps=1000))
        self.assertNotIn('members', self.service.preview(dict(code=self.code)))
        self.assertNotIn(self.host, str(self.goal))

    def test_seven_day_expiration_and_owner_controls(self):
        self.service.join(dict(code=self.code, walkerKey=self.friend, name='Friend'))
        with self.assertRaises(PermissionError): self.service.update(dict(code=self.code, walkerKey=self.friend, action='close'))
        self.now += timedelta(days=7)
        room = self.service.load(self.code)
        self.assertTrue(room['closed'])
        with self.assertRaises(ValueError): self.service.preview(dict(code=self.code))
        self.assertEqual(self.service.update(dict(code=self.code, walkerKey=self.host, steps=1000))['totalSteps'], 0)

    def test_endpoint_authentication_and_shared_goal_route(self):
        from fastapi.testclient import TestClient
        from server import app as service
        previous, token, old_allow = service.community_goals, service.TOKEN, service.ALLOW_DEV_TOKEN
        service.community_goals, service.TOKEN, service.ALLOW_DEV_TOKEN = self.service, 't' * 48, True
        service.limiter.reset()
        try:
            client = TestClient(service.app)
            self.assertEqual(client.post('/rep-api/goals', json={'action': 'preview', 'code': self.code}).status_code, 401)
            response = client.post('/rep-api/goals', headers={'Authorization': 'Bearer ' + service.TOKEN}, json={'action': 'get', 'code': self.code, 'walkerKey': self.host})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['goalSteps'], 5000)
        finally: service.community_goals, service.TOKEN, service.ALLOW_DEV_TOKEN = previous, token, old_allow
