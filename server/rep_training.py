"""Fit and evaluate the rep counter's parameters against labelled exercise clips.

Pipeline
--------
1. ``python -m server.rep_training extract VIDEO... --cache DIR``
   decodes each clip through the app's real path (resize to 640px, JPEG q50,
   ``Vision.analyze``) and caches the landmarks at ~12 fps.
2. ``python -m server.rep_training fit --cache DIR``
   replays the cached landmarks through ``RepCounter`` under many simulated
   capture conditions (2-4.5 fps with timing jitter, landmark noise, dropped
   frames, mirrored bodies, faster/slower reps) and searches the counter's
   parameters to minimise count error on positive clips plus false reps on
   negative clips. It reports leave-one-clip-out error, then fits on all clips
   and writes ``server/training/rep_counter_params.json``.
3. ``python -m server.rep_training evaluate --cache DIR [--params FILE]``
   prints a per-clip table for any parameter file (or the built-in defaults).

The pose network itself (MediaPipe Pose Landmarker Full) is used unmodified;
what is learned here is the counting layer on top of it.
"""
import argparse
import copy
import json
import math
import random
import sys
import time
import zlib
from pathlib import Path

from .counter import DEFAULT_PARAMS, PARAMS_PATH, RepCounter

HERE = Path(__file__).parent
LABELS = HERE / 'training' / 'labels.json'
EXERCISES = ('pushups', 'squats', 'bicep_curls')

# Search space: (low, high, kind). Only these keys are tuned.
SPACE = {
    'pushups': {
        'up_angle': (135, 165, float), 'down_angle': (95, 130, float),
        'top_ratio': (.65, .9, float), 'bottom_ratio': (.5, .85, float),
        'min_descent_s': (.5, 1.0, float), 'min_gap_s': (.4, 1.0, float), 'relabel_dist': (.04, .2, float),
        'streak': (1, 2, int), 'calib_frames': (2, 3, int), 'stand_ratio': (.7, 1.6, float),
    },
    'squats': {
        'up_angle': (145, 170, float), 'down_angle': (95, 150, float),
        'drop_down': (.08, .35, float), 'drop_up': (.02, .12, float),
        'min_descent_s': (.3, 1.0, float), 'min_gap_s': (.4, 1.0, float), 'streak': (1, 2, int),
    },
    'bicep_curls': {
        'up_angle': (120, 165, float), 'down_angle': (40, 90, float),
        'hang_ratio': (.2, .8, float), 'merge_s': (.2, .9, float),
        'min_descent_s': (.2, .9, float), 'min_gap_s': (.4, 1.0, float), 'streak': (1, 2, int),
        'max_hip_motion': (.1, .6, float), 'wrist_rise': (-.2, .6, float),
    },
}


# ---------------------------------------------------------------- dataset

def load_clips(cache_dir, roles=('train',)):
    labels = json.loads(LABELS.read_text())
    cache_dir = Path(cache_dir)
    pos, neg = [], []
    for clip in labels['clips']:
        path = cache_dir / f"{clip['cache']}.json"
        if clip['role'] in roles and path.exists():
            pos.append({**clip, 'frames': json.loads(path.read_text())['frames']})
    for clip in labels['negatives']:
        path = cache_dir / f"{clip['cache']}.json"
        if path.exists():
            neg.append({**clip, 'frames': json.loads(path.read_text())['frames']})
    return pos, neg


# ---------------------------------------------------------------- augmentation

SWAP = {'l': 'r', 'r': 'l'}


def mirror(points):
    out = {}
    for name, p in points.items():
        if name[-2:] in ('_l', '_r'):
            name = name[:-1] + SWAP[name[-1]]
        out[name] = {**p, 'id': name, 'x': 1 - p['x']}
    return out


def scenario_frames(frames, rng, fps, stretch=1., noise=0., drop=0., flip=False, jitter=.25):
    """Resample cached frames the way the phone + server deliver them."""
    if not frames:
        return []
    times = [f['t'] for f in frames]
    out, t, end = [], times[0] + rng.random() / fps, times[-1]
    j = 0
    while t <= end:
        while j + 1 < len(times) and abs(times[j + 1] - t) <= abs(times[j] - t):
            j += 1
        frame = frames[j]
        points = frame['points']
        if flip:
            points = mirror(points)
        if noise:
            points = {n: {**p, 'x': p['x'] + rng.gauss(0, noise), 'y': p['y'] + rng.gauss(0, noise)}
                      for n, p in points.items()}
        if drop and rng.random() < drop:
            points = {}
        out.append(((t - times[0]) * stretch, points, frame['aspect']))
        t += max(.12, (1 / fps) * (1 + rng.uniform(-jitter, jitter)))
    return out


