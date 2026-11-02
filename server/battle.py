"""Single-event-loop authority: only server-detected reps can move a battle."""
import secrets
import time
from dataclasses import dataclass, field

LEAD_TO_WIN = 10


@dataclass
class Room:
    code: str
    players: list
    names: dict
    ready: set = field(default_factory=set)
    counts: dict = field(default_factory=dict)
    status: str = 'waiting'
    winner: str | None = None
    reason: str | None = None
    start_at: float | None = None
    created: float = field(default_factory=time.monotonic)
    revision: int = 0

    def snapshot(self):
        host, guest = self.players[0], self.players[1] if len(self.players) > 1 else None
        lead = self.counts.get(host, 0) - self.counts.get(guest, 0)
        return {'type': 'battle_state', 'code': self.code, 'players': self.players[:],
                'names': self.names.copy(), 'ready': sorted(self.ready), 'counts': self.counts.copy(),
                'status': self.status, 'winner': self.winner, 'reason': self.reason,
                'start_at': self.start_at, 'lead_to_win': LEAD_TO_WIN,
                'host_share': max(0, min(1, .5 + lead / (2 * LEAD_TO_WIN))), 'revision': self.revision}


class Battles:
    def __init__(self):
        self.rooms = {}
        self.members = {}

    def create(self, player, name):
        if len(self.rooms) >= 40: raise ValueError('All battle rooms are busy. Try again shortly.')
        if player in self.members: raise ValueError('Leave your current battle first.')
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        while code in self.rooms:
            code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        room = Room(code, [player], {player: name}, counts={player: 0})
        self.rooms[code] = room; self.members[player] = code
        return room

    def join(self, player, name, code):
        if player in self.members: raise ValueError('Leave your current battle first.')
        room = self.rooms.get(code)
        if not room or room.status != 'waiting' or len(room.players) != 1:
            raise ValueError('Room is unavailable, full, or expired. Ask for a fresh code.')
        room.players.append(player); room.names[player] = name; room.counts[player] = 0
        room.revision += 1; self.members[player] = code
        return room

    def get(self, player):
        return self.rooms.get(self.members.get(player))

    def set_ready(self, player, ready):
        room = self.get(player)
        if not room or room.status != 'waiting': raise ValueError('This room is no longer waiting.')
        if ready: room.ready.add(player)
        else: room.ready.discard(player)
        if len(room.players) == 2 and len(room.ready) == 2:
            room.status = 'countdown'; room.start_at = time.time() + 3
        room.revision += 1
        return room

    def start(self, room):
        if room.status == 'countdown' and room.start_at <= time.time():
            room.status = 'active'; room.counts = {p: 0 for p in room.players}; room.revision += 1
            return True
        return False

    def rep(self, player):
        room = self.get(player)
        if not room or room.status != 'active': return None
        room.counts[player] += 1
        other = next(p for p in room.players if p != player)
        if room.counts[player] - room.counts[other] >= LEAD_TO_WIN:
            room.status = 'finished'; room.winner = player; room.reason = 'lead'
        room.revision += 1
        return room

    def leave(self, player):
        room = self.get(player)
        self.members.pop(player, None)
        if not room: return None
        room.ready.discard(player)
        if room.status in ('active', 'countdown', 'waiting'):
            room.status = 'finished' if room.status == 'active' else 'cancelled'
            room.winner = next((p for p in room.players if p != player), None) if room.status == 'finished' else None
            room.reason = 'opponent_left'; room.revision += 1
        if not any(p in self.members for p in room.players): self.rooms.pop(room.code, None)
        return room

    def sweep(self):
        # Waiting invitations expire without leaving unbounded room records.
        now = time.monotonic()
        for code, room in list(self.rooms.items()):
            if now - room.created > 1800:
                for p in room.players: self.members.pop(p, None)
                self.rooms.pop(code, None)
