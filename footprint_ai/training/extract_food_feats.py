import os
"""Extract AIY embeddings + softmax for labelled food photos and non-food images."""
import glob, hashlib, json, os, sys, random
import numpy as np
sys.path.insert(0, '.')
from PIL import Image
from footprint_ai.food_model import model
import cv2
items = []  # (path_or_key, label, split, source)
seen = set()
def add(path, label, split, source):
    h = hashlib.md5(open(path, 'rb').read()).hexdigest()
    if h in seen: return
    seen.add(h); items.append((path, label, split, source))
# Food-101 pizza/steak/sushi (both zips; dedupe by content)
for z in ('pss', 'pss20'):
    for split in ('train', 'test'):
        for p in glob.glob(fos.environ.get('FOOD_DATA', 'data_cache') + '/{z}/{split}/*/*.jpg'):
            add(p, p.split('/')[-2], split, 'food101:' + z)
# food_mnist: use its own test list
fm = os.environ.get('FOOD_SRC', 'sources') + '/food_mnist'
test = json.load(open(f'{fm}/meta/test.json')) if os.path.exists(f'{fm}/meta/test.json') else {}
test_ids = {f'{c}/{i.split("/")[-1]}' for c, ids in test.items() for i in ids}
for p in glob.glob(f'{fm}/images/*/*.jpg'):
    key = '/'.join(p.split('/')[-2:])[:-4]
    add(p, p.split('/')[-2], 'test' if key in test_ids else 'train', 'food_mnist')
print('food images', len(items), 'test ids', len(test_ids))
# negatives: opencv samples (minus food pictures), exercise video frames, people
for p in glob.glob(os.environ.get('FOOD_SRC', 'sources') + '/ocv/samples/data/*'):
    if os.path.basename(p).lower().startswith(('fruits', 'orange', 'apple')): continue
    add(p, '__nonfood__', 'train' if random.Random(p).random() < .6 else 'test', 'opencv')
frames_dir = os.environ.get('FOOD_DATA', 'data_cache') + '/neg_frames'; os.makedirs(frames_dir, exist_ok=True)
vids = glob.glob(os.environ.get('VIDEO_SRC', 'videos') + '/pt/videos/*.mp4') + glob.glob(os.environ.get('VIDEO_SRC', 'videos') + '/extra/*.mp4') + glob.glob(os.environ.get('VIDEO_SRC', 'videos') + '/vv/*')
for v in vids:
    if 'fraud' in v: continue  # food video
    cap = cv2.VideoCapture(v); n = int(cap.get(7)) or 1
    for k in range(6):
        cap.set(1, int(n * (k + .5) / 6)); ok, f = cap.read()
        if not ok: continue
        out = f'{frames_dir}/{os.path.basename(v)}_{k}.jpg'; cv2.imwrite(out, f)
        add(out, '__nonfood__', 'train' if random.Random(v).random() < .6 else 'test', 'exercise_video')
# the food video as food positives (unlabelled dish -> only used for the food/non-food gate)
cap = cv2.VideoCapture(os.environ.get('VIDEO_SRC', 'videos') + '/pt/videos/fraud.mp4'); n = int(cap.get(7))
for k in range(8):
    cap.set(1, int(n * (k + .5) / 8)); ok, f = cap.read()
    out = f'{frames_dir}/fraudfood_{k}.jpg'; cv2.imwrite(out, f); add(out, '__food_unlabelled__', 'test', 'food_video')
print('total', len(items))
m = model(); E, P = [], []
for i, (p, *_) in enumerate(items):
    img = Image.open(p)
    e, pr = m.run_tta(img)
    E.append(e); P.append(pr)
    if i % 500 == 0: print(i, flush=True)
np.savez_compressed(os.environ.get('FOOD_DATA', 'data_cache') + '/food_feats.npz', emb=np.array(E), prob=np.array(P),
                    label=np.array([x[1] for x in items]), split=np.array([x[2] for x in items]),
                    source=np.array([x[3] for x in items]), path=np.array([x[0] for x in items]))
print('saved')
