"""Footprint AI server: food photo, meal text, body fat and muscle-photo analysis.

Speaks the app's existing WebSocket protocol on ws://HOST:9001/ :
  -> {"type": "analyze_food", "image": <base64>, "hint": "..."}   <- {"type": "food_analysis_result", "success": true, "data": {...}}
  -> {"type": "describe_food", "description": "..."}              <- {"type": "describe_food_result", ...}
  -> {"type": "estimate_body_fat", ...profile fields, "image"?}   <- {"type": "body_fat_result", ...}
  -> {"type": "analyze_muscle", "muscle": "abs", "photos": [...]} <- {"type": "muscle_analysis_result", ...}
  -> {"type": "scan_label", "image": <base64>}                    <- {"type": "label_scan_result", ...}   barcode / nutrition label / pack
  -> {"type": "read_receipt", "image": <base64>}                  <- {"type": "receipt_result", ...}
  -> {"type": "read_recipe", "image"?: <base64>, "text"?: "..."}  <- {"type": "recipe_result", ...}
  -> {"type": "ping"}                                             <- {"type": "pong"}
and the same operations as JSON over HTTP (POST /v1/food/photo, /v1/food/describe,
/v1/body-fat, /v1/muscle; GET /health) for other systems.

Run:  python -m footprint_ai.server --host 0.0.0.0 --port 9001
Optional: FOOTPRINT_AI_TOKEN=<secret> requires ?token=<secret> (WebSocket) or
"Authorization: Bearer <secret>" (HTTP). Leave unset only on a trusted LAN.
"""
from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import logging
import os
import time
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from . import __version__
from .body_metrics import estimate_body_fat
from .food_vision import ImageError, describe_food
from . import scan
from .muscle import analyze_muscle

log = logging.getLogger('footprint_ai')
MAX_MESSAGE = 16_000_000
RESULT_TYPE = {'analyze_food': 'food_analysis_result', 'describe_food': 'describe_food_result',
               'estimate_body_fat': 'body_fat_result', 'analyze_muscle': 'muscle_analysis_result',
               'scan_label': 'label_scan_result', 'read_receipt': 'receipt_result', 'read_recipe': 'recipe_result'}


def _token() -> str:
    return os.environ.get('FOOTPRINT_AI_TOKEN', '').strip()


def _authorized(supplied: str | None) -> bool:
    expected = _token()
    return not expected or (bool(supplied) and hmac.compare_digest(supplied, expected))