def scenarios(seed=0, n=10):
    rng = random.Random(seed)
    # The phone captures the next photo while the last one uploads, so good
    # connections now reach 5-6 fps; 2-3 fps is a slow network.
    base = [dict(fps=5), dict(fps=4), dict(fps=3), dict(fps=2.2)]
    extra = [dict(fps=rng.uniform(2, 6), stretch=rng.uniform(.75, 1.35), noise=rng.choice([0, .004, .008]),
                  drop=rng.choice([0, .05, .12]), flip=rng.random() < .5) for _ in range(n)]
    return [(i, s) for i, s in enumerate(base + extra)]


def replay(exercise, frames, params):
    counter = RepCounter(exercise, params=params)
    for now, points, aspect in frames:
        counter.update(points, now, aspect)
    return counter.count


# ---------------------------------------------------------------- objective

def _seed(*parts):
    # hash() of a string changes every run (PYTHONHASHSEED), which made scores irreproducible.
    return zlib.crc32(repr(parts).encode())


def evaluate(exercise, params, pos, neg, scen, seed=0):
    rows = []
    for clip in pos:
        if clip['exercise'] != exercise:
            continue
        counts = []
        for i, s in scen:
            rng = random.Random(_seed(seed, clip['cache'], i))
            counts.append(replay(exercise, scenario_frames(clip['frames'], rng, **s), params))
        rows.append({'clip': clip['cache'], 'expected': clip['expected'], 'counts': counts,
                     'mae': sum(abs(c - clip['expected']) for c in counts) / len(counts),
                     'exact': sum(c == clip['expected'] for c in counts) / len(counts)})
    false = []
    for clip in neg:
        if exercise not in clip['negative_for']:
            continue
        counts = []
        for i, s in scen[:4]:
            rng = random.Random(_seed(seed, clip['cache'], i, 'n'))
            counts.append(replay(exercise, scenario_frames(clip['frames'], rng, **s), params))
        false.append({'clip': clip['cache'], 'false_reps': sum(counts) / len(counts)})
    return rows, false


def loss(rows, false):
    # Relative count error on positives, plus a heavy penalty for phantom reps.
    pos = sum(r['mae'] / max(1, r['expected']) for r in rows) / max(1, len(rows))
    neg = sum(f['false_reps'] for f in false) / max(1, len(false))
    return pos + 1.5 * neg


# Hysteresis guards: a narrow gap between the "top" and "bottom" thresholds
# overfits a handful of clips and double-counts jitter on new users.
MIN_GAP = {'pushups': ('up_angle', 'down_angle', 20), 'squats': ('up_angle', 'down_angle', 15),
           'bicep_curls': ('up_angle', 'down_angle', 45)}
PRIOR_WEIGHT = .15


def feasible(exercise, cand):
    hi, lo, gap = MIN_GAP[exercise]
    if cand[hi] - cand[lo] < gap:
        return False
    if exercise == 'squats' and cand['drop_down'] - cand['drop_up'] < .06:
        return False
    if exercise == 'pushups' and cand['top_ratio'] - cand['bottom_ratio'] < .04:
        return False
    return True


def prior(exercise, cand):
    space = SPACE[exercise]
    return PRIOR_WEIGHT * sum(((cand[k] - DEFAULT_PARAMS[exercise][k]) / (hi - lo)) ** 2
                              for k, (lo, hi, _) in space.items()) / len(space)


def sample(space, rng, around=None, scale=1.):
    out = {}
    for key, (lo, hi, kind) in space.items():
        if around is None:
            v = rng.uniform(lo, hi)
        else:
            v = around[key] + rng.gauss(0, (hi - lo) * .15 * scale)
        v = min(hi, max(lo, v))
        out[key] = int(round(v)) if kind is int else round(v, 3)
    return out


