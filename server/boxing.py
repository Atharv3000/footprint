"""Shadowboxing game heuristics over pretrained MediaPipe landmarks, not form grading."""
import math
import random
from collections import deque


class BoxingGame:
    APPROACH = 3.0
    EARLY = 1.9
    LATE = 3.8
    ROUND = 60.0

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.clock = 0.; self.last = None; self.guard_frames = 0
        self.calibrated = False; self.target = None; self.next_at = 0.
        self.hits = 0; self.misses = 0; self.score = 0; self.combo = 0; self.best = 0
        self.bag = []; self.serial = 0; self.history = {'l': deque(maxlen=8), 'r': deque(maxlen=8)}
        self.armed = {'l': False, 'r': False}; self.feedback = 'Face the camera and raise both hands to guard.'
        self.result = ''; self.result_at = -10.; self.anchor = None

    def pause(self):
        self.last = None
        for h in self.history.values(): h.clear()
        self.armed = {'l': False, 'r': False}

    def spawn(self):
        if not self.bag:
            self.bag = [(side, kind) for side in ('l', 'r') for kind in ('straight', 'hook', 'uppercut')]
            self.rng.shuffle(self.bag)
        side, kind = self.bag.pop(); self.serial += 1
        # Body-relative pad centres. Anatomical left/right follows MediaPipe, never display mirroring.
        self.target = dict(id=self.serial, hand=side, kind=kind, born=self.clock,
                           x=(.25 if side == 'l' else -.25) if kind != 'hook' else (-.1 if side == 'l' else .1),
                           y=-.4 if kind != 'uppercut' else -.1)

    @staticmethod
    def body(points, aspect):
        names = [f'{joint}_{side}' for side in ('l', 'r') for joint in ('shoulder', 'elbow', 'wrist')]
        if not math.isfinite(aspect) or aspect <= 0: return None
        if any(n not in points or points[n].get('visibility', 0) < .55 or
               not all(math.isfinite(points[n].get(k, float('nan'))) for k in ('x', 'y', 'z')) or
               not -.03 <= points[n]['x'] <= 1.03 or not -.03 <= points[n]['y'] <= 1.03 for n in names): return None
        l, r = points['shoulder_l'], points['shoulder_r']
        scale = abs(l['x'] - r['x']) * aspect
        if scale < .12 * aspect or abs(l['z'] - r['z']) * aspect > scale * .8: return None
        center = ((l['x'] + r['x']) / 2, (l['y'] + r['y']) / 2, (l['z'] + r['z']) / 2)
        return center, scale

    @staticmethod
    def angle(s, e, w):
        a = [s[i] - e[i] for i in range(3)]; b = [w[i] - e[i] for i in range(3)]
        den = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
        return math.degrees(math.acos(max(-1, min(1, sum(a[i]*b[i] for i in range(3)) / den)))) if den > .0001 else 0

    def update(self, points, now, aspect=1):
        body = self.body(points, aspect)
        if body is None:
            self.pause(); self.guard_frames = 0
            self.feedback = 'Show both shoulders, elbows and hands. Face the camera in good light.'
            return self.snapshot(False)
        center, scale = body
        self.anchor = dict(x=center[0], y=center[1], scale=scale, aspect=aspect,
                           left_is_right=points['shoulder_l']['x'] > points['shoulder_r']['x'])
        def relative(name):
            p = points[name]
            return ((p['x']-center[0])*aspect/scale, (p['y']-center[1])/scale, (p['z']-center[2])*aspect/scale)
        samples = {}
        for side in ('l', 'r'):
            s, e, w = [relative(f'{joint}_{side}') for joint in ('shoulder', 'elbow', 'wrist')]
            samples[side] = dict(w=w, angle=self.angle(s, e, w), guard=abs(w[0]-s[0]) < .7 and -.95 < w[1] < .3)
        if not self.calibrated:
            self.guard_frames = self.guard_frames + 1 if all(s['guard'] for s in samples.values()) else 0
            if self.guard_frames < 3:
                self.last = now; self.feedback = 'Hold both fists near your cheeks for three camera samples.'
                return self.snapshot(True)
            self.calibrated = True; self.last = now
        dt = now - self.last if self.last is not None else 0
        if dt < 0 or dt > 1.2:
            self.pause(); dt = 0
        self.last = now
        self.clock = min(self.ROUND, self.clock + min(dt, .45))
        if self.clock >= self.ROUND:
            self.target = None; self.feedback = 'Round complete! Save your hits or start a new round.'
            return self.snapshot(True)
        if self.target and self.clock - self.target['born'] > self.LATE:
            self.misses += 1; self.combo = 0; self.target = None; self.next_at = self.clock + .5
            self.result = 'MISS'; self.result_at = self.clock
        if self.target is None and self.clock >= self.next_at: self.spawn()
        for side, sample in samples.items():
            history = self.history[side]
            while history and self.clock - history[0]['at'] > .95: history.popleft()
            if sample['guard']: self.armed[side] = True
            target = self.target
            if target and target['hand'] == side and self.armed[side] and history:
                start = history[0]; w = sample['w']; old = start['w']
                dx, dy, dz = [w[i]-old[i] for i in range(3)]
                toward = -1 if points[f'shoulder_{side}']['x'] > center[0] else 1
                kind = target['kind']; age = self.clock-target['born']
                direction = (
                    (dz < -.26 and sample['angle'] > 125 and sample['angle']-start['angle'] > 15) if kind == 'straight' else
                    (dx*toward > .32 and abs(dy) < .4 and 50 < sample['angle'] < 145) if kind == 'hook' else
                    (dy < -.32 and abs(dx) < .6 and 35 < sample['angle'] < 150)
                )
                # Flip anatomical offsets for rear-camera/nonstandard pose ordering.
                tx = target['x'] * (1 if self.anchor['left_is_right'] else -1)
                overlap = math.hypot(w[0]-tx, w[1]-target['y']) < .62
                if self.EARLY <= age <= self.LATE and direction and overlap:
                    self.hits += 1; self.combo += 1; self.best = max(self.best, self.combo)
                    self.score += 100 + min(100, (self.combo-1)*10)
                    self.armed[side] = False; self.target = None; self.next_at = self.clock + .5
                    self.result = 'HIT'; self.result_at = self.clock; history.clear()
            history.append(dict(at=self.clock, **sample))
        if self.target:
            hand = 'Left' if self.target['hand'] == 'l' else 'Right'
            self.feedback = f"{hand} {self.target['kind']} — strike as the pad reaches the ring, then return to guard."
        return self.snapshot(True)

    def snapshot(self, valid):
        target = None
        if self.target and self.anchor:
            a = self.anchor; target = dict(self.target)
            target['x'] = a['x'] + target['x'] * (1 if a['left_is_right'] else -1) * a['scale'] / a['aspect']
            target['y'] = a['y'] + target['y'] * a['scale']
            target['age'] = self.clock - target.pop('born')
            target['inward'] = (-1 if a['left_is_right'] else 1) * (1 if target['hand'] == 'l' else -1)
        return dict(rep_count=self.hits, valid=valid, calibrated=self.calibrated, state='boxing', feedback=self.feedback,
                    boxing=dict(score=self.score, hits=self.hits, misses=self.misses, combo=self.combo,
                    best_combo=self.best, remaining=max(0, math.ceil(self.ROUND-self.clock)),
                    finished=self.clock >= self.ROUND, target=target, result=self.result if self.clock-self.result_at < .6 else '',
                    scale=self.anchor['scale'] if self.anchor else .2))
