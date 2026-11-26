"""The rep server's /rep-api/food-* routes must use the trained footprint_ai models."""
import base64
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from server import app as server_app

LANDSCAPE = Path(__file__).resolve().parents[2] / 'footprint_ai' / 'tests' / 'fixtures' / 'landscape.jpg'


class FoodAITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server_app.app)
        self.old = (server_app.TOKEN, server_app.ALLOW_DEV_TOKEN)
        server_app.TOKEN = 'test_token_food'
        server_app.ALLOW_DEV_TOKEN = True
        self.headers = {'Authorization': 'Bearer test_token_food'}

    def tearDown(self):
        server_app.TOKEN, server_app.ALLOW_DEV_TOKEN = self.old

    def test_describe_uses_usda_parser(self):
        r = self.client.post('/rep-api/food-describe', json={'description': '2 eggs and a slice of toast'}, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        data = r.json()['data']
        self.assertTrue(r.json()['success'])
        self.assertEqual(len(data['items']), 2)
        self.assertTrue(150 < data['totalCalories'] < 300)
        self.assertTrue(all(i.get('usdaDescription') for i in data['items']))

    def test_landscape_photo_is_rejected_as_not_food(self):
        img = base64.b64encode(LANDSCAPE.read_bytes()).decode()
        r = self.client.post('/rep-api/food-analyze', json={'image': img, 'mealHint': 'lunch'}, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['data']['isFood'])

    def test_garbage_image_reports_error(self):
        r = self.client.post('/rep-api/food-analyze', json={'image': 'not-an-image'}, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['success'])

    def test_unified_ai_route_body_fat(self):
        body = {'type': 'estimate_body_fat', 'gender': 'male', 'age': 28, 'weightKg': 78, 'heightCm': 180, 'waistCm': 82, 'neckCm': 38}
        r = self.client.post('/rep-api/ai', json=body, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        out = r.json()
        self.assertEqual(out['type'], 'body_fat_result')
        self.assertTrue(out['success'])
        self.assertTrue(10 < out['data']['bodyFatPercent'] < 30)
        self.assertIn('abs', out['data'])

    def test_unified_ai_route_needs_auth_and_known_type(self):
        self.assertEqual(self.client.post('/rep-api/ai', json={'type': 'describe_food', 'description': 'apple'}).status_code, 401)
        self.assertEqual(self.client.post('/rep-api/ai', json={'type': 'shell'}, headers=self.headers).status_code, 400)

    def test_dev_proxy_token_allows_ai_even_when_jwt_cannot_verify_locally(self):
        headers = {'Authorization': 'Bearer aaa.bbb.ccc', 'X-Rep-Dev-Token': 'test_token_food'}
        r = self.client.post('/rep-api/ai', json={'type': 'describe_food', 'description': '1 apple'}, headers=headers)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['success'])
        bad_only = {'Authorization': 'Bearer aaa.bbb.ccc'}
        self.assertEqual(self.client.post('/rep-api/ai', json={'type': 'describe_food', 'description': '1 apple'}, headers=bad_only).status_code, 401)


if __name__ == '__main__':
    unittest.main()
