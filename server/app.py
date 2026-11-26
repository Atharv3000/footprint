"""Backend relay & challenges API with per-user JWT auth, rate limiting, and privacy-by-default camera relay."""
import asyncio
import base64
from collections import deque
from contextlib import asynccontextmanager, suppress
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time

from fastapi import FastAPI, HTTPException, Request
import httpx

from .calorie_challenges import CalorieChallenges
from .battle import Battles
from .counter import RepCounter
from .boxing import BoxingGame
from .country_quests import CountryQuests
from .community_goals import CommunityGoals
from .food_ai import analyze_food_image, describe_food
from footprint_ai.server import RESULT_TYPE as AI_RESULT_TYPE, handle as ai_handle, warm_up as ai_warm_up
from footprint_ai.food_vision import ImageError as AIImageError


def get_token():
    return os.environ.get('REP_SERVER_TOKEN', '').strip()


def is_dev_token_allowed():
    return os.environ.get('REP_ALLOW_DEV_TOKEN', '').strip() == '1'


TOKEN = get_token()
ALLOW_DEV_TOKEN = is_dev_token_allowed()
SUPABASE_URL = (os.environ.get('SUPABASE_URL', '') or os.environ.get('EXPO_PUBLIC_SUPABASE_URL', '')).strip().rstrip('/')
SUPABASE_ANON_KEY = (os.environ.get('SUPABASE_ANON_KEY', '') or os.environ.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '')).strip()
SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '').strip()

battles = Battles()
calorie_challenges = CalorieChallenges(os.environ.get('CALORIE_DB_PATH', str(Path(__file__).parent / 'data/calories.sqlite3')))
country_quests = CountryQuests(os.environ.get('COUNTRY_QUEST_DB_PATH', str(Path(__file__).parent / 'data/country-quests.sqlite3')), Path(__file__).parent.parent / 'assets/data/countryBorders.json')
community_goals = CommunityGoals(os.environ.get('COMMUNITY_GOALS_DB_PATH', str(Path(__file__).parent / 'data/community-goals.sqlite3')))
clients = {}
sessions = {}
vision = None
tasks = set()
jwt_cache = {}  # sha256(jwt) -> (user_id, expires_at)

MAX_SESSIONS_PER_USER = 2
FRAME_TTL_SECONDS = 3.0
JSON_BODY_LIMIT = 65_536
FRAME_BODY_LIMIT = 2_900_000
# Muscle-photo comparisons send up to 12 photos at once.
AI_BODY_LIMIT = 16_000_000


class RateLimiter:
    def __init__(self):
        self.events = {}

    def check(self, bucket: str, limit: int, window_seconds: float, detail: str = 'Too many requests. Please slow down.'):
        now = time.monotonic()
        history = self.events.get(bucket)
        if history is None:
            if len(self.events) > 5000:
                cutoff = now - 600
                stale = [k for k, v in self.events.items() if not v or v[-1] < cutoff]
                for k in stale:
                    self.events.pop(k, None)
            history = deque()
            self.events[bucket] = history
        while history and now - history[0] > window_seconds:
            history.popleft()
        if len(history) >= limit:
            raise HTTPException(429, detail)
        history.append(now)

    def reset(self):
        self.events.clear()


limiter = RateLimiter()


def _b64url_decode(segment: str) -> bytes:
    padded = segment + '=' * (-len(segment) % 4)
    return base64.urlsafe_b64decode(padded.encode('ascii'))


