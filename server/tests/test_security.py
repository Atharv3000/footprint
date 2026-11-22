import base64
import hashlib
import hmac
import json
import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from server import app as service
from server.battle import Battles
from server.calorie_challenges import CalorieChallenges
from server.tests.test_api import FakeVision


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def make_jwt(sub: str, secret: str, exp_offset: int = 3600) -> str:
    header = _b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode('utf-8'))
    payload = _b64url(json.dumps({
        'sub': sub,
        'aud': 'authenticated',
        'exp': int(time.time()) + exp_offset,
    }).encode('utf-8'))
    signing_input = f'{header}.{payload}'.encode('ascii')
    sig = _b64url(hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest())
    return f'{header}.{payload}.{sig}'


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self._old_allow = service.ALLOW_DEV_TOKEN
        self._old_token = service.TOKEN
        self._old_jwt_secret = service.SUPABASE_JWT_SECRET
        self._old_calories = service.calorie_challenges
        self.tmp = tempfile.TemporaryDirectory()
        self.secret = 'super-secret-supabase-jwt-signing-key-2026'
        service.ALLOW_DEV_TOKEN = False
        service.TOKEN = 'static-public-token-should-fail-in-prod-1234567890'
        service.SUPABASE_JWT_SECRET = self.secret
        service.vision = FakeVision()
        service.clients.clear()
        service.sessions.clear()
        service.battles = Battles()
        service.limiter.reset()
        service.calorie_challenges = CalorieChallenges(Path(self.tmp.name) / 'cal.sqlite3')
        self.client = TestClient(service.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        service.ALLOW_DEV_TOKEN = self._old_allow
        service.TOKEN = self._old_token
        service.SUPABASE_JWT_SECRET = self._old_jwt_secret
        service.calorie_challenges = self._old_calories
        self.tmp.cleanup()

    def test_production_rejects_static_tokens_and_verifies_user_jwt(self):
        # Static token rejected in production mode
        r_static = self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {service.TOKEN}'})
        self.assertEqual(r_static.status_code, 401)

        # Forged / expired / missing-sub JWTs rejected
        bad_sig = make_jwt('user-1', 'wrong-secret')
        expired = make_jwt('user-1', self.secret, exp_offset=-10)
        self.assertEqual(self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {bad_sig}'}).status_code, 401)
        self.assertEqual(self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {expired}'}).status_code, 401)

        # Valid signed Supabase JWT succeeds
        jwt_a = make_jwt('user-a', self.secret)
        r_ok = self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {jwt_a}'})
        self.assertEqual(r_ok.status_code, 200)
        self.assertEqual(r_ok.headers.get('cache-control'), 'no-store')
        self.assertEqual(r_ok.headers.get('x-content-type-options'), 'nosniff')
        self.assertEqual(r_ok.headers.get('x-frame-options'), 'DENY')

    def test_cross_user_session_hijack_and_session_flooding_blocked(self):
        jwt_a = make_jwt('user-a', self.secret)
        jwt_b = make_jwt('user-b', self.secret)

        s1 = self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {jwt_a}'})
        s2 = self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {jwt_a}'})
        self.assertEqual(s1.status_code, 200)
        self.assertEqual(s2.status_code, 200)

        # User A cannot hoard more than MAX_SESSIONS_PER_USER
        s3 = self.client.post('/rep-api/session', headers={'Authorization': f'Bearer {jwt_a}'})
        self.assertEqual(s3.status_code, 429)

        # User B cannot use User A's X-Rep-Session token
        session_a = s1.json()['session']
        hijack = self.client.get('/rep-api/poll', headers={'Authorization': f'Bearer {jwt_b}', 'X-Rep-Session': session_a})
        self.assertEqual(hijack.status_code, 401)

    def test_cross_user_challenge_binding_and_bruteforce_rate_limit(self):
        jwt_a = {'Authorization': f"Bearer {make_jwt('user-a', self.secret)}"}
        jwt_b = {'Authorization': f"Bearer {make_jwt('user-b', self.secret)}"}

        created = self.client.post('/rep-api/calories', headers=jwt_a, json={
            'action': 'create', 'name': 'Alice', 'mode': 'cut', 'target': 2000, 'days': 7, 'timezone': 'UTC'
        })
        self.assertEqual(created.status_code, 200)
        code = created.json()['challenge']['code']
        secret_key = created.json()['key']

        # Even if User B obtains User A's capability key, backend binds membership to User A's JWT sub
        stolen = self.client.post('/rep-api/calories', headers=jwt_b, json={
            'action': 'get', 'code': code, 'key': secret_key
        })
        self.assertEqual(stolen.status_code, 403)

        # Repeated invalid code guesses trigger 429 rate limiting (1st failure was `stolen` above)
        for _ in range(9):
            resp = self.client.post('/rep-api/calories', headers=jwt_b, json={'action': 'preview', 'code': 'BADCODE12345'})
            self.assertEqual(resp.status_code, 400)
        blocked = self.client.post('/rep-api/calories', headers=jwt_b, json={'action': 'preview', 'code': 'BADCODE12345'})
        self.assertEqual(blocked.status_code, 429)


if __name__ == '__main__':
    unittest.main()
