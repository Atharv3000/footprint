"""Rep state machines over pretrained pose landmarks; no learned form score.

The pose network (MediaPipe Pose Landmarker Full) is used unmodified. The
counting layer below is parameterised; the parameters are fitted against
labelled exercise clips by ``server.rep_training`` and loaded from
``server/training/rep_counter_params.json`` when present. Without that file the
built-in defaults are used.
"""
import copy
import json
import math
from pathlib import Path

PARAMS_PATH = Path(__file__).parent / 'training' / 'rep_counter_params.json'

DEFAULT_PARAMS = {
    'pushups': {
        'up_angle': 145.0, 'down_angle': 115.0, 'top_ratio': .82, 'bottom_ratio': .78,
        'min_descent_s': .8, 'min_gap_s': .9, 'streak': 2, 'relabel_dist': .12, 'calib_frames': 3,
    },
    'squats': {
        # Knee angle alone misses front-on squats (foreshortened knees), so the
        # hip drop relative to standing leg length can also mark the bottom.
        'up_angle': 155.0, 'down_angle': 100.0, 'drop_down': .22, 'drop_up': .06,
        'min_descent_s': .5, 'min_gap_s': .6, 'streak': 1,
    },
    'bicep_curls': {
        # Each arm is tracked separately (alternating curls); reps finishing on
        # both arms within merge_s are one barbell/two-dumbbell rep. Elbows must
        # hang below the shoulders, which rejects presses and pull-ups.
        'up_angle': 145.0, 'down_angle': 65.0, 'hang_ratio': .45, 'merge_s': .5,
        'min_descent_s': .4, 'min_gap_s': .6, 'streak': 1,
        # Hips moving more than this many torso lengths within ~1.2 s means a
        # squat, jump or lunge, not a curl.
        'max_hip_motion': .25,
        # A curled arm lifts the hand above the elbow; hands resting on hips
        # or a bent arm hanging at the side do not.
        'wrist_rise': .2,
    },
}


def load_params(path=PARAMS_PATH):
    params = copy.deepcopy(DEFAULT_PARAMS)
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return params
    for exercise, values in data.items():
        if exercise in params and isinstance(values, dict):
            for key, value in values.items():
                if key in params[exercise] and isinstance(value, (int, float)) and math.isfinite(value):
                    params[exercise][key] = value
    return params


_LOADED = None


def trained_params():
    global _LOADED
    if _LOADED is None:
        _LOADED = load_params()
    return _LOADED


def angle(a, b, c):
    u, v = (a['x'] - b['x'], a['y'] - b['y']), (c['x'] - b['x'], c['y'] - b['y'])
    length = math.hypot(*u) * math.hypot(*v)
    if length < 1e-8:
        return None
    return math.degrees(math.acos(max(-1, min(1, sum(x*y for x, y in zip(u, v)) / length))))


