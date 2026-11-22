"""Invite-only collaborative virtual border walks. Totals are device-reported."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import secrets
import sqlite3


def _clean_text(value, default, max_len):
    cleaned = re.sub(r'[\x00-\x1f\x7f]', '', str(value if value is not None else '')).strip()
    return (cleaned or default)[:max_len]


class CountryQuests:
    def __init__(self, path, catalog):
        self.path = Path(path)
        self.countries = {c['id']: c for c in json.loads(Path(catalog).read_text(encoding='utf-8'))['countries']}

    @contextmanager
    def db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10.0)
        db.execute('pragma journal_mode=WAL')
        db.execute('pragma busy_timeout=5000')
        try:
            with db:
                db.execute('create table if not exists country_quests (code text primary key, data text not null)')
                yield db
        finally: db.close()

    def save(self, room):
        with self.db() as db:
            db.execute('insert or replace into country_quests values (?,?)', (room['code'], json.dumps(room)))

    def load(self, code):
        with self.db() as db:
            row = db.execute('select data from country_quests where code=?', (str(code).strip().upper(),)).fetchone()
        if not row: raise ValueError('Quest not found. Check your invite code.')
        return json.loads(row[0])

    @staticmethod
    def identity(data, user_id=None):
        key = data.get('walkerKey', '')
        if not isinstance(key, str) or not 64 <= len(key) <= 128: raise PermissionError('Missing walker access key.')
        material = f'{user_id}:{key}' if user_id else key
        return hashlib.sha256(material.encode()).hexdigest()

    def member(self, room, data, user_id=None):
        member_id = self.identity(data, user_id=user_id)
        if member_id not in room['members']: raise PermissionError('Join this quest before viewing team progress.')
        return member_id

    @staticmethod
    def player(data):
        return dict(name=_clean_text(data.get('name'), 'Walker', 40), steps=0,
                    joinedAt=datetime.now(timezone.utc).isoformat(), left=False)

    def create(self, data, user_id=None):
        country = self.countries.get(data.get('countryId'))
        if not country: raise ValueError('Choose a country from the catalog.')
        member_id = self.identity(data, user_id=user_id)
        with self.db() as db:
            if db.execute('select count(*) from country_quests').fetchone()[0] >= 10000:
                raise ValueError('Quest storage limit reached. Try again later.')
        room = dict(code=secrets.token_hex(6).upper(), countryId=country['id'], owner=member_id,
                    title=_clean_text(data.get('title'), f"Walk around {country['name']}", 80),
                    goalSteps=math.ceil(country['totalKm']*1310), closed=False, completed=False,
                    members={member_id: self.player(data)})
        self.save(room)
        return self.snapshot(room, member_id)

    def preview(self, data):
        room = self.load(data.get('code', ''))
        if room['closed'] or room['completed']: raise ValueError('This quest has ended.')
        return dict(title=room['title'], countryId=room['countryId'], goalSteps=room['goalSteps'],
                    memberCount=len(room['members']))

    def join(self, data, user_id=None):
        room = self.load(data.get('code', '')); member_id = self.identity(data, user_id=user_id)
        if room['closed'] or room['completed']: raise ValueError('This quest has ended.')
        if member_id in room['members']:
            if room['members'][member_id]['left']: raise ValueError('You have left this quest. Create or join another quest.')
            return self.snapshot(room, member_id)
        if len(room['members']) >= 50: raise ValueError('This quest already has 50 walkers.')
        room['members'][member_id] = self.player(data); self.save(room)
        return self.snapshot(room, member_id)

    def update(self, data, user_id=None):
        room = self.load(data.get('code', '')); member_id = self.member(room, data, user_id=user_id)
        player = room['members'][member_id]
        if room['closed'] or room['completed']: return self.snapshot(room, member_id)
        if data.get('action') == 'leave':
            if member_id == room['owner']: raise ValueError('The creator can end the quest for the team instead.')
            player['left'] = True
        elif data.get('action') == 'close':
            if member_id != room['owner']: raise PermissionError('Only the creator can end the quest.')
            room['closed'] = True
        else:
            if player['left']: raise PermissionError('You have left this quest.')
            steps = data.get('steps')
            if type(steps) is not int or not 0 <= steps <= 1_000_000_000: raise ValueError('Invalid step total.')
            # Replace each member's absolute total; retries never add the same walk twice.
            player['steps'] = steps
            room['completed'] = sum(p['steps'] for p in room['members'].values()) >= room['goalSteps']
        self.save(room)
        return self.snapshot(room, member_id)

    def snapshot(self, room, member_id):
        return {**{k: room[k] for k in ('code', 'countryId', 'title', 'goalSteps')},
                'status': 'completed' if room['completed'] else 'closed' if room['closed'] else 'active',
                'you': member_id[:16], 'isOwner': member_id == room['owner'],
                'joinedAt': room['members'][member_id]['joinedAt'], 'left': room['members'][member_id]['left'],
                'totalSteps': sum(p['steps'] for p in room['members'].values()),
                'members': [dict(id=key[:16], **player) for key, player in room['members'].items()]}
