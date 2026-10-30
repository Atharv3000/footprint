import base64
import io
import threading
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
        self.lock = threading.Lock()
        self.detector = mp.tasks.vision.PoseLandmarker.create_from_options(
            mp.tasks.vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(path)),
                running_mode=mp.tasks.vision.RunningMode.IMAGE, num_poses=2,
                min_pose_detection_confidence=.55, min_pose_presence_confidence=.55))

    def _points(self, rgb, rotation=0):
        data = np.ascontiguousarray(np.rot90(rgb, rotation // 90)) if rotation else rgb
        result = self.detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=data))
        if len(result.pose_landmarks) != 1: return {}
        points = {}
        for i, name in NAMES.items():
            p = result.pose_landmarks[0][i]
            x, y = restore_point(p.x, p.y, rotation)
            points[name] = {'id': name, 'x': x, 'y': y, 'visibility': min(p.visibility, p.presence)}
        return points

    def analyze(self, encoded):
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
        with self.lock:
            rgb = np.asarray(image)
            raw_points = self._points(rgb)
            rotation = preferred_rotation(raw_points, image.width / image.height)
            points = (self._points(rgb, rotation) or raw_points) if rotation else raw_points
            if not raw_points:
                candidates = [self._points(rgb, angle) for angle in (90, 270)]
                points = max(candidates, key=arm_quality)
        # Relay the normalized, reduced JPEG, never an EXIF-bearing original.
        preview = image.copy(); preview.thumbnail((400, 400))
        stream = io.BytesIO(); preview.save(stream, format='JPEG', quality=48)
        return points, image.width / image.height, base64.b64encode(stream.getvalue()).decode()

    def close(self):
        self.detector.close()