class RepCounter:
    def __init__(self, exercise='pushups', params=None):
        self.exercise = exercise
        source = params if params is not None else trained_params()
        self.p = dict(DEFAULT_PARAMS.get(exercise, DEFAULT_PARAMS['pushups']))
        self.p.update(source.get(exercise, {}))
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
        self.last_shoulder = None
        self.hip_track = []
        # squats: standing hip height and leg length
        self.top_hip = None
        self.leg_length = None
        # curls: independent per-arm machines
        self.arms = {s: {'phase': 'ready', 'candidate': None, 'streak': 0, 'started': None, 'last_rep': -100}
                     for s in ('l', 'r')}
        self.last_arm_rep = (None, -100)

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

    def _result(self, valid, message, value=None):
        if self.exercise == 'pushups':
            calibrated = self.top_height is not None
        else:
            calibrated = self.phase != 'ready'
        return {'rep_count': self.count, 'state': self.phase, 'valid': valid,
                'feedback': message, 'angle': round(value) if value is not None else None,
                'view_mode': self.view_mode, 'calibrated': calibrated}

    @staticmethod
    def _usable(points, *names):
        return all(n in points and points[n].get('visibility', 0) >= .5
                   and 0 <= points[n]['x'] <= 1 and 0 <= points[n]['y'] <= 1 for n in names)

    def update(self, points, now, aspect=1):
        if self.last_valid is not None and now - self.last_valid > 1.5:
            self.reset_cycle()
        if self.last_seen is not None and now - self.last_seen > 1.5:
            self.reset_cycle()
        if self.started is not None and now - self.started > 15:
            self.reset_cycle()
        self.last_seen = now
        if self.exercise == 'pushups':
            return self._pushups(points, now, aspect)
        if self.exercise == 'squats':
            return self._squats(points, now, aspect)
        return self._curls(points, now, aspect)

    # ------------------------------------------------------------ shared

    def _advance(self, pose, now, value, message):
        p = self.p
        if pose == 'middle':
            self.candidate = None; self.streak = 0
            return self._result(True, 'Lower with control, then extend fully.' if self.exercise != 'bicep_curls'
                                else 'Curl all the way up, then lower to straight arms.', value)
        if self.candidate == pose: self.streak += 1
        else: self.candidate, self.streak = pose, 1
        if self.streak >= p['streak']:
            if pose == 'up':
                if (self.phase == 'down' and self.started is not None and now - self.started >= p['min_descent_s']
                        and now - self.last_rep >= p['min_gap_s']):
                    self.count += 1; self.last_rep = now
                self.phase = 'up'; self.started = None
            elif self.phase == 'up':
                self.phase = 'down'; self.started = now
        return self._result(True, message(), value)

    # ------------------------------------------------------------ push-ups

    def _pushups(self, points, now, aspect):
        p = self.p
        usable = lambda *names: self._usable(points, *names)

        def lost(message):
            self.candidate = None; self.streak = 0
            if self.last_valid is None or now - self.last_valid > 1.2:
                self.phase = 'ready'; self.started = None
            return self._result(False, message)

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
            # Shoulder-to-wrist drop in arm lengths: unaffected by the user
            # shifting closer to or farther from the phone between reps.
            height = (wrist['y'] - shoulder['y']) / length
            if height < -.08: continue
            sides.append((min(points[n]['visibility'] for n in names), side, value, height))
        if not sides:
            if standing_detected:
                return lost('Body detected. Get into a side-on plank for push-ups; standing movements do not count.')
            return lost('Show one complete arm and your hips in a plank. A side-on view is recommended.')
        # Keep the same anatomical arm throughout a repetition.
        chosen = next((item for item in sides if item[1] == self.arm_side), None)
        if chosen is None and self.arm_side is not None and self.last_shoulder is not None:
            # In profile MediaPipe often swaps the left/right labels of the near
            # arm. Same horizontal shoulder position => same arm (the shoulder
            # moves vertically during the rep), so relabel instead of discarding
            # the calibration and the rep in progress. Head-on, the two
            # shoulders sit a shoulder-width apart and are not confused.
            near = [item for item in sides if abs(
                points[f'shoulder_{item[1]}']['x'] - self.last_shoulder[0]) * aspect <= self.p['relabel_dist']]
            if near:
                chosen = max(near); self.arm_side = chosen[1]
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
        self.last_shoulder = (shoulder['x'], shoulder['y'])
        torso_x = abs(shoulder['x']-hip['x']) * aspect
        shoulder_width = abs(points['shoulder_l']['x'] - points['shoulder_r']['x']) * aspect if usable('shoulder_l', 'shoulder_r') else 0
        self.view_mode = 'side' if torso_x > .08 and (not shoulder_width or shoulder_width < torso_x * 2) else 'head_on'
        if value >= p['up_angle'] and height > .15 and (self.top_height is None or height >= self.top_height * p['top_ratio']):
            pose = 'up'
            if self.top_height is None:
                self.top_samples.append(height)
                n = int(p['calib_frames'])
                if len(self.top_samples) >= n:
                    self.top_height = sum(self.top_samples[-n:]) / n
                    self.phase = 'up'; self.candidate = 'up'; self.streak = 2
            elif self.phase != 'down': self.top_height = .98 * self.top_height + .02 * height
        elif self.top_height is not None and value <= p['down_angle'] and height < self.top_height * p['bottom_ratio']:
            pose = 'down'
        else: pose = 'middle'
        if self.top_height is None:
            if pose != 'up': self.top_samples = []
            return self._result(True, 'Hold a straight-arm plank to calibrate. Side-on works best; keep the phone fixed.', value)
        return self._advance(pose, now, value, lambda: (
            'Head-on depth is unreliable. Turn side-on for reliable counting.' if self.view_mode == 'head_on'
            else 'Push back to straight arms.' if self.phase == 'down'
            else 'Ready. Lower fully and return to the top.'))

    # ------------------------------------------------------------ squats

    def _squats(self, points, now, aspect):
        p = self.p
        sides = []
        for side in ('l', 'r'):
            names = [f'{j}_{side}' for j in ('hip', 'knee', 'ankle')]
            if not self._usable(points, *names): continue
            hip, knee, ankle = [{**points[n], 'x': points[n]['x'] * aspect} for n in names]
            a = angle(hip, knee, ankle)
            leg = math.hypot(hip['x']-knee['x'], hip['y']-knee['y']) + math.hypot(knee['x']-ankle['x'], knee['y']-ankle['y'])
            if a is None or leg < .08: continue
            # Upright gate: lying/plank bodies (push-ups, crunches) are not squats.
            shoulder = points.get(f'shoulder_{side}')
            if shoulder and shoulder.get('visibility', 0) >= .5:
                dx = abs(shoulder['x'] - points[f'hip_{side}']['x']) * aspect
                if points[f'hip_{side}']['y'] - shoulder['y'] < max(.05, dx * .8):
                    continue
            sides.append((a, points[f'hip_{side}']['y'], leg))
        if not sides:
            self.candidate = None; self.streak = 0
            if self.last_valid is None or now - self.last_valid > 1.2:
                self.phase = 'ready'; self.started = None
            return self._result(False, 'Stand upright with hips, knees and ankles fully visible.')
        self.last_valid = now
        value = sum(s[0] for s in sides) / len(sides)
        hip_y = sum(s[1] for s in sides) / len(sides)
        leg = max(s[2] for s in sides)
        if value >= p['up_angle']:
            # Standing: (re)calibrate the reference hip height and leg length.
            if self.top_hip is None or self.phase != 'down':
                self.top_hip = hip_y if self.top_hip is None else .8 * self.top_hip + .2 * hip_y
                self.leg_length = leg if self.leg_length is None else max(.9 * self.leg_length, .8 * self.leg_length + .2 * leg)
        drop = (hip_y - self.top_hip) / self.leg_length if self.top_hip is not None and self.leg_length else 0
        if value <= p['down_angle'] or (self.top_hip is not None and drop >= p['drop_down']):
            pose = 'down'
        elif value >= p['up_angle'] and drop <= p['drop_up']:
            pose = 'up'
        else:
            pose = 'middle'
        return self._advance(pose, now, value, lambda: (
            'Drive up to standing.' if self.phase == 'down' else 'Ready. Squat down, then stand tall.'))

    # ------------------------------------------------------------ curls

    def _curls(self, points, now, aspect):
        p = self.p
        seen = []
        blocked = False
        moving = False
        hips = [s for s in ('l', 'r') if self._usable(points, f'hip_{s}', f'shoulder_{s}')]
        if hips:
            hip_y = sum(points[f'hip_{s}']['y'] for s in hips) / len(hips)
            torso = sum(abs(points[f'hip_{s}']['y'] - points[f'shoulder_{s}']['y']) for s in hips) / len(hips)
            self.hip_track = [(t, y, tl) for t, y, tl in self.hip_track if now - t <= 1.2] + [(now, hip_y, torso)]
            ys = [y for _, y, _ in self.hip_track]
            scale = max(.05, max(tl for _, _, tl in self.hip_track))
            moving = (max(ys) - min(ys)) / scale > p['max_hip_motion']
        for side in ('l', 'r'):
            names = [f'{j}_{side}' for j in ('shoulder', 'elbow', 'wrist')]
            if not self._usable(points, *names): continue
            s, e, w = [{**points[n], 'x': points[n]['x'] * aspect} for n in names]
            a = angle(s, e, w)
            upper = math.hypot(s['x']-e['x'], s['y']-e['y'])
            if a is None or upper < .03: continue
            # Elbow must hang below the shoulder (rejects presses and pull-ups).
            if e['y'] - s['y'] < p['hang_ratio'] * upper or moving:
                blocked = True; continue
            forearm = math.hypot(e['x']-w['x'], e['y']-w['y'])
            seen.append((side, a, (e['y'] - w['y']) / max(forearm, 1e-6)))
        if not seen:
            for arm in self.arms.values():
                arm['candidate'] = None; arm['streak'] = 0
            if self.last_valid is None or now - self.last_valid > 1.2:
                self.phase = 'ready'
                for arm in self.arms.values(): arm['phase'] = 'ready'; arm['started'] = None
            return self._result(False, ('Keep your hips still; only your forearms should move.' if moving
                                        else 'Keep your elbows down by your sides for curls.') if blocked
                                else 'Keep your shoulder, elbow and wrist fully visible.')
        self.last_valid = now
        for side, a, rise in seen:
            arm = self.arms[side]
            pose = ('up' if a >= p['up_angle'] else
                    'down' if a <= p['down_angle'] and rise >= p['wrist_rise'] else 'middle')
            if pose == 'middle':
                arm['candidate'] = None; arm['streak'] = 0; continue
            if arm['candidate'] == pose: arm['streak'] += 1
            else: arm['candidate'], arm['streak'] = pose, 1
            if arm['streak'] < p['streak']: continue
            if pose == 'up':
                if (arm['phase'] == 'down' and arm['started'] is not None and now - arm['started'] >= p['min_descent_s']
                        and now - arm['last_rep'] >= p['min_gap_s']):
                    arm['last_rep'] = now
                    other, when = self.last_arm_rep
                    if not (other is not None and other != side and now - when <= p['merge_s']):
                        self.count += 1; self.last_rep = now
                    self.last_arm_rep = (side, now)
                arm['phase'] = 'up'; arm['started'] = None
            elif arm['phase'] == 'up':
                arm['phase'] = 'down'; arm['started'] = now
        phases = [self.arms[s]['phase'] for s, _, _ in seen]
        self.phase = 'down' if 'down' in phases else 'up' if 'up' in phases else 'ready'
        value = min(a for _, a, _ in seen)
        if self.phase == 'ready':
            msg = 'Start with straight arms, elbows by your sides.'
        elif self.phase == 'down':
            msg = 'Lower all the way to straight arms.'
        else:
            msg = 'Ready. Curl up, then lower fully.'
        return self._result(True, msg, value)