def fit_exercise(exercise, pos, neg, iters=160, seed=0, log=None):
    """Random search then local refinement, with a prior toward the defaults."""
    rng = random.Random(seed)
    space = SPACE[exercise]
    scen = scenarios(seed, n=5)
    base = copy.deepcopy(DEFAULT_PARAMS)

    def score(cand):
        params = copy.deepcopy(base); params[exercise].update(cand)
        return loss(*evaluate(exercise, params, pos, neg, scen, seed)) + prior(exercise, cand)

    best_c = {k: base[exercise][k] for k in space}
    best = score(best_c)
    for it in range(iters):
        explore = it < iters * .35
        for _ in range(50):
            cand = sample(space, rng, None if explore else best_c, scale=1 - it / iters * .7)
            if feasible(exercise, cand): break
        else:
            continue
        s = score(cand)
        if s < best - 1e-9:
            best, best_c = s, cand
            if log: log(f'  {exercise} it={it} loss={best:.4f} {best_c}')
    return best_c, best


# ---------------------------------------------------------------- commands

def cmd_evaluate(args):
    params = json.loads(Path(args.params).read_text()) if args.params else copy.deepcopy(DEFAULT_PARAMS)
    pos, neg = load_clips(args.cache, roles=('train', 'test', 'hard'))
    scen = scenarios(args.seed)
    report = {}
    for ex in EXERCISES:
        rows, false = evaluate(ex, params, pos, neg, scen, args.seed)
        report[ex] = {'clips': rows, 'negatives': false, 'loss': loss(rows, false)}
        print(f'\n== {ex}')
        for r in rows:
            print(f"  {r['clip']:<18} expected {r['expected']}  mean {sum(r['counts'])/len(r['counts']):.2f}"
                  f"  MAE {r['mae']:.2f}  exact {r['exact']:.0%}  counts {r['counts']}")
        for f in false:
            print(f"  NEG {f['clip']:<14} phantom reps {f['false_reps']:.2f}")
    if args.output:
        Path(args.output).write_text(json.dumps(report, indent=1))
    return report


def _fit_one(job):
    ex, cache, iters, seed = job
    train, neg = load_clips(cache, roles=('train',))
    test, _ = load_clips(cache, roles=('test',))
    train = [c for c in train if c['exercise'] == ex]; test = [c for c in test if c['exercise'] == ex]
    report = {'exercise': ex, 'train_clips': [c['cache'] for c in train], 'test_clips': [c['cache'] for c in test]}
    final_scen = scenarios(seed + 1)

    def table(params, clips):
        rows, _ = evaluate(ex, params, clips, [], final_scen, seed + 1)
        return [{k: r[k] for k in ('clip', 'expected', 'mae', 'exact')} | {'mean': sum(r['counts']) / len(r['counts'])} for r in rows]

    if test:
        cand, _ = fit_exercise(ex, train, neg, iters, seed)
        tuned = copy.deepcopy(DEFAULT_PARAMS); tuned[ex].update(cand)
        report['held_out'] = {'protocol': 'fit on train clips only, scored on unseen test clips',
                              'fitted_on_train': cand, 'tuned': table(tuned, test), 'defaults': table(DEFAULT_PARAMS, test)}
    else:
        loo = []
        for held in train:
            cand, _ = fit_exercise(ex, [c for c in train if c is not held], neg, iters, seed)
            tuned = copy.deepcopy(DEFAULT_PARAMS); tuned[ex].update(cand)
            loo.append({'held_out': held['cache'], 'tuned': table(tuned, [held])[0], 'defaults': table(DEFAULT_PARAMS, [held])[0]})
        report['held_out'] = {'protocol': 'leave-one-clip-out (too few clips for a separate test split)', 'folds': loo}
    everything = train + test
    cand, best = fit_exercise(ex, everything, neg, iters, seed)
    report['final'] = cand; report['final_loss'] = best
    tuned = copy.deepcopy(DEFAULT_PARAMS); tuned[ex].update(cand)
    _, false = evaluate(ex, tuned, [], neg, final_scen, seed + 1)
    report['final_on_all_clips'] = table(tuned, everything)
    report['final_phantom_reps'] = {f['clip']: f['false_reps'] for f in false if f['false_reps']}
    return report


