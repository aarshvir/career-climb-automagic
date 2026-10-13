"""Prepare montage timings from measured narration; require an actual saved capture for each scene."""
import argparse
import json
from pathlib import Path

FIRST_CHECK = {'role': '01-role.jpg', 'cv': '02-cv.jpg', 'vacancy': '03-vacancy.jpg',
               'evidence': '04-evidence-source.jpg', 'review': '05-review.jpg', 'approve': '06-approved-download.jpg'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chapters', required=True)
    parser.add_argument('--screens-root', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    chapters = json.loads(Path(args.chapters).read_text(encoding='utf8'))
    root = Path(args.screens_root).resolve()
    plan = []
    for chapter in chapters['chapters']:
        id = chapter['id']
        if chapters['tutorialId'] == 'job-loop-start' and id == 'details':
            for filename in ['job-loop-start--details-name.jpg', 'job-loop-start--details.jpg']:
                file = root / filename
                if not file.exists():
                    raise FileNotFoundError(file)
                plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'] / 2,
                             'stageId': chapter['stageId'], 'sourceOrigin': 'http://127.0.0.1:8382/',
                             'fictionalLocalService': True, 'demonstrationData': 'fictional'})
            continue
        if chapters['tutorialId'] == 'job-loop-start' and id == 'facts':
            for filename in ['source-review--complete.jpg', 'job-loop-start--facts.jpg']:
                file = root / filename
                if not file.exists():
                    raise FileNotFoundError(file)
                plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'] / 2,
                             'stageId': chapter['stageId'], 'sourceOrigin': 'http://127.0.0.1:8382/',
                             'fictionalLocalService': True, 'demonstrationData': 'fictional'})
            continue
        if chapters['tutorialId'] == 'controls-and-recovery' and id in ['manual', 'coverage', 'optional', 'loop-memory']:
            second = {'manual': 'manual-control', 'coverage': 'coverage-outputs',
                      'optional': 'optional-gmail', 'loop-memory': 'loop-memory-return'}[id]
            filenames = [f'controls-and-recovery--{id}.jpg',
                         f'controls-and-recovery--{second}.jpg']
            for filename in filenames:
                file = root / filename
                if not file.exists():
                    raise FileNotFoundError(file)
                plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'] / 2,
                             'stageId': chapter['stageId'], 'sourceOrigin': 'http://127.0.0.1:8382/',
                             'fictionalLocalService': True, 'demonstrationData': 'fictional'})
            continue
        if chapters['tutorialId'] == 'another-application' and id == 'new-check':
            for filename in ['another-application--new-check.jpg', 'another-application--new-check-cv.jpg']:
                file = root / filename
                if not file.exists():
                    raise FileNotFoundError(file)
                plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'] / 2,
                             'stageId': chapter['stageId'], 'sourceOrigin': 'http://127.0.0.1:8381/check',
                             'fictionalLocalService': False, 'demonstrationData': 'fictional'})
            continue
        if chapters['tutorialId'] == 'first-check' and id == 'approve':
            # This is a narrated screen montage, not fabricated continuous pointer actions.
            # PDF controls are real; no generated PDF or finished download is claimed by these stills.
            for filename, fraction in [('06-pdf-controls.jpg', 0.52), ('06-approve-checks.jpg', 0.24), ('06-approved-download.jpg', 0.24)]:
                file = root / filename
                if not file.exists():
                    raise FileNotFoundError(file)
                plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'] * fraction,
                             'stageId': chapter['stageId'], 'sourceOrigin': 'http://127.0.0.1:8381/check',
                             'fictionalLocalService': False, 'demonstrationData': 'fictional',
                             'limitations': 'PDF preview/file download completion not independently captured; actual controls and TXT request are shown.'})
            continue
        filename = FIRST_CHECK[id] if chapters['tutorialId'] == 'first-check' else f"{chapters['tutorialId']}--{id}.jpg"
        file = root / filename
        if not file.exists():
            raise FileNotFoundError(file)
        guest = chapters['tutorialId'] == 'first-check' or (chapters['tutorialId'], id) in [('another-application', 'preserve'), ('another-application', 'new-check'), ('controls-and-recovery', 'recovery')]
        plan.append({'path': str(file), 'durationSeconds': chapter['durationSeconds'], 'stageId': chapter['stageId'],
                     'sourceOrigin': 'http://127.0.0.1:8381/check' if guest else 'http://127.0.0.1:8382/',
                     'fictionalLocalService': not guest, 'demonstrationData': 'fictional'})
    Path(args.output).write_text(json.dumps(plan, indent=2) + '\n', encoding='utf8')

if __name__ == '__main__':
    main()
