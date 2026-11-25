import base64
import unittest

import cv2
import numpy as np
from fastapi.testclient import TestClient

from server import app as server_app


def _make_b64_png(bgr_color: tuple[int, int, int]) -> str:
    img = np.full((64, 64, 3), bgr_color, dtype=np.uint8)
    ok, buf = cv2.imencode('.png', img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode('ascii')


class FoodAITests(unittest.TestCase):
    def test_describe_and_analyze_food_http_routes(self):
        client = TestClient(server_app.app)
        old_token = server_app.TOKEN
        old_allow = server_app.ALLOW_DEV_TOKEN
        server_app.TOKEN = 'test_token_food'
        server_app.ALLOW_DEV_TOKEN = True
        headers = {'Authorization': 'Bearer test_token_food'}
        try:
            desc = client.post(
                '/rep-api/food-describe',
                json={'description': '2 eggs and 1 slice sourdough toast'},
                headers=headers,
            )
            self.assertEqual(desc.status_code, 200)
            payload = desc.json()
            self.assertTrue(payload['success'])
            self.assertGreater(payload['data']['totalCalories'], 200)
            self.assertEqual(len(payload['data']['items']), 2)

            green_b64 = _make_b64_png((45, 190, 55))
            vision = client.post(
                '/rep-api/food-analyze',
                json={'image': green_b64, 'mealHint': 'lunch'},
                headers=headers,
            )
            self.assertEqual(vision.status_code, 200)
            vdata = vision.json()['data']
            self.assertTrue(vdata['isFood'])
            self.assertGreaterEqual(len(vdata['candidates']), 2)

            black_b64 = _make_b64_png((0, 0, 0))
            dark = client.post(
                '/rep-api/food-analyze',
                json={'image': black_b64, 'mealHint': 'lunch'},
                headers=headers,
            )
            self.assertEqual(dark.status_code, 200)
            self.assertFalse(dark.json()['data']['isFood'])
        finally:
            server_app.TOKEN = old_token
            server_app.ALLOW_DEV_TOKEN = old_allow


if __name__ == '__main__':
    unittest.main()