def _verify_hs256_jwt(token: str, secret: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError('Malformed JWT')
    header = json.loads(_b64url_decode(parts[0]))
    if header.get('alg') != 'HS256':
        raise ValueError('Unsupported JWT algorithm')
    signing_input = f'{parts[0]}.{parts[1]}'.encode('ascii')
    expected = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    actual = _b64url_decode(parts[2])
    if not hmac.compare_digest(expected, actual):
        raise ValueError('Invalid JWT signature')
    claims = json.loads(_b64url_decode(parts[1]))
    now = time.time()
    exp = claims.get('exp')
    if not isinstance(exp, (int, float)) or now >= exp:
        raise ValueError('JWT expired')
    nbf = claims.get('nbf')
    if isinstance(nbf, (int, float)) and now < nbf:
        raise ValueError('JWT not active yet')
    sub = claims.get('sub')
    if not isinstance(sub, str) or not sub.strip():
        raise ValueError('Missing subject')
    return claims


async def _verify_supabase_jwt(token: str) -> str:
    secret = os.environ.get('SUPABASE_JWT_SECRET', '').strip() or SUPABASE_JWT_SECRET
    if secret:
        try:
            claims = _verify_hs256_jwt(token, secret)
            return f"user:{claims['sub']}"
        except ValueError:
            pass

    digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
    now = time.time()
    cached = jwt_cache.get(digest)
    if cached and cached[1] > now:
        return cached[0]

    sb_url = (os.environ.get('SUPABASE_URL', '').strip() or os.environ.get('EXPO_PUBLIC_SUPABASE_URL', '').strip() or SUPABASE_URL).rstrip('/')
    sb_key = os.environ.get('SUPABASE_ANON_KEY', '').strip() or os.environ.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '').strip() or SUPABASE_ANON_KEY
    if not sb_url:
        raise HTTPException(401, 'Authentication verifier is not configured.')
    headers = {'Authorization': f'Bearer {token}'}
    if sb_key:
        headers['apikey'] = sb_key
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f'{sb_url}/auth/v1/user', headers=headers)
    except httpx.HTTPError:
        raise HTTPException(503, 'Could not verify account session. Try again.')
    if resp.status_code != 200:
        raise HTTPException(401, 'Invalid or expired session. Please sign in again.')
    user_data = resp.json()
    uid = user_data.get('id')
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(401, 'Invalid session payload.')
    user_key = f'user:{uid}'
    if len(jwt_cache) > 2048:
        jwt_cache.clear()
    jwt_cache[digest] = (user_key, now + 60.0)
    return user_key


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get('x-forwarded-for', '').split(',')[0].strip()
    if forwarded:
        return forwarded[:64]
    return (request.client.host if request.client else 'unknown')[:64]


class Client:
    def __init__(self, owner_id: str = 'dev'):
        self.id = secrets.token_hex(12)
        self.session = secrets.token_hex(32)
        self.owner_id = owner_id
        self.counter = RepCounter()
        self.boxing = None
        self.share_video = False  # Privacy-by-default: only pose skeleton is shared unless explicitly opted in.
        self.valid_at = 0
        self.frame_at = 0
        self.touched = time.monotonic()
        self.busy = False
        self.epoch = 0
        self.messages = deque(maxlen=12)

    def send(self, message):
        kind = message['type']
        if kind in ('battle_state', 'opponent_frame', 'opponent_pose'):
            self.messages = deque((m for m in self.messages if m['type'] != kind), maxlen=12)
        self.messages.append(message)

    def purge_frames(self):
        self.messages = deque((m for m in self.messages if m['type'] != 'opponent_frame'), maxlen=12)


def publish(room, exclude=None):
    state = room.snapshot()
    for p in room.players:
        if p in clients and p != exclude:
            clients[p].send(state)


def purge_room_frames(room, from_player=None):
    if not room:
        return
    for p in room.players:
        if p in clients:
            if from_player is None:
                clients[p].purge_frames()
            else:
                clients[p].messages = deque(
                    (m for m in clients[p].messages if not (m['type'] == 'opponent_frame' and m.get('player_id') == from_player)),
                    maxlen=12,
                )


def remove(client):
    client.epoch += 1
    room = battles.leave(client.id)
    if room:
        purge_room_frames(room)
        publish(room)
    clients.pop(client.id, None)
    sessions.pop(client.session, None)


async def clean_stale():
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        for client in list(clients.values()):
            if now - client.touched > 20:
                remove(client)
        for room in list(battles.rooms.values()):
            if now - room.created > 1800:
                room.status = 'cancelled'
                room.reason = 'expired'
                room.revision += 1
                purge_room_frames(room)
                publish(room)
                for p in room.players:
                    battles.members.pop(p, None)
                battles.rooms.pop(room.code, None)


