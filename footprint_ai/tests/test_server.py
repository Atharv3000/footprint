import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from footprint_ai.server import app




@pytest.fixture(scope='module')
def client():
    with TestClient(app) as c:
        yield c


def ws_call(client, msg):
    with client.websocket_connect('/') as ws:
        ws.send_json(msg)
        return ws.receive_json()


def test_health(client):
    assert client.get('/health').json()['ok'] is True


def test_ping(client):
    assert ws_call(client, {'type': 'ping'})['type'] == 'pong'


def test_describe_food_protocol(client):
    r = ws_call(client, {'type': 'describe_food', 'description': '2 eggs and a slice of toast'})
    assert r['type'] == 'describe_food_result' and r['success']
    assert 150 < r['data']['totalCalories'] < 300 and len(r['data']['items']) == 2


def test_body_fat_protocol(client):
    r = ws_call(client, {'type': 'estimate_body_fat', 'gender': 'female', 'age': 31, 'weightKg': 62, 'heightCm': 165, 'waistCm': 74, 'neckCm': 32, 'hipCm': 97})
    assert r['type'] == 'body_fat_result' and r['success'] and 20 < r['data']['bodyFatPercent'] < 38


def test_landscape_photo_is_not_food(client):
    img = base64.b64encode((Path(__file__).parent / 'fixtures' / 'landscape.jpg').read_bytes()).decode()
    r = ws_call(client, {'type': 'analyze_food', 'image': img})
    assert r['type'] == 'food_analysis_result' and r['success'] and r['data']['isFood'] is False


def test_bad_image_is_a_clean_error(client):
    r = ws_call(client, {'type': 'analyze_food', 'image': 'definitely-not-an-image'})
    assert r['success'] is False and 'image' in r['error'].lower()


def test_hint_overrides_photo(client):
    img = base64.b64encode((Path(__file__).parent / 'fixtures' / 'landscape.jpg').read_bytes()).decode()
    r = ws_call(client, {'type': 'analyze_food', 'image': img, 'hint': '2 eggs and toast'})
    assert r['data']['isFood'] is True and r['data']['totalCalories'] > 150


def test_http_api(client):
    r = client.post('/v1/food/describe', json={'description': 'a banana'})
    assert r.status_code == 200 and 90 < r.json()['data']['totalCalories'] < 120


def test_token_enforced(monkeypatch, client):
    monkeypatch.setenv('FOOTPRINT_AI_TOKEN', 'abc')
    assert client.post('/v1/food/describe', json={'description': 'a banana'}).status_code == 401
    assert client.post('/v1/food/describe', json={'description': 'a banana'}, headers={'Authorization': 'Bearer abc'}).status_code == 200
