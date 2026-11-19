"""Seven-day shared step goals, using the existing invite/capability protocol."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from .country_quests import CountryQuests


class CommunityGoals(CountryQuests):
    def __init__(self, path, clock=None):
        self.path = Path(path)
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def create(self, data):
        target = data.get('target')
        if type(target) is not int or not 100 <= target <= 1_000_000:
            raise ValueError('Choose a shared step goal from 100 to 1,000,000.')
        owner = self.identity(data)
        start = self.clock()
        player = self.player(data)
        player['joinedAt'] = start.isoformat()
        room = dict(code=secrets.token_hex(6).upper(), countryId='SQUAD', owner=owner,
                    title=str(data.get('title', '')).strip()[:80] or 'Squad step goal',
                    goalSteps=target, startsAt=start.isoformat(), endsAt=(start + timedelta(days=7)).isoformat(),
                    closed=False, completed=False, members={owner: player})
        self.save(room)
        return self.snapshot(room, owner)

    def player(self, data):
        player = super().player(data)
        player['joinedAt'] = self.clock().isoformat()
        return player

    def load(self, code):
        room = super().load(code)
        if not room['closed'] and not room['completed'] and self.clock() >= datetime.fromisoformat(room['endsAt']):
            room['closed'] = True
            self.save(room)
        return room

    def preview(self, data):
        room = self.load(data.get('code', ''))
        if room['closed'] or room['completed']:
            raise ValueError('This squad goal has ended.')
        return dict(title=room['title'], goalSteps=room['goalSteps'], endsAt=room['endsAt'], memberCount=len(room['members']))

    def snapshot(self, room, member_id):
        return {**super().snapshot(room, member_id), 'startsAt': room['startsAt'], 'endsAt': room['endsAt']}