@asynccontextmanager
async def lifespan(app):
    global vision
    allow_dev = is_dev_token_allowed() or ALLOW_DEV_TOKEN
    has_jwt_verifier = bool(os.environ.get('SUPABASE_JWT_SECRET', '').strip() or SUPABASE_JWT_SECRET or os.environ.get('SUPABASE_URL', '').strip() or os.environ.get('EXPO_PUBLIC_SUPABASE_URL', '').strip() or SUPABASE_URL)
    if allow_dev and len(get_token() or TOKEN) < 32:
        raise RuntimeError('Start through scripts/rep-dev.cjs to set the development session token.')
    if not allow_dev and not has_jwt_verifier:
        raise RuntimeError('Configure SUPABASE_URL or SUPABASE_JWT_SECRET for production authentication.')
    if vision is None:
        from .vision import Vision
        vision = Vision(os.environ.get('REP_POSE_MODEL', str(Path(__file__).parent / 'models/pose_landmarker_full.task')))
    cleaner = asyncio.create_task(clean_stale())
    if os.environ.get('FOOTPRINT_AI_WARMUP', '1') != '0':
        # Load the food/body models in the background so the first AI request does not time out.
        warm = asyncio.create_task(asyncio.to_thread(ai_warm_up))
        tasks.add(warm)
        warm.add_done_callback(tasks.discard)
    yield
    cleaner.cancel()
    for task in list(tasks):
        task.cancel()
    with suppress(asyncio.CancelledError):
        await cleaner
    vision.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


async def auth(request: Request) -> str:
    auth_header = request.headers.get('authorization', '')
    bearer = auth_header[7:].strip() if auth_header.lower().startswith('bearer ') else ''
    dev_allowed = is_dev_token_allowed() or ALLOW_DEV_TOKEN
    current_token = get_token() or TOKEN
    dev_header = request.headers.get('x-rep-dev-token', '').strip()
    dev_candidate = dev_header or bearer
    valid_dev_token = bool(dev_allowed and current_token and dev_candidate and hmac.compare_digest(dev_candidate, current_token))

    # 1. Verify per-user Supabase JWT when supplied
    if bearer and bearer.count('.') == 2:
        try:
            return await _verify_supabase_jwt(bearer)
        except HTTPException:
            if not (dev_allowed and current_token and dev_header and hmac.compare_digest(dev_header, current_token)):
                raise

    # 2. Ephemeral local-dev / test token ONLY when explicitly permitted (never in production)
    if valid_dev_token:
        return f'dev:{_client_ip(request)}'

    raise HTTPException(401, 'Authentication required. Sign in to your Footprint account.')


async def client_for(request: Request):
    caller_id = await auth(request)
    client = sessions.get(request.headers.get('x-rep-session', ''))
    if not client or client.owner_id != caller_id:
        raise HTTPException(401, 'Connection expired. Reconnect to begin a new session.')
    client.touched = time.monotonic()
    return client


async def payload(request: Request, max_bytes: int = JSON_BODY_LIMIT):
    try:
        declared = int(request.headers.get('content-length', '0') or '0')
    except ValueError:
        raise HTTPException(400, 'Invalid content length.')
    if declared > max_bytes:
        raise HTTPException(413, 'Request payload is too large.')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise HTTPException(413, 'Request payload is too large.')
    try:
        result = json.loads(body)
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (ValueError, TypeError):
        raise HTTPException(400, 'Invalid message.')


@app.get('/rep-api/health')
def health():
    return {'ready': vision is not None, 'lead_to_win': 10}


@app.post('/rep-api/session')
async def session(request: Request):
    caller_id = await auth(request)
    limiter.check(f'session:{caller_id}', 10, 60.0)
    if sum(1 for c in clients.values() if c.owner_id == caller_id) >= MAX_SESSIONS_PER_USER:
        raise HTTPException(429, 'Too many active tracking sessions on this account.')
    if len(clients) >= 12:
        raise HTTPException(503, 'Server is busy. Try again shortly.')
    client = Client(owner_id=caller_id)
    clients[client.id] = client
    sessions[client.session] = client
    return {'session': client.session, 'player_id': client.id}