class Limiter:
    """Per-client sliding window (default 30 requests / 60 s)."""

    def __init__(self, limit: int = 30, window: float = 60.0):
        self.limit, self.window, self.hits = limit, window, {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits.setdefault(key, deque())
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        if len(self.hits) > 5000:
            self.hits = {k: v for k, v in self.hits.items() if v and now - v[-1] < self.window}
        return True


limiter = Limiter(int(os.environ.get('FOOTPRINT_AI_RATE', '30')))


def handle(msg: dict) -> dict:
    """Synchronous dispatcher shared by WebSocket and HTTP. Returns the `data` payload."""
    kind = msg.get('type')
    if kind == 'analyze_food':
        return scan.analyze_food_photo(msg.get('image', ''), str(msg.get('hint') or '')[:300])
    if kind == 'scan_label':
        return scan.scan_label(msg.get('image', '') or '', str(msg.get('barcode') or '')[:20])
    if kind == 'read_receipt':
        return scan.read_receipt_photo(msg.get('image', ''))
    if kind == 'read_recipe':
        return scan.read_recipe_input(msg.get('image', '') or '', str(msg.get('text') or '')[:20000])
    if kind == 'describe_food':
        return describe_food(str(msg.get('description') or msg.get('text') or ''))
    if kind == 'estimate_body_fat':
        return estimate_body_fat(msg)
    if kind == 'analyze_muscle':
        photos = msg.get('photos') or []
        if not isinstance(photos, list):
            raise ValueError('photos must be a list.')
        body = msg.get('body') if isinstance(msg.get('body'), dict) else None
        return analyze_muscle(photos, str(msg.get('muscle') or msg.get('muscleGroup') or 'abs'), body)
    raise ValueError(f'Unsupported message type: {kind!r}')


def warm_up() -> None:
    """Load models before the first request so the app does not time out."""
    from .food_model import model
    from .nutrition import db
    from . import products
    db(); model(); products.available()
    try:
        from . import ocr
        ocr.engine()
    except Exception as exc:  # noqa: BLE001 - only label, receipt and recipe photos need OCR
        log.warning('Text reader unavailable (%s); label, receipt and recipe photos will fail.', exc)
    try:
        from .pose import detector
        detector()
    except Exception as exc:  # noqa: BLE001 - pose is only needed for body/muscle photos
        log.warning('Pose model unavailable (%s); photo checks for body fat/muscle will be skipped.', exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(warm_up)
    yield


app = FastAPI(title='Footprint AI', version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get('/health')
def health():
    return {'ok': True, 'version': __version__, 'auth': bool(_token())}


@app.websocket('/')
async def ws(websocket: WebSocket):
    if not _authorized(websocket.query_params.get('token')):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    peer = websocket.client.host if websocket.client else 'unknown'
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_MESSAGE:
                await websocket.send_json({'type': 'error', 'success': False, 'error': 'Message too large.'})
                continue
            try:
                msg = json.loads(raw)
                if not isinstance(msg, dict):
                    raise ValueError
            except ValueError:
                await websocket.send_json({'type': 'error', 'success': False, 'error': 'Invalid JSON.'})
                continue
            kind = msg.get('type')
            if kind == 'ping':
                await websocket.send_json({'type': 'pong'})
                continue
            rtype = RESULT_TYPE.get(kind, 'error')
            if not limiter.allow(peer):
                await websocket.send_json({'type': rtype, 'success': False, 'error': 'Too many requests. Wait a moment.'})
                continue
            started = time.perf_counter()
            try:
                data = await asyncio.to_thread(handle, msg)
                await websocket.send_json({'type': rtype, 'success': True, 'data': data,
                                           'ms': round((time.perf_counter() - started) * 1000)})
            except (ValueError, ImageError) as exc:
                await websocket.send_json({'type': rtype, 'success': False, 'error': str(exc)})
            except Exception:  # noqa: BLE001
                log.exception('AI request failed')
                await websocket.send_json({'type': rtype, 'success': False, 'error': 'Analysis failed on the server.'})
    except WebSocketDisconnect:
        return


async def _http(request: Request, kind: str):
    auth = request.headers.get('authorization', '')
    if not _authorized(auth[7:].strip() if auth.lower().startswith('bearer ') else None):
        raise HTTPException(401, 'Unauthorized.')
    if not limiter.allow(request.client.host if request.client else 'unknown'):
        raise HTTPException(429, 'Too many requests.')
    body = await request.body()
    if len(body) > MAX_MESSAGE:
        raise HTTPException(413, 'Request too large.')
    try:
        msg = json.loads(body or b'{}')
        if not isinstance(msg, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(400, 'Invalid JSON.')
    msg['type'] = kind
    try:
        return JSONResponse({'success': True, 'data': await asyncio.to_thread(handle, msg)})
    except (ValueError, ImageError) as exc:
        raise HTTPException(400, str(exc))


@app.post('/v1/food/photo')
async def http_food(request: Request):
    return await _http(request, 'analyze_food')


@app.post('/v1/food/describe')
async def http_describe(request: Request):
    return await _http(request, 'describe_food')


@app.post('/v1/body-fat')
async def http_body_fat(request: Request):
    return await _http(request, 'estimate_body_fat')


@app.post('/v1/food/label')
async def http_label(request: Request):
    return await _http(request, 'scan_label')


@app.post('/v1/food/receipt')
async def http_receipt(request: Request):
    return await _http(request, 'read_receipt')


@app.post('/v1/food/recipe')
async def http_recipe(request: Request):
    return await _http(request, 'read_recipe')


@app.post('/v1/muscle')
async def http_muscle(request: Request):
    return await _http(request, 'analyze_muscle')


def main() -> None:
    import uvicorn
    ap = argparse.ArgumentParser(description='Footprint AI server')
    ap.add_argument('--host', default=os.environ.get('FOOTPRINT_AI_HOST', '0.0.0.0'))
    ap.add_argument('--port', type=int, default=int(os.environ.get('FOOTPRINT_AI_PORT', '9001')))
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host=a.host, port=a.port, ws_max_size=MAX_MESSAGE, log_level='info', access_log=False)


if __name__ == '__main__':
    main()