def _summarise(rows):
    if not rows: return 'n/a'
    return (f"MAE {sum(r['mae'] for r in rows)/len(rows):.2f} reps/clip, "
            f"exact {sum(r['exact'] for r in rows)/len(rows):.0%}")


def cmd_fit(args):
    from multiprocessing import Pool
    jobs = [(ex, args.cache, args.iters, args.seed) for ex in EXERCISES]
    with Pool(min(len(jobs), args.workers)) as pool:
        reports = pool.map(_fit_one, jobs)
    final = copy.deepcopy(DEFAULT_PARAMS)
    for rep in reports:
        ex = rep['exercise']; final[ex].update(rep['final'])
        print(f"\n### {ex}")
        h = rep['held_out']
        if 'tuned' in h:
            print(f"  held-out test ({len(rep['test_clips'])} clips): tuned {_summarise(h['tuned'])} | defaults {_summarise(h['defaults'])}")
        else:
            print(f"  leave-one-out: tuned {_summarise([f['tuned'] for f in h['folds']])} | defaults {_summarise([f['defaults'] for f in h['folds']])}")
        print(f"  final params: {rep['final']}")
        print(f"  phantom reps on negatives: {rep['final_phantom_reps'] or 'none'}")
    final['_meta'] = {'trained_at': time.strftime('%Y-%m-%d'), 'iters': args.iters, 'seed': args.seed,
                      'note': 'Counting-layer parameters fitted by server.rep_training; pose network unchanged.'}
    out = Path(args.output or PARAMS_PATH)
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(final, indent=2))
    out.with_name('rep_counter_report.json').write_text(json.dumps(reports, indent=1))
    print('\nwrote', out)


def cmd_extract(args):
    import base64
    import cv2
    from .vision import Vision
    vision = Vision(args.model)
    cache = Path(args.cache); cache.mkdir(parents=True, exist_ok=True)
    try:
        for video in args.videos:
            cap = cv2.VideoCapture(str(video)); fps = cap.get(cv2.CAP_PROP_FPS)
            if not cap.isOpened() or fps <= 0:
                print('skip', video); continue
            step = max(1, round(fps / 12)); frames = []; i = 0
            # One track per clip, like one per user in the app (see Vision._locate).
            track = None if args.no_track else {}
            runs, spent = vision.detections, 0.0
            while True:
                ok, bgr = cap.read()
                if not ok: break
                if i % step == 0:
                    h, w = bgr.shape[:2]; s = min(1, 640 / max(h, w))
                    small = cv2.resize(bgr, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
                    ok, jpg = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 50])
                    started = time.perf_counter()
                    points, aspect, _ = vision.analyze(base64.b64encode(jpg).decode(), track=track)
                    spent += time.perf_counter() - started
                    frames.append({'t': i / fps, 'aspect': aspect, 'points': points})
                i += 1
            cap.release()
            name = Path(video).stem.replace(' ', '_')
            (cache / f'{name}.json').write_text(json.dumps({'video': Path(video).name, 'fps': fps / step, 'frames': frames}))
            n = max(1, len(frames))
            print(name, len(frames), 'frames', f'{1000 * spent / n:.1f} ms/frame',
                  f'{(vision.detections - runs) / n:.2f} pose runs/frame', flush=True)
    finally:
        vision.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('extract'); e.add_argument('videos', nargs='+', type=Path)
    e.add_argument('--cache', required=True); e.add_argument('--model', default=str(HERE / 'models/pose_landmarker_full.task'))
    e.add_argument('--no-track', action='store_true', help='re-detect rotation on every frame (the pre-2026-11-26 path)')
    f = sub.add_parser('fit'); f.add_argument('--cache', required=True); f.add_argument('--iters', type=int, default=160)
    f.add_argument('--seed', type=int, default=0); f.add_argument('--output'); f.add_argument('--workers', type=int, default=2)
    v = sub.add_parser('evaluate'); v.add_argument('--cache', required=True); v.add_argument('--params')
    v.add_argument('--seed', type=int, default=7); v.add_argument('--output')
    args = parser.parse_args(argv)
    {'extract': cmd_extract, 'fit': cmd_fit, 'evaluate': cmd_evaluate}[args.cmd](args)


if __name__ == '__main__':
    sys.exit(main())