@app.get('/rep-api/poll')
async def poll(request: Request):
    client = await client_for(request)
    limiter.check(f'poll:{client.id}', 300, 60.0)
    now = time.monotonic()
    messages = []
    for msg in client.messages:
        if msg.get('type') == 'opponent_frame':
            sent_at = msg.get('sent_at', 0)
            if now - sent_at > FRAME_TTL_SECONDS:
                continue
            messages.append({k: v for k, v in msg.items() if k != 'sent_at'})
        else:
            messages.append(msg)
    client.messages.clear()
    return {'messages': messages}


@app.post('/rep-api/close')
async def close(request: Request):
    client = await client_for(request)
    remove(client)
    return {'messages': []}


async def start_after_countdown(room, deadline):
    await asyncio.sleep(max(0, deadline - time.time()))
    if battles.start(room):
        for p in room.players:
            if p in clients:
                clients[p].counter.begin_set(time.monotonic())
                clients[p].epoch += 1
        publish(room)


@app.post('/rep-api/command')
async def command(request: Request):
    client = await client_for(request)
    limiter.check(f'cmd:{client.id}', 60, 60.0)
    data = await payload(request, JSON_BODY_LIMIT)
    kind = data.get('type')
    room = battles.get(client.id)
    try:
        if kind == 'ping':
            return {'messages': []}
        if kind == 'reset':
            if room:
                raise ValueError('Leave your battle before changing exercises.')
            exercise = data.get('exercise', 'pushups')
            if exercise not in ('pushups', 'squats', 'bicep_curls', 'boxing'):
                raise ValueError('Unsupported exercise.')
            client.boxing = BoxingGame() if exercise == 'boxing' else None
            client.counter = RepCounter('pushups' if client.boxing else exercise)
            client.epoch += 1
            client.valid_at = 0
            return {'messages': [{'type': 'reset', 'rep_count': 0}]}
        if kind in ('create', 'join'):
            if kind == 'create':
                limiter.check(f'battle_create:{client.owner_id}', 5, 60.0)
            name = re.sub(r'[\x00-\x1f\x7f]', '', str(data.get('name', 'Player'))).strip()[:24] or 'Player'
            room = battles.create(client.id, name) if kind == 'create' else battles.join(
                client.id, name, str(data.get('code', '')).strip().upper())
            client.share_video = data.get('share_video') is True
            client.boxing = None
            client.counter = RepCounter()
            client.epoch += 1
            client.valid_at = 0
            publish(room)
            return {'messages': []}
        if kind == 'privacy':
            client.share_video = data.get('share_video') is True
            if not client.share_video and room:
                purge_room_frames(room, from_player=client.id)
            return {'messages': [{'type': 'privacy', 'share_video': client.share_video}]}
        if kind == 'ready':
            ready = data.get('ready') is True
            if ready and client.counter.view_mode != 'side':
                raise ValueError('Turn side-on to the camera before the battle. Head-on counting is not reliable.')
            if ready and (time.monotonic() - client.valid_at > 2 or client.counter.top_height is None
                          or client.counter.phase != 'up'):
                raise ValueError('Hold a straight-arm plank in view before tapping Ready.')
            room = battles.set_ready(client.id, ready)
            publish(room)
            if room.status == 'countdown':
                task = asyncio.create_task(start_after_countdown(room, room.start_at))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
            return {'messages': []}
        if kind in ('leave', 'pause'):
            room = battles.leave(client.id)
            if room:
                purge_room_frames(room)
                publish(room, exclude=client.id)
            client.messages.clear()
            client.share_video = False
            if client.boxing:
                client.boxing.pause()
            client.counter.reset_cycle()
            client.valid_at = 0
            client.epoch += 1
            return {'messages': [{'type': 'left'}]}
        raise ValueError('Unsupported command.')
    except ValueError as error:
        raise HTTPException(400, str(error))


