"""Make web copies and character portraits from the approved generated masters."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'generated'
DEST = ROOT / 'public' / 'assets' / 'generated'
DEST.mkdir(parents=True, exist_ok=True)
SCENES = ('flower-field', 'wreath-garden', 'plum-forest', 'dusk-lake')
records = []


def master(stem):
    matches = [p for p in SOURCE.glob(stem + '.*') if p.suffix.lower() in ('.png', '.jpg', '.webp')]
    if len(matches) != 1:
        raise RuntimeError(f'Expected one master for {stem}, found {len(matches)}')
    return matches[0]


def save_web(image, name, source, crop=None):
    target = DEST / name
    image = ImageOps.exif_transpose(image).convert('RGB')
    image.save(target, 'WEBP', quality=91, method=6)
    records.append({'file': name, 'source': str(source.relative_to(ROOT)).replace('\\', '/'),
                    'size': image.size, 'crop': crop,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})


for scene in SCENES:
    for variant in ('v4', 'mobile-v4'):
        source = master(f'{scene}-{variant}')
        with Image.open(source) as image:
            save_web(image, f'{scene}-{variant}.webp', source)

source = master('flower-field-v4')
with Image.open(source) as image:
    # Manually reviewed face crops from this approved 1536 x 1024 master.
    for person, box in {'tang': (510, 135, 880, 505), 'he': (795, 170, 1135, 510),
                        'xi': (1136, 0, 1536, 400)}.items():
        portrait = image.crop(box).resize((384, 384), Image.Resampling.LANCZOS)
        save_web(portrait, f'portrait-{person}-v4.webp', source, box)

(ROOT / 'assets' / 'web-manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Prepared {len(records)} approved web assets; total {sum((DEST / r["file"]).stat().st_size for r in records) / 1024:.0f} KiB')
