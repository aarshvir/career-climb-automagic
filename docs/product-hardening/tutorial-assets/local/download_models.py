"""Anonymous downloads of the inspected, permitted inference components only."""
import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

from huggingface_hub import hf_hub_download

COMPONENTS = {
    'musetalk': ('TMElyralab/MuseTalk', '2bcb936e2fddb4d86db4c62fd45b387d0c061571', ['README.md', 'musetalkV15/musetalk.json', 'musetalkV15/unet.pth'], 'MIT'),
    'vae': ('stabilityai/sd-vae-ft-mse', '31f26fdeee1355a5c34592e401dd41e45d25a493', ['README.md', 'config.json', 'diffusion_pytorch_model.safetensors'], 'MIT'),
    'whisper': ('openai/whisper-tiny', '169d4a4341b33bc18d8881c4b69c2e104e1cc0af', ['README.md', 'config.json', 'preprocessor_config.json', 'model.safetensors'], 'Apache-2.0 model / MIT original'),
    'kokoro': ('hexgrad/Kokoro-82M', 'f3ff3571791e39611d31c381e3a41a3af07b4987', ['README.md', 'config.json', 'kokoro-v1_0.pth', 'voices/af_heart.pt'], 'Apache-2.0'),
}

def sha256(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-root', required=True)
    args = parser.parse_args()
    root = Path(args.model_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    records = []
    for directory, (repo_id, revision, filenames, license_label) in COMPONENTS.items():
        folder = root / directory
        folder.mkdir(parents=True, exist_ok=True)
        for filename in filenames:
            # No custom-code execution or authentication. Do not download test/demo media or optional face models.
            # Use the short shared Hub cache, then copy. Windows local_dir cache names can exceed MAX_PATH.
            cached = Path(hf_hub_download(repo_id=repo_id, filename=filename, revision=revision,
                                         token=False, cache_dir=root / '.hf'))
            file = folder / filename
            file.parent.mkdir(parents=True, exist_ok=True)
            if not file.exists() or file.stat().st_size != cached.stat().st_size:
                shutil.copy2(cached, file)
            record = {'repoId': repo_id, 'revision': revision, 'filename': filename,
                      'license': license_label, 'sha256': sha256(file), 'bytes': file.stat().st_size,
                      'url': f'https://huggingface.co/{repo_id}/resolve/{revision}/{filename}'}
            records.append(record)
            print(json.dumps(record), flush=True)
            (root / 'model-manifest.json').write_text(json.dumps({'downloadedAt': datetime.now(timezone.utc).isoformat(), 'components': records}, indent=2) + '\n', encoding='utf8')

if __name__ == '__main__':
    main()
