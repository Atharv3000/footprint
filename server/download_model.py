"""Install Google's MediaPipe Pose Landmarker Full model for the rep counter and photo checks.

Tries the official download first. If storage.googleapis.com is unreachable,
it assembles the same Google weights from the pose .tflite files that ship
inside the mediapipe 0.10.x wheel (needs mediapipe <= 0.10.21 for the metadata
writer); otherwise it prints how to fetch the file manually.
"""
import hashlib
import sys
from pathlib import Path
from urllib.request import urlopen

URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'


def main():
    target = Path(__file__).parent / 'models' / 'pose_landmarker_full.task'
    target.parent.mkdir(exist_ok=True)
    if target.exists():
        print('Pose model already exists:', target); return
    try:
        with urlopen(URL, timeout=60) as response:
            data = response.read(12_000_000)
        if not data.startswith(b'\x00\x00PK') and b'PK\x03\x04' not in data[:16]:
            raise RuntimeError('Model download was not a MediaPipe task archive.')
        temporary = target.with_suffix('.download'); temporary.write_bytes(data); temporary.replace(target)
        print('Downloaded official Pose Landmarker Full; SHA-256:', hashlib.sha256(data).hexdigest())
        return
    except Exception as exc:  # noqa: BLE001
        print('Download failed (%s); building from the mediapipe wheel instead...' % exc)
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from footprint_ai.pose import build_task_from_wheel
        build_task_from_wheel(target)
        print('Built Pose Landmarker Full from the mediapipe wheel:', target)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f'Could not install the pose model ({exc}). Download {URL} manually to {target}.')


if __name__ == '__main__':
    main()
