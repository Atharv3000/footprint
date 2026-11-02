"""Download Google's unmodified pretrained MediaPipe Pose Landmarker Full."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'


def main():
    target = Path(__file__).parent / 'models' / 'pose_landmarker_full.task'
    target.parent.mkdir(exist_ok=True)
    if target.exists():
        print('Pose model already exists.'); return
    with urlopen(URL, timeout=60) as response:
        data = response.read(12_000_000)
    if not data.startswith(b'\x00\x00PK') and b'PK\x03\x04' not in data[:16]:
        raise RuntimeError('Model download was not a MediaPipe task archive.')
    temporary = target.with_suffix('.download'); temporary.write_bytes(data); temporary.replace(target)
    print('Downloaded official Pose Lite model; SHA-256:', hashlib.sha256(data).hexdigest())


if __name__ == '__main__': main()
