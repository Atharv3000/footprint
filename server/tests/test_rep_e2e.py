"""End-to-end rep counting through the real HTTP API with real video frames.

Skipped unless REP_E2E_VIDEOS is set, e.g.
  REP_E2E_VIDEOS="pushups:5:/path/pushup2.mp4;squats:4:/path/squats1.mp4" python -m pytest server/tests/test_rep_e2e.py
Each frame is resized to <=640 px, JPEG q50, base64 - exactly what the phone sends -
and posted to /rep-api/frame on a simulated 4 fps clock.
"""
import base64
import os
import unittest
from unittest import mock

VIDEOS = [v.split(':', 2) for v in os.environ.get('REP_E2E_VIDEOS', '').split(';') if v.count(':') >= 2]


@unittest.skipUnless(VIDEOS, 'set REP_E2E_VIDEOS to run end-to-end replays')
class RepEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.setdefault('REP_SERVER_TOKEN', 'e2e-' + 'x' * 40)
        os.environ['REP_ALLOW_DEV_TOKEN'] = '1'
        from fastapi.testclient import TestClient
        import server.app as app_module
        cls.app_module = app_module
        app_module.TOKEN = os.environ['REP_SERVER_TOKEN']
        app_module.ALLOW_DEV_TOKEN = True
        cls.client = TestClient(app_module.app)
        cls.client.__enter__()
        cls.headers = {'x-rep-dev-token': os.environ['REP_SERVER_TOKEN']}

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def replay(self, exercise, path, fps=4.0):
        import cv2
        clock = [1000.0]
        with mock.patch.object(self.app_module.time, 'monotonic', lambda: clock[0]):
            s = self.client.post('/rep-api/session', headers=self.headers).json()
            h = {**self.headers, 'x-rep-session': s['session']}
            r = self.client.post('/rep-api/command', headers=h, json={'type': 'reset', 'exercise': exercise})
            self.assertEqual(r.status_code, 200, r.text)
            cap = cv2.VideoCapture(path)
            src = cap.get(cv2.CAP_PROP_FPS) or 30
            step = max(1, round(src / fps))
            count, i = 0, 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if i % step == 0:
                    hgt, wid = frame.shape[:2]; k = min(1, 640 / max(hgt, wid))
                    small = cv2.resize(frame, (round(wid * k), round(hgt * k)))
                    ok, jpg = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 50])
                    clock[0] = 1000.0 + i / src
                    out = self.client.post('/rep-api/frame', headers=h, json={'image': base64.b64encode(jpg).decode()})
                    self.assertEqual(out.status_code, 200, out.text)
                    for m in out.json()['messages']:
                        if m.get('type') == 'pose':
                            count = m['rep_count']
                i += 1
            self.client.post('/rep-api/close', headers=h)
            return count

    def test_videos(self):
        results = []
        for exercise, expected, path in VIDEOS:
            got = self.replay(exercise, path)
            results.append((os.path.basename(path), exercise, int(expected), got))
        print('\nE2E results (file, exercise, expected, counted):')
        for r in results:
            print('  ', r)
        exact = sum(1 for *_, e, g in results if e == g)
        self.assertGreaterEqual(exact, max(1, int(len(results) * .6)), results)


if __name__ == '__main__':
    unittest.main()
