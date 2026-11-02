"""Invite-only collaborative virtual border walks. Totals are device-reported."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import secrets
import sqlite3


class CountryQuests:
    def __init__(self, path, catalog):
        self.path = Path(path)
        self.countries = {c['id']: c for c in json.loads(Path(catalog).read_text(encoding='utf-8'))['countries']}

    @contextmanager
    def db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
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
    def identity(data):
        key = data.get('walkerKey', '')
        if not isinstance(key, str) or not 64 <= len(key) <= 128: raise PermissionError('Missing walker access key.')
        return hashlib.sha256(key.encode()).hexdigest()

    def member(self, room, data):
        member_id = self.identity(data)
        if member_id not in room['members']: raise PermissionError('Join this quest before viewing team progress.')
        return member_id

    @staticmethod
    def player(data):
        return dict(name=str(data.get('name', 'Walker')).strip()[:40] or 'Walker', steps=0,
                    joinedAt=datetime.now(timezone.utc).isoformat(), left=False)

    def create(self, data):
        country = self.countries.get(data.get('countryId'))
        if not country: raise ValueError('Choose a country from the catalog.')
        member_id = self.identity(data)
        room = dict(code=secrets.token_hex(6).upper(), countryId=country['id'], owner=member_id,
                    title=str(data.get('title', '')).strip()[:80] or f"Walk around {country['name']}",
                    goalSteps=math.ceil(country['totalKm']*1310), closed=False, completed=False,
                    members={member_id: self.player(data)})
        self.save(room)
        return self.snapshot(room, member_id)

    def preview(self, data):
        room = self.load(data.get('code', ''))
        if room['closed'] or room['completed']: raise ValueError('This quest has ended.')
        return dict(title=room['title'], countryId=room['countryId'], goalSteps=room['goalSteps'],
                    memberCount=len(room['members']))

    def join(self, data):
        room = self.load(data.get('code', '')); member_id = self.identity(data)
        if room['closed'] or room['completed']: raise ValueError('This quest has ended.')
        if member_id in room['members']:
            if room['members'][member_id]['left']: raise ValueError('You have left this quest. Create or join another quest.')
            return self.snapshot(room, member_id)
        if len(room['members']) >= 50: raise ValueError('This quest already has 50 walkers.')
        room['members'][member_id] = self.player(data); self.save(room)
        return self.snapshot(room, member_id)

    def update(self, data):
        room = self.load(data.get('code', '')); member_id = self.member(room, data)
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
