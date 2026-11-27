import base64
import io
import os
import queue
from pathlib import Path

import mediapipe as mp
import numpy as np
from PIL import Image, ImageOps
from .pose_geometry import arm_quality, preferred_rotation, restore_point

NAMES = {0: 'nose', 11: 'shoulder_l', 12: 'shoulder_r', 13: 'elbow_l', 14: 'elbow_r',
         15: 'wrist_l', 16: 'wrist_r', 23: 'hip_l', 24: 'hip_r', 25: 'knee_l', 26: 'knee_r',
         27: 'ankle_l', 28: 'ankle_r'}


class Vision:
    def __init__(self, path):
        if not Path(path).is_file(): raise RuntimeError('Run python -m server.download_model to install the Full pose checkpoint.')
        # A small pool of detectors so several users' frames are analysed in
        # parallel instead of queueing behind one lock (each detector is not
        # thread-safe on its own). REP_POSE_WORKERS overrides the size.
        size = int(os.environ.get('REP_POSE_WORKERS', 0)) or min(2, os.cpu_count() or 1)
        self.pool = queue.Queue()
        self.detectors = [mp.tasks.vision.PoseLandmarker.create_from_options(
            mp.tasks.vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(path)),
                running_mode=mp.tasks.vision.RunningMode.IMAGE, num_poses=2,
                min_pose_detection_confidence=.55, min_pose_presence_confidence=.55)) for _ in range(max(1, size))]
        for detector in self.detectors: self.pool.put(detector)
        self.detections = 0  # pose-network runs, for benchmarks

    def _points(self, detector, rgb, rotation=0):
        self.detections += 1
        data = np.ascontiguousarray(np.rot90(rgb, rotation // 90)) if rotation else rgb
        result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=data))
        if len(result.pose_landmarks) != 1: return {}
        points = {}
        for i, name in NAMES.items():
            p = result.pose_landmarks[0][i]
            x, y = restore_point(p.x, p.y, rotation)
            points[name] = {'id': name, 'x': x, 'y': y, 'z': p.z, 'visibility': min(p.visibility, p.presence)}
        return points

    def _locate(self, detector, rgb, aspect, upright, track):
        """Pose in camera space. A lying body (push-ups) is re-detected with the
        image turned upright, which the pose network handles far better.

        ``track`` (one dict per user) remembers the rotation that worked last
        time. Users hold one position for a whole set, so trying that rotation
        first usually needs one network run per frame instead of two."""
        tried = {}
        hint = track.get('rotation') if track is not None and not upright else 0
        if hint:
            tried[hint] = self._points(detector, rgb, hint)
            if tried[hint] and preferred_rotation(tried[hint], aspect) == hint:
                return tried[hint], hint
        raw = self._points(detector, rgb)
        rotation = 0 if upright else preferred_rotation(raw, aspect)
        if rotation:
            rotated = tried[rotation] if rotation in tried else self._points(detector, rgb, rotation)
            return (rotated, rotation) if rotated else (raw, 0)
        if raw or upright:
            return raw, 0
        candidates = [(tried[a] if a in tried else self._points(detector, rgb, a), a) for a in (90, 270)]
        return max(candidates, key=lambda c: arm_quality(c[0]))

    def analyze(self, encoded, upright=False, include_preview=False, track=None):
        if not isinstance(encoded, str) or len(encoded) > 2_800_000:
            raise ValueError('Frame is too large. Use the low-resolution camera setting.')
        try:
            raw = base64.b64decode(encoded, validate=True)
            with Image.open(io.BytesIO(raw)) as source:
                if source.width * source.height > 25_000_000 or min(source.size) < 120:
                    raise ValueError('Unsupported camera image dimensions.')
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((640, 640))
        except Exception as error:
            raise ValueError('Invalid camera image.') from error
        rgb = np.asarray(image)
        detector = self.pool.get()
        try:
            points, rotation = self._locate(detector, rgb, image.width / image.height, upright, track)
        finally:
            self.pool.put(detector)
        if track is not None and points:
            track['rotation'] = rotation
        if not include_preview:
            return points, image.width / image.height, None
        # Relay only a normalized, reduced EXIF-stripped JPEG when explicit video consent is enabled.
        preview = image.copy(); preview.thumbnail((400, 400))
        stream = io.BytesIO(); preview.save(stream, format='JPEG', quality=48)
        return points, image.width / image.height, base64.b64encode(stream.getvalue()).decode()

    def close(self):
        for detector in self.detectors: detector.close()
