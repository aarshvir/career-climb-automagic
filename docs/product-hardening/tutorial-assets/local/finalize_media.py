"""Create the producer handoff only after decode, script, caption and explicit visual review."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

IDS = ['first-check', 'job-loop-start', 'source-review', 'another-application', 'controls-and-recovery']

def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--videos', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--approve-visual-review', action='store_true', required=True,
                        help='Use only after inspecting the actual chapter frames and captured source views.')
    args = parser.parse_args()
    folder = Path(args.videos).resolve()
    verified_at = datetime.now(timezone.utc).isoformat()
    assets = []
    for id in IDS:
        file = folder / f'{id}.mp4'
        data = json.loads(file.with_suffix('.json').read_text(encoding='utf8'))
        checks = data.get('verification', {})
        for check in ['fullDecodePassed', 'transcriptExact', 'sourceScreenHashesMatch',
                      'normalizedScreensConsistent', 'currentHelpNarrationMatches',
                      'currentHelpChapterMetadataMatches', 'captionWordsMatchTranscript', 'captionTimesValid']:
            if checks.get(check) is not True:
                raise ValueError(f'Missing verification: {id}/{check}')
        if data['sha256'] != sha256(file):
            raise ValueError(f'File changed after verification: {id}')
        data['reviewStatus'] = 'ready'
        data['verifiedAt'] = verified_at
        data['finalPlaybackReviewed'] = False
        data['verification']['chapterFramesVisuallyReviewed'] = True
        data['verification']['sourceScreensVisuallyReviewed'] = True
        data['verification']['captionSafeAreaVisuallyReviewed'] = True
        data['verification']['reviewScope'] = 'full decoder playback + timed caption/transcript checks + visual chapter-frame/source-screen/caption-safe-area review; not uninterrupted human viewing'
        data['presenterDisclosure'] = 'The presenter and voice were generated for this guide. Product screens use an example career record; no customer account is shown.'
        data['limitations'] = ['Narrated product-screen still montage, not a continuous screen recording.',
                               'Job Loop is an explicitly fictional local service with no real account, cloud run or application.',
                               'Caption timing uses model token predictions and measured audio samples.',
                               'Fine product text is best read fullscreen or alongside the written steps. Native controls vary by browser; a 180 px bottom caption margin is reserved.']
        if id == 'first-check':
            data['limitations'].append('Actual PDF controls and approved TXT request are shown; generated PDF view and browser download completion were not independently captured.')
        file.with_suffix('.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf8', newline='\n')
        files = {}
        for extension, kind in [('.mp4', 'video'), ('.vtt', 'captions'), ('.txt', 'transcript'), ('.jpg', 'poster'), ('.json', 'provenance')]:
            asset = file.with_suffix(extension)
            if not asset.is_file() or asset.stat().st_size == 0:
                raise FileNotFoundError(asset)
            files[kind] = {'path': f'docs/product-hardening/tutorial-assets/videos/{asset.name}',
                           'sha256': sha256(asset), 'bytes': asset.stat().st_size}
        assets.append({'tutorialId': id, 'status': 'ready', 'contentKind': 'screen_walkthrough',
                       'usesFictionalData': True, 'hasBurnedCaptions': True, 'verifiedAt': verified_at,
                       'durationSeconds': data['durationSeconds'], 'files': files,
                       'mediaFormat': data['mediaFormat'], 'chapters': data['chapters'],
                       'captionPresentation': data['captionPresentation'],
                       'presenterDisclosure': data['presenterDisclosure'], 'limitations': data['limitations']})
    manifest = {'version': 1, 'productionStatus': 'five local assets ready; public hosting is separate',
                'paidApiCalls': 0, 'externalPrivateUploads': 0,
                'rightsRecord': 'docs/product-hardening/tutorial-assets/LOCAL-MODEL-LICENSES.md',
                'retainedNotices': 'docs/product-hardening/tutorial-assets/notices/',
                'modelManifest': 'docs/product-hardening/tutorial-assets/notices/model-manifest.json',
                'providerPlaybackUrls': [], 'providerUrlExpiry': None,
                'videos': assets}
    Path(args.output).write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8', newline='\n')
    print(json.dumps({'videoCount': len(assets), 'totalVideoBytes': sum(a['files']['video']['bytes'] for a in assets),
                      'totalDurationSeconds': sum(a['durationSeconds'] for a in assets), 'verifiedAt': verified_at,
                      'output': args.output}))

if __name__ == '__main__':
    main()
