"""Persistent, invite-only two-person nutrition challenges (self-reported logs)."""
import hashlib
import hmac
import json
import math
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class CalorieChallenges:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        db.execute('create table if not exists calorie_challenges (code text primary key, data text not null)')
        try:
            with db: yield db
        finally: db.close()

    def save(self, room):
        with self.db() as db:
            db.execute('insert or replace into calorie_challenges values (?,?)', (room['code'], json.dumps(room)))

    def load(self, code):
        with self.db() as db:
            row = db.execute('select data from calorie_challenges where code=?', (str(code).strip().upper(),)).fetchone()
        if not row: raise ValueError('Challenge not found. Check the invite code.')
        return json.loads(row[0])

    @staticmethod
    def today(room):
        return datetime.now(ZoneInfo(room['timezone'])).date().isoformat()

    @staticmethod
    def digest(key):
        return hashlib.sha256(key.encode()).hexdigest()

    def member(self, room, key):
        for i, player in enumerate(room['players']):
            if hmac.compare_digest(player['secret'], self.digest(str(key))): return i
        raise PermissionError('This device does not have access to that challenge.')

    def create(self, data):
        target, days = data.get('target'), data.get('days')
        if type(target) is not int or not 1000 <= target <= 10000: raise ValueError('Enter a target from 1,000 to 10,000 kcal.')
        if type(days) is not int or days not in (1, 7, 14, 30): raise ValueError('Choose 1, 7, 14 or 30 days.')
        if data.get('mode') not in ('cut', 'bulk'): raise ValueError('Choose cut or bulk.')
        tz = str(data.get('timezone', 'UTC'))
        try: ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError): raise ValueError('Invalid time zone.')
        key = secrets.token_hex(32)
        room = dict(code=secrets.token_hex(6).upper(), mode=data['mode'], target=target, days=days,
                    timezone=tz, created=datetime.now(timezone.utc).isoformat(), start=None, end=None,
                    cancelled=False, players=[dict(name=str(data.get('name', 'You'))[:40],
                    secret=self.digest(key), totals={}, completed=[])])
        self.save(room)
        return dict(key=key, challenge=self.snapshot(room, 0))

    def join(self, data):
        room = self.load(data.get('code', ''))
        if room['cancelled'] or len(room['players']) != 1: raise ValueError('This invite is no longer available.')
        if datetime.now(timezone.utc) - datetime.fromisoformat(room['created']) > timedelta(days=7):
            raise ValueError('This invite has expired. Ask your friend for a new one.')
        key = secrets.token_hex(32)
        room['players'].append(dict(name=str(data.get('name', 'Friend'))[:40], secret=self.digest(key), totals={}, completed=[]))
        room['start'] = self.today(room)
        room['end'] = (datetime.fromisoformat(room['start']) + timedelta(days=room['days'] - 1)).date().isoformat()
        self.save(room)
        return dict(key=key, challenge=self.snapshot(room, 1))

    def update(self, data):
        room = self.load(data.get('code', '')); member = self.member(room, data.get('key', ''))
        if data.get('cancel') is True and (not room['end'] or self.today(room) <= room['end']):
            room['cancelled'] = True
        elif room['start'] and not room['cancelled'] and self.today(room) <= room['end']:
            player = room['players'][member]
            totals = data.get('totals', {})
            if not isinstance(totals, dict) or len(totals) > 31: raise ValueError('Invalid calorie totals.')
            valid = {}
            for day, calories in totals.items():
                if not isinstance(day, str) or not room['start'] <= day <= min(self.today(room), room['end']):
                    raise ValueError('Invalid challenge day.')
                try:
                    if datetime.fromisoformat(day).date().isoformat() != day: raise ValueError()
                except ValueError: raise ValueError('Invalid challenge day.')
                if type(calories) not in (int, float) or not math.isfinite(calories) or not 0 <= calories <= 100000:
                    raise ValueError('Invalid calorie total.')
                valid[day] = round(calories)
            player['totals'] = valid
            player['completed'] = [day for day in player['completed'] if self.met(room, valid.get(day, 0))]
            if data.get('complete') is True:
                today = self.today(room)
                if not self.met(room, valid.get(today, 0)): raise ValueError('Finish within 10% of the target to complete today.')
                if today not in player['completed']: player['completed'].append(today)
        self.save(room)
        return self.snapshot(room, member)

    @staticmethod
    def met(room, total):
        return abs(total - room['target']) <= room['target'] * .1

    def snapshot(self, room, member):
        today = self.today(room)
        status = ('cancelled' if room['cancelled'] else 'waiting' if not room['start'] else
                  'finished' if today > room['end'] else 'active')
        scores = [len(p['completed']) for p in room['players']]
        winner = None
        if status == 'finished' and len(scores) == 2 and scores[0] != scores[1]: winner = scores.index(max(scores))
        return {**{k: room[k] for k in ('code', 'mode', 'target', 'days', 'timezone', 'start', 'end')},
                'status': status, 'today': today, 'you': member, 'winner': winner,
                'players': [dict(name=p['name'], score=len(p['completed']),
                    calories=p['totals'].get(today, 0), complete=today in p['completed']) for p in room['players']]}
