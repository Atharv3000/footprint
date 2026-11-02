"""Ephemeral development camera relay. HTTP polling works through Expo's tunnel."""
import asyncio
import hmac
import json
import os
import secrets
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request

from .calorie_challenges import CalorieChallenges
from .battle import Battles
from .counter import RepCounter
from .boxing import BoxingGame
from .country_quests import CountryQuests

TOKEN = os.environ.get('REP_SERVER_TOKEN', '')
battles = Battles()
calorie_challenges = CalorieChallenges(os.environ.get('CALORIE_DB_PATH', str(Path(__file__).parent / 'data/calories.sqlite3')))
country_quests = CountryQuests(os.environ.get('COUNTRY_QUEST_DB_PATH', str(Path(__file__).parent / 'data/country-quests.sqlite3')), Path(__file__).parent.parent / 'assets/data/countryBorders.json')
clients = {}
sessions = {}
vision = None
tasks = set()


class Client:
    def __init__(self):
        self.id = secrets.token_hex(12); self.session = secrets.token_hex(32)
        self.counter = RepCounter(); self.boxing = None; self.valid_at = 0; self.frame_at = 0
        self.touched = time.monotonic(); self.busy = False; self.epoch = 0
        self.messages = deque(maxlen=12)

    def send(self, message):
        # Keep only the latest camera frame / state, with bounded memory.
        kind = message['type']
        if kind in ('battle_state', 'opponent_frame'):
            self.messages = deque((m for m in self.messages if m['type'] != kind), maxlen=12)
        self.messages.append(message)


def publish(room, exclude=None):
    state = room.snapshot()
    for p in room.players:
        if p in clients and p != exclude: clients[p].send(state)


def remove(client):
    client.epoch += 1
    room = battles.leave(client.id)
    if room: publish(room)
    clients.pop(client.id, None); sessions.pop(client.session, None)


async def clean_stale():
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        for client in list(clients.values()):
            if now - client.touched > 20: remove(client)
        for room in list(battles.rooms.values()):
            if now - room.created > 1800:
                room.status = 'cancelled'; room.reason = 'expired'; room.revision += 1
                publish(room)
                for p in room.players: battles.members.pop(p, None)
                battles.rooms.pop(room.code, None)


@asynccontextmanager
async def lifespan(app):
    global vision
    if len(TOKEN) < 32: raise RuntimeError('Start through scripts/rep-dev.cjs to set the session token.')
    if vision is None:
        from .vision import Vision
        vision = Vision(os.environ.get('REP_POSE_MODEL', str(Path(__file__).parent / 'models/pose_landmarker_full.task')))
    cleaner = asyncio.create_task(clean_stale())
    yield
    cleaner.cancel()
    for task in list(tasks): task.cancel()
    with suppress(asyncio.CancelledError): await cleaner
    vision.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def auth(request):
    if not TOKEN or not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {TOKEN}'):
        raise HTTPException(401, 'Development session expired. Reload the app.')


def client_for(request):
    auth(request)
    client = sessions.get(request.headers.get('x-rep-session', ''))
    if not client: raise HTTPException(401, 'Connection expired. Reconnect to begin a new session.')
    client.touched = time.monotonic()
    return client


async def payload(request):
    if int(request.headers.get('content-length', '0')) > 2_900_000:
        raise HTTPException(413, 'Camera frame is too large.')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 2_900_000: raise HTTPException(413, 'Camera frame is too large.')
    try:
        result = json.loads(body)
        if not isinstance(result, dict): raise ValueError()
        return result
    except (ValueError, TypeError): raise HTTPException(400, 'Invalid message.')


@app.get('/rep-api/health')
def health():
    return {'ready': vision is not None, 'mode': 'development', 'lead_to_win': 10}


@app.post('/rep-api/session')
async def session(request: Request):
    auth(request)
    if len(clients) >= 12: raise HTTPException(503, 'Server is busy. Try again shortly.')
    client = Client(); clients[client.id] = client; sessions[client.session] = client
    return {'session': client.session, 'player_id': client.id}


@app.get('/rep-api/poll')
async def poll(request: Request):
    client = client_for(request)
    messages = list(client.messages); client.messages.clear()
    return {'messages': messages}


@app.post('/rep-api/close')
async def close(request: Request):
    client = client_for(request); remove(client)
    return {'messages': []}


async def start_after_countdown(room, deadline):
    await asyncio.sleep(max(0, deadline - time.time()))
    if battles.start(room):
        for p in room.players:
            if p in clients:
                clients[p].counter.begin_set(time.monotonic()); clients[p].epoch += 1
        publish(room)


