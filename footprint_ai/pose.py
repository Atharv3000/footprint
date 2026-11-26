"""MediaPipe Pose Landmarker (Full) for still photos, with a self-contained model fallback.

Model lookup order:
1. $FOOTPRINT_POSE_MODEL
2. footprint_ai/models/pose_landmarker_full.task
3. server/models/pose_landmarker_full.task (what `python -m server.download_model` fetches)
4. Build one from the pose .tflite files that ship inside the mediapipe 0.10.x wheel
   (same Google weights; used when storage.googleapis.com is unreachable).
"""
from __future__ import annotations

import os
import threading
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
NAMES = {0: 'nose', 11: 'shoulder_l', 12: 'shoulder_r', 13: 'elbow_l', 14: 'elbow_r', 15: 'wrist_l', 16: 'wrist_r',
         23: 'hip_l', 24: 'hip_r', 25: 'knee_l', 26: 'knee_r', 27: 'ankle_l', 28: 'ankle_r'}


def build_task_from_wheel(target: Path) -> Path:
    import mediapipe as mp
    from mediapipe.tasks.python.metadata.metadata_writers import metadata_writer as mw
    base = Path(mp.__file__).parent / 'modules'

    def meta(src: Path, name: str, mean: float, std: float) -> bytes:
        w = mw.MetadataWriter.create(src.read_bytes()).add_general_info(name, '')
        w.add_image_input(norm_mean=[mean], norm_std=[std])
        return w.populate()[0]
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix('.tmp')
    with zipfile.ZipFile(tmp, 'w') as z:
        z.writestr('pose_detector.tflite', meta(base / 'pose_detection' / 'pose_detection.tflite', 'pose_detector', 127.5, 127.5))
        z.writestr('pose_landmarks_detector.tflite', meta(base / 'pose_landmark' / 'pose_landmark_full.tflite', 'pose_landmarks_detector', 0.0, 255.0))
    tmp.replace(target)
    return target


def model_path() -> Path:
    env = os.environ.get('FOOTPRINT_POSE_MODEL')
    candidates = [Path(env)] if env else []
    candidates += [HERE / 'models' / 'pose_landmarker_full.task', HERE.parent / 'server' / 'models' / 'pose_landmarker_full.task']
    for c in candidates:
        if c.is_file():
            return c
    return build_task_from_wheel(HERE / 'models' / 'pose_landmarker_full.task')


class PoseDetector:
    def __init__(self):
        import mediapipe as mp
        self.mp = mp
        self.det = mp.tasks.vision.PoseLandmarker.create_from_options(mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path())),
            running_mode=mp.tasks.vision.RunningMode.IMAGE, num_poses=2,
            min_pose_detection_confidence=.5, min_pose_presence_confidence=.5))
        self.lock = threading.Lock()

    def detect(self, rgb: np.ndarray) -> tuple[dict, int]:
        """Landmarks of the most prominent person (normalised x/y) and the number of people found."""
        with self.lock:
            res = self.det.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        people = res.pose_landmarks
        if not people:
            return {}, 0

        def area(lms):
            xs = [p.x for p in lms]; ys = [p.y for p in lms]
            return (max(xs) - min(xs)) * (max(ys) - min(ys))
        best = max(people, key=area)
        pts = {name: {'x': best[i].x, 'y': best[i].y, 'visibility': min(best[i].visibility, best[i].presence)}
               for i, name in NAMES.items()}
        return pts, len(people)


@lru_cache(maxsize=1)
def detector() -> PoseDetector:
    return PoseDetector()
