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
STORYBOARD = (
    'storyboard-01-flower-field-v6', 'storyboard-01-flower-field-v6-mobile',
    'storyboard-02-wreath-action-v6', 'storyboard-02-wreath-action-v6-mobile',
    'storyboard-03-plum-action-v6', 'storyboard-03-plum-action-v6-mobile',
    'storyboard-04-turn-back-v6', 'storyboard-04-turn-back-v6-mobile',
    'storyboard-05-lakeside-linger-v6', 'storyboard-05-lakeside-linger-v6-mobile',
    'storyboard-06-walk-home-v6', 'storyboard-06-walk-home-v6-mobile',
)
PORTRAITS = ('tang', 'he', 'xi')
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
    for variant in ('v5', 'mobile-v5'):
        source = master(f'{scene}-{variant}')
        with Image.open(source) as image:
            save_web(image, f'{scene}-{variant}.webp', source)

for stem in STORYBOARD:
    source = master(stem)
    with Image.open(source) as image:
        save_web(image, f'{stem}.webp', source)

for person in PORTRAITS:
    source = master(f'portrait-{person}-v6')
    with Image.open(source) as image:
        save_web(image, f'portrait-{person}-v6.webp', source)

(ROOT / 'assets' / 'web-manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Prepared {len(records)} approved web assets; total {sum((DEST / r["file"]).stat().st_size for r in records) / 1024:.0f} KiB')