@app.post('/rep-api/command')
async def command(request: Request):
    client = client_for(request); data = await payload(request)
    kind = data.get('type'); room = battles.get(client.id)
    try:
        if kind == 'ping': return {'messages': []}
        if kind == 'reset':
            if room: raise ValueError('Leave your battle before changing exercises.')
            exercise = data.get('exercise', 'pushups')
            if exercise not in ('pushups', 'squats', 'bicep_curls', 'boxing'): raise ValueError('Unsupported exercise.')
            client.boxing = BoxingGame() if exercise == 'boxing' else None
            client.counter = RepCounter('pushups' if client.boxing else exercise); client.epoch += 1; client.valid_at = 0
            return {'messages': [{'type': 'reset', 'rep_count': 0}]}
        if kind in ('create', 'join'):
            name = str(data.get('name', 'Player')).strip()[:24] or 'Player'
            room = battles.create(client.id, name) if kind == 'create' else battles.join(
                client.id, name, str(data.get('code', '')).strip().upper())
            client.boxing = None
            client.counter = RepCounter(); client.epoch += 1; client.valid_at = 0
            publish(room); return {'messages': []}
        if kind == 'ready':
            ready = data.get('ready') is True
            if ready and client.counter.view_mode != 'side':
                raise ValueError('Turn side-on to the camera before the battle. Head-on counting is not reliable.')
            if ready and (time.monotonic() - client.valid_at > 2 or client.counter.top_height is None
                          or client.counter.phase != 'up'):
                raise ValueError('Hold a straight-arm plank in view before tapping Ready.')
            room = battles.set_ready(client.id, ready); publish(room)
            if room.status == 'countdown':
                task = asyncio.create_task(start_after_countdown(room, room.start_at))
                tasks.add(task); task.add_done_callback(tasks.discard)
            return {'messages': []}
        if kind in ('leave', 'pause'):
            room = battles.leave(client.id)
            if room: publish(room, exclude=client.id)
            client.messages.clear()
            if client.boxing: client.boxing.pause()
            client.counter.reset_cycle(); client.valid_at = 0; client.epoch += 1
            return {'messages': [{'type': 'left'}]}
        raise ValueError('Unsupported command.')
    except ValueError as error: raise HTTPException(400, str(error))


@app.post('/rep-api/frame')
async def frame(request: Request):
    client = client_for(request)
    if client.busy or time.monotonic() - client.frame_at < .15:
        return {'messages': [{'type': 'frame_skipped'}]}
    client.busy = True; client.frame_at = time.monotonic(); epoch = client.epoch
    try:
        data = await payload(request)
        if client.boxing:
            points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'), True)
        else:
            points, aspect, preview = await asyncio.to_thread(vision.analyze, data.get('image'))
        if client.id not in clients or epoch != client.epoch:
            return {'messages': [{'type': 'frame_skipped'}]}
        room = battles.get(client.id)
        before = client.counter.count
        pose = (client.boxing or client.counter).update(points, time.monotonic(), aspect)
        if pose['valid']: client.valid_at = time.monotonic()
        else:
            client.valid_at = 0
            if room and room.status == 'waiting' and client.id in room.ready:
                room.ready.discard(client.id); room.revision += 1; publish(room)
        if room and room.status == 'active' and client.counter.count > before:
            updated = battles.rep(client.id)
            if updated: publish(updated)
        if room and room.status in ('waiting', 'countdown', 'active'):
            for p in room.players:
                if p != client.id and p in clients:
                    clients[p].send({'type': 'opponent_frame', 'image': preview, 'player_id': client.id})
        return {'messages': [{'type': 'pose', **pose, 'keypoints': points, 'aspect': aspect}]}
    except ValueError as error: raise HTTPException(400, str(error))
    finally: client.busy = False


@app.post('/rep-api/calories')
async def calories(request: Request):
    auth(request)
    data = await payload(request)
    try:
        action = data.get('action')
        if action == 'create': return calorie_challenges.create(data)
        if action == 'join': return calorie_challenges.join(data)
        if action == 'preview':
            room = calorie_challenges.load(data.get('code', ''))
            if room['cancelled'] or len(room['players']) != 1: raise ValueError('This invite is no longer available.')
            return {k: room[k] for k in ('mode', 'target', 'days', 'timezone')}
        if action == 'get':
            room = calorie_challenges.load(data.get('code', ''))
            member = calorie_challenges.member(room, data.get('key', ''))
            return calorie_challenges.snapshot(room, member)
        if action == 'update': return calorie_challenges.update(data)
        raise ValueError('Unknown challenge action.')
    except PermissionError as error: raise HTTPException(403, str(error))
    except ValueError as error: raise HTTPException(400, str(error))


@app.post('/rep-api/countries')
async def countries(request: Request):
    auth(request)
    data = await payload(request)
    try:
        action = data.get('action')
        if action == 'create': return country_quests.create(data)
        if action == 'preview': return country_quests.preview(data)
        if action == 'join': return country_quests.join(data)
        if action == 'get':
            room = country_quests.load(data.get('code', ''))
            member_id = country_quests.member(room, data)
            return country_quests.snapshot(room, member_id)
        if action in ('sync', 'leave', 'close'): return country_quests.update(data)
        raise ValueError('Unknown quest action.')
    except PermissionError as error: raise HTTPException(403, str(error))
    except ValueError as error: raise HTTPException(400, str(error))
