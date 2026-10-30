"""Rep state machines over pretrained pose landmarks; no learned form score."""
import math


def angle(a, b, c):
    u, v = (a['x'] - b['x'], a['y'] - b['y']), (c['x'] - b['x'], c['y'] - b['y'])
    length = math.hypot(*u) * math.hypot(*v)
    if length < 1e-8:
        return None
    return math.degrees(math.acos(max(-1, min(1, sum(x*y for x, y in zip(u, v)) / length))))


class RepCounter:
    def __init__(self, exercise='pushups'):
        self.exercise = exercise
        self.count = 0
        self.reset_cycle()

    def reset_cycle(self):
        self.phase = 'ready'
        self.candidate = None
        self.streak = 0
        self.started = None
        self.last_seen = None
        self.last_rep = -100
        self.top_height = None
        self.top_samples = []
        self.arm_side = None
        self.last_valid = None
        self.view_mode = None

    def begin_set(self, now):
        # Ready/countdown frames calibrate the camera; GO should reset scores,
        # not force both players to hold still for another calibration period.
        calibrated = (self.phase == 'up' and self.top_height is not None
                      and self.last_valid is not None and now - self.last_valid <= 1.5)
        calibration = self.top_height, self.arm_side, self.view_mode
        self.count = 0; self.reset_cycle()
        if calibrated:
            self.top_height, self.arm_side, self.view_mode = calibration
            self.phase = 'up'; self.candidate = 'up'; self.streak = 2
            self.last_valid = now; self.last_seen = now

    def update(self, points, now, aspect=1):
        if self.last_valid is not None and now - self.last_valid > 1.5:
            self.reset_cycle()
        if self.last_seen is not None and now - self.last_seen > 1.5:
            self.reset_cycle()
        if self.started is not None and now - self.started > 15:
            self.reset_cycle()
        self.last_seen = now

        def result(valid, message, value=None):
            return {'rep_count': self.count, 'state': self.phase, 'valid': valid,
                    'feedback': message, 'angle': round(value) if value is not None else None,
                    'view_mode': self.view_mode, 'calibrated': self.top_height is not None if self.exercise == 'pushups' else self.phase != 'ready'}

        def usable(*names):
            return all(n in points and points[n].get('visibility', 0) >= .5
                       and 0 <= points[n]['x'] <= 1 and 0 <= points[n]['y'] <= 1 for n in names)

        if self.exercise == 'pushups':
            def lost(message):
                self.candidate = None; self.streak = 0
                if self.last_valid is None or now - self.last_valid > 1.2:
                    self.phase = 'ready'; self.started = None
                return result(False, message)

            sides = []
            standing_detected = False
            for side in ('l', 'r'):
                names = [f'{joint}_{side}' for joint in ('shoulder', 'elbow', 'wrist', 'hip')]
                if not usable(*names): continue
                shoulder, elbow, wrist, hip = [points[n] for n in names]
                torso_x = abs(shoulder['x'] - hip['x']) * aspect
                if hip['y'] - shoulder['y'] > max(.12, torso_x * .7):
                    standing_detected = True
                    continue
                arm = [{**point, 'x': point['x'] * aspect} for point in (shoulder, elbow, wrist)]
                value = angle(*arm)
                if value is None: continue
                length = math.hypot(arm[0]['x']-arm[1]['x'], arm[0]['y']-arm[1]['y']) + math.hypot(arm[1]['x']-arm[2]['x'], arm[1]['y']-arm[2]['y'])
                if length < .08: continue
                height = wrist['y'] - shoulder['y']
                if height < -.03: continue
                sides.append((min(points[n]['visibility'] for n in names), side, value, height))
            if not sides:
                if standing_detected:
                    return lost('Body detected. Get into a side-on plank for push-ups; standing movements do not count.')
                return lost('Show one complete arm and your hips in a plank. A side-on view is recommended.')
            # Keep the same anatomical arm throughout a repetition.
            chosen = next((item for item in sides if item[1] == self.arm_side), None)
            if chosen is None:
                if self.arm_side is not None and self.last_valid is not None and now - self.last_valid <= 1.2:
                    return lost('Keep the same working arm visible through the whole repetition.')
                chosen = max(sides)
                if self.arm_side != chosen[1]:
                    self.top_height = None; self.top_samples = []; self.phase = 'ready'; self.started = None
                self.arm_side = chosen[1]
            _, side, value, height = chosen
            self.last_valid = now
            shoulder = points[f'shoulder_{side}']; hip = points[f'hip_{side}']
            torso_x = abs(shoulder['x']-hip['x']) * aspect
            shoulder_width = abs(points['shoulder_l']['x'] - points['shoulder_r']['x']) * aspect if usable('shoulder_l', 'shoulder_r') else 0
            self.view_mode = 'side' if torso_x > .08 and (not shoulder_width or shoulder_width < torso_x * 2) else 'head_on'
            if value >= 145 and height > .04 and (self.top_height is None or height >= self.top_height * .82):
                pose = 'up'
                if self.top_height is None:
                    self.top_samples.append(height)
                    if len(self.top_samples) >= 3:
                        self.top_height = sum(self.top_samples[-3:]) / 3
                        self.phase = 'up'; self.candidate = 'up'; self.streak = 2
                elif self.phase != 'down': self.top_height = .98 * self.top_height + .02 * height
            elif self.top_height is not None and value <= 115 and height < self.top_height * .78:
                pose = 'down'
            else: pose = 'middle'
            if self.top_height is None:
                if pose != 'up': self.top_samples = []
                return result(True, 'Hold a straight-arm plank to calibrate. Side-on works best; keep the phone fixed.', value)
        else:
            joints = ('hip', 'knee', 'ankle') if self.exercise == 'squats' else ('shoulder', 'elbow', 'wrist')
            available = []
            for side in ('l', 'r'):
                names = [f'{j}_{side}' for j in joints]
                if usable(*names):
                    a = angle(*[{**points[n], 'x': points[n]['x'] * aspect} for n in names])
                    if a is not None: available.append(a)
            if not available:
                self.phase = 'ready'; self.started = None; self.candidate = None; self.streak = 0
                return result(False, 'Keep the working joints fully visible in the camera.')
            value = sum(available) / len(available)
            pose = 'up' if value >= 155 else 'down' if value <= (100 if self.exercise == 'squats' else 65) else 'middle'

        if pose == 'middle':
            self.candidate = None; self.streak = 0
            return result(True, 'Lower with control, then extend fully.', value)
        if self.candidate == pose: self.streak += 1
        else: self.candidate, self.streak = pose, 1
        if self.streak >= 2:
            if pose == 'up':
                if self.phase == 'down' and self.started is not None and now - self.started >= .8 and now - self.last_rep >= .9:
                    self.count += 1; self.last_rep = now
                self.phase = 'up'; self.started = None
            elif self.phase == 'up':
                self.phase = 'down'; self.started = now
        return result(True, 'Head-on depth is unreliable. Turn side-on for reliable counting.' if self.exercise == 'pushups' and self.view_mode == 'head_on'
                      else 'Push back to straight arms.' if self.phase == 'down' and self.exercise == 'pushups'
                      else 'Ready. Lower fully and return to the top.', value)
