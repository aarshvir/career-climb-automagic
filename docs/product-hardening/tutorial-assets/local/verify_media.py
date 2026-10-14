"""Decode final media, verify timed captions/transcripts and export chapter frames for human review."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

def run(*command):
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout

def words(text):
    return re.findall(r"[a-z0-9]+", text.lower())

def seconds(value):
    hours, minutes, remainder = value.split(':')
    return int(hours) * 3600 + int(minutes) * 60 + float(remainder)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--videos', required=True)
    parser.add_argument('--audio-root', required=True)
    parser.add_argument('--review-root', required=True)
    parser.add_argument('--scripts-root', default=str(Path(__file__).resolve().parent.parent / 'scripts'))
    args = parser.parse_args()
    videos, audio, reviews = Path(args.videos).resolve(), Path(args.audio_root).resolve(), Path(args.review_root).resolve()
    reviews.mkdir(parents=True, exist_ok=True)
    results = []
    for movie in sorted(videos.glob('*.mp4')):
        record = json.loads(movie.with_suffix('.json').read_text(encoding='utf8'))
        layout = record.get('screenPresentation', {})
        normalized_size = {'width': 1040, 'height': 696}
        if (layout.get('normalizedFrameDimensions') != normalized_size
                or layout.get('normalizationBeforeConcat') is not True
                or layout.get('screenTopPixels') != 88
                or layout.get('screenBottomPixels') != 784
                or layout.get('captionBandTopPixels') != 784
                or layout.get('screenCaptionOverlapPixels') != 0):
            raise ValueError(f'Captured screen overlaps captions or lacks consistent pre-concat sizing: {movie.name}')
        if not record.get('screens'):
            raise ValueError(f'No captured source screens recorded: {movie.name}')
        for screen in record['screens']:
            capture, normalized = Path(screen['path']), Path(screen['normalizedFramePath'])
            if hashlib.sha256(capture.read_bytes()).hexdigest() != screen['sha256']:
                raise ValueError(f'Source screen changed after composition: {capture.name}')
            if (screen.get('normalizedFrameDimensions') != normalized_size
                    or screen.get('normalization', {}).get('fullCapturedHeightRetained') is not True
                    or hashlib.sha256(normalized.read_bytes()).hexdigest() != screen['normalizedFrameSha256']):
                raise ValueError(f'Normalized frame changed or lost captured height: {capture.name}')
            normalized_probe = json.loads(run('ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                             '-show_entries', 'stream=width,height', '-of', 'json', str(normalized)))
            if normalized_probe.get('streams', [{}])[0] != normalized_size:
                raise ValueError(f'Inconsistent normalized frame dimensions: {capture.name}')
        chapters = json.loads((audio / movie.stem / f'{movie.stem}-chapters.json').read_text(encoding='utf8'))
        expected = '\n\n'.join(c['narration'] for c in chapters['chapters'])
        current_script = json.loads((Path(args.scripts_root) / f'{movie.stem}.json').read_text(encoding='utf8'))
        if expected != '\n\n'.join(c['narration'] for c in current_script['scenes']):
            raise ValueError(f'Current product narration changed: {movie.name}')
        chapter_identity = lambda items: [tuple(c[key] for key in ['id', 'stageId', 'title']) for c in items]
        if chapter_identity(chapters['chapters']) != chapter_identity(current_script['scenes']):
            raise ValueError(f'Current product chapter metadata changed: {movie.name}')
        transcript = movie.with_suffix('.txt').read_text(encoding='utf8').strip()
        if transcript != expected:
            raise ValueError(f'Transcript changed: {movie.name}')
        captions = movie.with_suffix('.vtt').read_text(encoding='utf8')
        cues, caption_words = [], []
        for block in re.split(r'\n\s*\n', captions):
            lines = block.splitlines()
            timing = next((i for i, line in enumerate(lines) if ' --> ' in line), None)
            if timing is None:
                continue
            start, end = map(seconds, lines[timing].split(' --> '))
            text = lines[timing + 1:]
            if not 0 <= start < end <= record['durationSeconds'] + 0.001 or len(text) > 2:
                raise ValueError(f'Invalid caption timing/line count: {movie.name}')
            if cues and start < cues[-1][1] - 0.001:
                raise ValueError(f'Overlapping caption: {movie.name}')
            cues.append((start, end))
            caption_words += words(' '.join(text))
        if caption_words != words(expected):
            raise ValueError(f'Caption word mismatch: {movie.name}')
        probe = json.loads(run('ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(movie)))
        video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        sound = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
        duration = float(probe['format']['duration'])
        if video['codec_name'] != 'h264' or sound['codec_name'] != 'aac' or (video['width'], video['height']) != (1920, 1080):
            raise ValueError(f'Unexpected format: {movie.name}')
        if abs(duration - record['durationSeconds']) > 0.08:
            raise ValueError(f'Duration mismatch: {movie.name}')
        run('ffmpeg', '-hide_banner', '-v', 'error', '-i', str(movie), '-f', 'null', '-')
        folder = reviews / movie.stem
        folder.mkdir(exist_ok=True)
        for chapter in record['chapters']:
            at = chapter['startSeconds'] + min(3, chapter['durationSeconds'] / 2)
            run('ffmpeg', '-hide_banner', '-v', 'error', '-y', '-ss', str(at), '-i', str(movie), '-frames:v', '1', str(folder / f"{chapter['id']}.jpg"))
        record.update({'hasBurnedCaptions': True, 'bytes': movie.stat().st_size,
                       'currentHelpSourceSha256': current_script['sourceSha256'],
                       'sha256': hashlib.sha256(movie.read_bytes()).hexdigest(),
                       'measuredContainerDurationSeconds': duration,
                       'mediaFormat': {'width': video['width'], 'height': video['height'], 'fps': video['avg_frame_rate'],
                                       'videoCodec': video['codec_name'], 'audioCodec': sound['codec_name'], 'mimeType': 'video/mp4'},
                       'verification': {'fullDecodePassed': True, 'transcriptExact': True,
                                        'sourceScreenHashesMatch': True,
                                        'normalizedScreensConsistent': True,
                                        'screenCaptionOverlapPixels': 0,
                                        'currentHelpNarrationMatches': True,
                                        'currentHelpChapterMetadataMatches': True,
                                        'captionWordsMatchTranscript': True, 'captionTimesValid': True,
                                        'captionMaximumLines': 2, 'captionCueCount': len(cues),
                                        'chapterFramesExportedForVisualReview': True}})
        movie.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8', newline='\n')
        results.append({'id': movie.stem, 'durationSeconds': duration, 'bytes': movie.stat().st_size, 'sha256': record['sha256']})
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()
