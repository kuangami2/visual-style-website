"""Make web copies and character portraits from the approved generated masters.

The default command only writes the approved derivatives. Pass ``--clean`` to
remove stale derivatives from the known asset families after preparation.
"""
import argparse
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
DERIVED_EXTENSIONS = {'.webp', '.jpg'}
FAMILY_PREFIXES = tuple(
    [f'{scene}-' for scene in SCENES]
    + [f'storyboard-{index:02d}-' for index in range(1, 7)]
    + [f'portrait-{person}-' for person in PORTRAITS]
)
records = []
expected_files = set()


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--clean', action='store_true',
        help='remove stale WebP/JPEG derivatives from known generated asset families',
    )
    return parser.parse_args()


def master(stem):
    matches = [p for p in SOURCE.glob(stem + '.*') if p.suffix.lower() in ('.png', '.jpg', '.webp')]
    if len(matches) != 1:
        raise RuntimeError(f'Expected one master for {stem}, found {len(matches)}')
    return matches[0]


def save_web(image, name, source, crop=None):
    target = DEST / name
    image = ImageOps.exif_transpose(image).convert('RGB')
    image.save(target, 'WEBP', quality=91, method=6)
    # Display derivatives are separate from full-resolution export assets.
    for variant, edge, quality in (('screen', 1280, 76), ('thumb', 480, 72)):
        preview = image.copy()
        preview.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        stem = Path(name).stem + '-' + variant
        preview.save(DEST / (stem + '.webp'), 'WEBP', quality=quality, method=6)
        preview.save(DEST / (stem + '.jpg'), 'JPEG', quality=quality, optimize=True, progressive=True)
        expected_files.update({f'{stem}.webp', f'{stem}.jpg'})
    expected_files.add(name)
    records.append({'file': name, 'source': str(source.relative_to(ROOT)).replace('\\', '/'),
                    'size': image.size, 'crop': crop,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})


args = parse_args()

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


def is_safe_stale_candidate(path):
    """Only classify files produced by this script's known asset families."""
    if path.suffix.lower() not in DERIVED_EXTENSIONS:
        return False
    return path.name.startswith(FAMILY_PREFIXES)


stale = [
    path for path in DEST.iterdir()
    if path.is_file() and is_safe_stale_candidate(path) and path.name not in expected_files
]
if stale and args.clean:
    for path in stale:
        path.unlink()
    print(f'Cleaned {len(stale)} stale derived asset{"s" if len(stale) != 1 else ""}.')
elif stale:
    print(f'Found {len(stale)} stale derived asset{"s" if len(stale) != 1 else ""}; rerun with --clean to remove.')