@app.post('/rep-api/frame')
async def frame(request: Request):
    client = await client_for(request)
    if client.busy or time.monotonic() - client.frame_at < .15:
        return {'messages': [{'type': 'frame_skipped'}]}
    client.busy = True
    client.frame_at = time.monotonic()
    epoch = client.epoch
    try:
        data = await payload(request, FRAME_BODY_LIMIT)
        room = battles.get(client.id)
        include_preview = bool(room and room.status in ('waiting', 'countdown', 'active') and client.share_video)
        if client.boxing:
            points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'), True)
        elif include_preview:
            points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'), False, True)
        else:
            try:
                points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'), False)
            except TypeError:
                # Compatibility with test mocks accepting only (image)
                points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'))
        if client.id not in clients or epoch != client.epoch:
            return {'messages': [{'type': 'frame_skipped'}]}
        room = battles.get(client.id)
        before = client.counter.count
        pose = (client.boxing or client.counter).update(points, time.monotonic(), aspect)
        if pose['valid']:
            client.valid_at = time.monotonic()
        else:
            client.valid_at = 0
            if room and room.status == 'waiting' and client.id in room.ready:
                room.ready.discard(client.id)
                room.revision += 1
                publish(room)
        if room and room.status == 'active' and client.counter.count > before:
            updated = battles.rep(client.id)
            if updated:
                if updated.status in ('finished', 'cancelled'):
                    purge_room_frames(updated)
                publish(updated)
        if room and room.status in ('waiting', 'countdown', 'active'):
            for p in room.players:
                if p != client.id and p in clients:
                    if client.share_video and preview:
                        clients[p].send({'type': 'opponent_frame', 'image': preview, 'player_id': client.id, 'sent_at': time.monotonic()})
                    else:
                        clients[p].send({'type': 'opponent_pose', 'keypoints': points, 'aspect': aspect, 'player_id': client.id})
        return {'messages': [{'type': 'pose', **pose, 'keypoints': points, 'aspect': aspect}]}
    except ValueError as error:
        raise HTTPException(400, str(error))
    finally:
        client.busy = False


def _enforce_room_rate_limit(scope: str, action: str, caller_id: str):
    if action == 'create':
        limiter.check(f'{scope}_create:{caller_id}', 10, 600.0, 'Too many rooms created. Please wait before creating another.')
    elif action in ('preview', 'join', 'get'):
        limiter.check(f'{scope}_lookup:{caller_id}', 30, 60.0)
    else:
        limiter.check(f'{scope}_write:{caller_id}', 60, 60.0)


@app.post('/rep-api/calories')
async def calories(request: Request):
    caller_id = await auth(request)
    data = await payload(request, JSON_BODY_LIMIT)
    action = data.get('action')
    _enforce_room_rate_limit('calories', str(action), caller_id)
    uid = caller_id if caller_id.startswith('user:') else None
    try:
        if action == 'create':
            return calorie_challenges.create(data, user_id=uid)
        if action == 'join':
            return calorie_challenges.join(data, user_id=uid)
        if action == 'preview':
            room = calorie_challenges.load(data.get('code', ''))
            if room['cancelled'] or len(room['players']) != 1:
                raise ValueError('This invite is no longer available.')
            return {k: room[k] for k in ('mode', 'target', 'days', 'timezone')}
        if action == 'get':
            room = calorie_challenges.load(data.get('code', ''))
            member = calorie_challenges.member(room, data.get('key', ''), user_id=uid)
            return calorie_challenges.snapshot(room, member)
        if action == 'update':
            return calorie_challenges.update(data, user_id=uid)
        raise ValueError('Unknown challenge action.')
    except PermissionError as error:
        limiter.check(f'calories_fail:{caller_id}', 10, 300.0, 'Too many failed access attempts.')
        raise HTTPException(403, str(error))
    except ValueError as error:
        if action in ('preview', 'join', 'get'):
            limiter.check(f'calories_fail:{caller_id}', 10, 300.0, 'Too many failed code lookups.')
        raise HTTPException(400, str(error))


