"""Replay authorized local video through the actual JPEG / detector / counter path."""
import argparse
import base64
import hashlib
import json
import time
from collections import Counter
from pathlib import Path

import cv2

from .counter import RepCounter
from .vision import Vision


def replay(video, vision, fps=4, expected=None, jpeg_quality=50):
    cap = cv2.VideoCapture(str(video))
    source_fps = cap.get(cv2.CAP_PROP_FPS)
    if not cap.isOpened() or source_fps <= 0: raise ValueError('Video could not be opened.')
    step = max(1, round(source_fps / fps)); counter = RepCounter()
    index = 0; valid = 0; seen = 0; elapsed = 0; trace = []; views = Counter()
    try:
        while True:
            ok, bgr = cap.read()
            if not ok: break
            timestamp = index / source_fps; process = index % step == 0; index += 1
            if not process: continue
            height, width = bgr.shape[:2]; scale = min(1, 640 / max(width, height))
            reduced = cv2.resize(bgr, (round(width * scale), round(height * scale)))
            ok, jpeg = cv2.imencode('.jpg', reduced, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
            if not ok: raise ValueError('Could not encode sampled frame.')
            started = time.perf_counter()
            points, aspect, _ = vision.analyze(base64.b64encode(jpeg).decode())
            elapsed += time.perf_counter() - started
            result = counter.update(points, timestamp, aspect)
            seen += 1; valid += result['valid']; views[result['view_mode'] or 'unknown'] += 1
            trace.append({'time_s': round(timestamp, 3), **result})
    finally: cap.release()
    return {'video': str(video), 'sha256': hashlib.sha256(Path(video).read_bytes()).hexdigest(),
            'expected_reps': expected, 'counted_reps': counter.count,
            'signed_error': counter.count - expected if expected is not None else None,
            'requested_fps': fps, 'sampled_fps': source_fps / step, 'jpeg_quality': jpeg_quality,
            'sampled_frames': seen, 'valid_frames': valid, 'views': dict(views),
            'mean_inference_ms': round(elapsed * 1000 / max(1, seen), 2), 'trace': trace}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--model', type=Path, default=Path(__file__).parent / 'models/pose_landmarker_full.task')
    parser.add_argument('--fps', type=float, default=4)
    parser.add_argument('--expected', type=int)
    parser.add_argument('--jpeg-quality', type=int, default=50)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if not .5 <= args.fps <= 30 or not 1 <= args.jpeg_quality <= 100: parser.error('Invalid sampling or JPEG quality.')
    detector = Vision(args.model)
    try: result = replay(args.video, detector, args.fps, args.expected, args.jpeg_quality)
    finally: detector.close()
    if args.output: args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'trace'}, indent=2))


if __name__ == '__main__': main()
