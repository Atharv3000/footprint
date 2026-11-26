"""Extract AIY food-model embeddings + softmax for all of Food-101 (101 dishes x 1,000 photos).

Food-101 (Bossard et al., ECCV 2014): http://data.vision.ee.ethz.ch/cvl/food-101.tar.gz (5 GB).
Uses the dataset's official split (meta/train.txt: 75,750 / meta/test.txt: 25,250).
Usage: python -m footprint_ai.training.extract_food101 <food-101 folder> <out.npz> [--workers 4]
"""
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

ROOT = None


def _init(root):
    global ROOT, M
    ROOT = Path(root)
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from footprint_ai.food_model import FoodModel
    M = FoodModel()
    M.it  # noqa: B018 - interpreter created per worker


def _run(key):
    from PIL import Image
    try:
        img = Image.open(ROOT / 'images' / f'{key}.jpg')
        e, p = M.run_tta(img)
        # keep the top of the AIY softmax only (full 2,024-way softmax x 101k photos would be ~800 MB)
        top = np.argsort(-p)[:20]
        return key, e.astype(np.float16), top.astype(np.int16), p[top].astype(np.float16)
    except Exception as exc:  # noqa: BLE001
        print('skip', key, exc, flush=True)
        return key, None, None, None


def main(root, out, workers=4):
    root = Path(root)
    keys, split = [], []
    for name in ('train', 'test'):
        for line in (root / 'meta' / f'{name}.txt').read_text().split():
            keys.append(line); split.append(name)
    t0 = time.time()
    res = {}
    with Pool(workers, initializer=_init, initargs=(str(root),)) as pool:
        for i, (k, e, ti, tp) in enumerate(pool.imap_unordered(_run, keys, chunksize=64)):
            if e is not None:
                res[k] = (e, ti, tp)
            if i % 5000 == 0:
                print(f'{i}/{len(keys)}  {time.time() - t0:.0f}s', flush=True)
    ok = [i for i, k in enumerate(keys) if k in res]
    np.savez_compressed(out, emb=np.stack([res[keys[i]][0] for i in ok]), top_idx=np.stack([res[keys[i]][1] for i in ok]),
                        top_p=np.stack([res[keys[i]][2] for i in ok]), label=np.array([keys[i].split('/')[0] for i in ok]),
                        split=np.array([split[i] for i in ok]), key=np.array([keys[i] for i in ok]))
    print('saved', len(ok), 'of', len(keys), f'in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    w = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 4
    main(sys.argv[1], sys.argv[2], w)