@app.post('/rep-api/countries')
async def countries(request: Request):
    caller_id = await auth(request)
    data = await payload(request, JSON_BODY_LIMIT)
    action = data.get('action')
    _enforce_room_rate_limit('countries', str(action), caller_id)
    uid = caller_id if caller_id.startswith('user:') else None
    try:
        if action == 'create':
            return country_quests.create(data, user_id=uid)
        if action == 'preview':
            return country_quests.preview(data)
        if action == 'join':
            return country_quests.join(data, user_id=uid)
        if action == 'get':
            room = country_quests.load(data.get('code', ''))
            member_id = country_quests.member(room, data, user_id=uid)
            return country_quests.snapshot(room, member_id)
        if action in ('sync', 'leave', 'close'):
            return country_quests.update(data, user_id=uid)
        raise ValueError('Unknown quest action.')
    except PermissionError as error:
        limiter.check(f'countries_fail:{caller_id}', 10, 300.0, 'Too many failed access attempts.')
        raise HTTPException(403, str(error))
    except ValueError as error:
        if action in ('preview', 'join', 'get'):
            limiter.check(f'countries_fail:{caller_id}', 10, 300.0, 'Too many failed code lookups.')
        raise HTTPException(400, str(error))


@app.post('/rep-api/goals')
async def goals(request: Request):
    caller_id = await auth(request)
    data = await payload(request, JSON_BODY_LIMIT)
    action = data.get('action')
    _enforce_room_rate_limit('goals', str(action), caller_id)
    uid = caller_id if caller_id.startswith('user:') else None
    try:
        if action == 'create':
            return community_goals.create(data, user_id=uid)
        if action == 'preview':
            return community_goals.preview(data)
        if action == 'join':
            return community_goals.join(data, user_id=uid)
        if action == 'get':
            room = community_goals.load(data.get('code', ''))
            member_id = community_goals.member(room, data, user_id=uid)
            return community_goals.snapshot(room, member_id)
        if action in ('sync', 'leave', 'close'):
            return community_goals.update(data, user_id=uid)
        raise ValueError('Unknown goal action.')
    except PermissionError as error:
        limiter.check(f'goals_fail:{caller_id}', 10, 300.0, 'Too many failed access attempts.')
        raise HTTPException(403, str(error))
    except ValueError as error:
        if action in ('preview', 'join', 'get'):
            limiter.check(f'goals_fail:{caller_id}', 10, 300.0, 'Too many failed code lookups.')
        raise HTTPException(400, str(error))


@app.post('/rep-api/food-analyze')
async def food_analyze(request: Request):
    caller_id = await auth(request)
    limiter.check(f'food_analyze:{caller_id}', 30, 60.0)
    data = await payload(request, FRAME_BODY_LIMIT)
    encoded = data.get('image')
    if not isinstance(encoded, str):
        encoded = ''
    meal_hint = str(data.get('mealHint', '') or '')[:120]
    hint = str(data.get('hint', '') or '')[:400]
    try:
        result = await asyncio.to_thread(analyze_food_image, encoded, meal_hint, hint)
        return {'type': 'food_analysis_result', 'success': True, 'data': result}
    except ValueError as error:
        return {'type': 'food_analysis_result', 'success': False, 'error': str(error)}


@app.post('/rep-api/food-describe')
async def food_describe(request: Request):
    caller_id = await auth(request)
    limiter.check(f'food_describe:{caller_id}', 60, 60.0)
    data = await payload(request, JSON_BODY_LIMIT)
    description = str(data.get('description', '') or '')[:500]
    try:
        result = await asyncio.to_thread(describe_food, description)
        return {'type': 'describe_food_result', 'success': True, 'data': result}
    except ValueError as error:
        return {'type': 'describe_food_result', 'success': False, 'error': str(error)}


@app.post('/rep-api/ai')
async def ai_request(request: Request):
    """All trained Footprint AI features over the authenticated rep server (used in the cloud and over tunnels).

    Body: the same JSON the AI server's WebSocket takes, e.g. {"type": "estimate_body_fat", ...}.
    """
    caller_id = await auth(request)
    limiter.check(f'ai:{caller_id}', 30, 60.0)
    data = await payload(request, AI_BODY_LIMIT)
    kind = data.get('type')
    if kind not in AI_RESULT_TYPE:
        raise HTTPException(400, 'Unsupported AI request type.')
    try:
        result = await asyncio.to_thread(ai_handle, data)
        return {'type': AI_RESULT_TYPE[kind], 'success': True, 'data': result}
    except (ValueError, AIImageError) as error:
        return {'type': AI_RESULT_TYPE[kind], 'success': False, 'error': str(error)}
