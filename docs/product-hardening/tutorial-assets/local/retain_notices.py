"""Retain installed package notices and the pinned model provenance without runtime binaries."""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import re
import shutil
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-root', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root, output = Path(args.model_root).resolve(), Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for distribution in sorted(metadata.distributions(), key=lambda d: d.metadata['Name'].lower()):
        name = distribution.metadata['Name']
        entry = {'name': name, 'version': distribution.version,
                 'licenseMetadata': distribution.metadata.get('License-Expression') or distribution.metadata.get('License'),
                 'noticeFiles': []}
        safe = re.sub(r'[^a-zA-Z0-9_.-]', '_', name)
        for file in distribution.files or []:
            if not any(marker in file.name.lower() for marker in ['license', 'notice', 'copying']):
                continue
            if file.suffix.lower() in ['.py', '.pyc', '.dll', '.pyd', '.so']:
                continue
            source = Path(distribution.locate_file(file))
            if not source.is_file() or source.stat().st_size > 2_000_000:
                continue
            try:
                content = source.read_text(encoding='utf8')
            except UnicodeDecodeError:
                continue
            destination = output / 'packages' / safe / Path(*file.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content, encoding='utf8')
            entry['noticeFiles'].append({'path': str(destination.relative_to(output)).replace('\\', '/'),
                                         'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
        records.append(entry)
    (output / 'installed-package-notices.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf8')
    shutil.copy2(root / 'model-manifest.json', output / 'model-manifest.json')
    for component in ['musetalk', 'vae', 'whisper', 'kokoro']:
        destination = output / 'model-cards' / component
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / component / 'README.md', destination / 'README.md')
    print(json.dumps({'packages': len(records), 'noticeFiles': sum(len(r['noticeFiles']) for r in records),
                      'output': str(output)}))

if __name__ == '__main__':
    main()
