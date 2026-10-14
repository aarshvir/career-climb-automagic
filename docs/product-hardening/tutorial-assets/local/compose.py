"""Combine actual CUA product screenshots, speaking portrait footage and readable captions."""
import argparse
import hashlib
import json
import re
import subprocess
import textwrap
from pathlib import Path

def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def ffmpeg_path(file):
    return str(file.resolve()).replace('\\', '/').replace(':', '\\:').replace("'", "\\'")

def ass_time(seconds):
    centiseconds = max(0, round(seconds * 100))
    h, centiseconds = divmod(centiseconds, 360000)
    m, centiseconds = divmod(centiseconds, 6000)
    s, centiseconds = divmod(centiseconds, 100)
    return f'{h}:{m:02}:{s:02}.{centiseconds:02}'

def vtt_time(seconds):
    milliseconds = max(0, round(seconds * 1000))
    h, milliseconds = divmod(milliseconds, 3600000)
    m, milliseconds = divmod(milliseconds, 60000)
    s, milliseconds = divmod(milliseconds, 1000)
    return f'{h:02}:{m:02}:{s:02}.{milliseconds:03}'

def repair_cues(cues):
    repaired = []
    for source in cues:
        cue = dict(source)
        leading = re.match(r'^\s*([.,;:!?]+)\s*', cue['text'])
        if leading and repaired:
            repaired[-1]['text'] = repaired[-1]['text'].rstrip() + leading.group(1)
            cue['text'] = cue['text'][leading.end():]
        if cue['text'].strip() and cue['end'] > cue['start']:
            repaired.append(cue)
    return repaired

def write_captions(stem, cues):
    ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', '',
           '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
           'Style: Caption,Arial,54,&H00FFFFFF,&H00FFFFFF,&H0024190F,&H0024190F,0,0,0,0,100,100,0,0,1,2,0,2,64,64,180,1', '',
           '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
    vtt = ['WEBVTT', '']
    for index, cue in enumerate(cues):
        wrapped = textwrap.wrap(cue['text'], width=52, break_long_words=False, break_on_hyphens=False)
        if len(wrapped) > 2:
            raise ValueError('Caption has more than two lines; split its timed tokens before composition')
        ass_text = '\\N'.join(wrapped).replace('{', '\\{').replace('}', '\\}')
        ass.append(f"Dialogue: 0,{ass_time(cue['start'])},{ass_time(cue['end'])},Caption,,0,0,0,,{ass_text}")
        vtt += [str(index + 1), f"{vtt_time(cue['start'])} --> {vtt_time(cue['end'])}", '\n'.join(wrapped), '']
    stem.with_suffix('.ass').write_text('\n'.join(ass) + '\n', encoding='utf8', newline='\n')
    stem.with_suffix('.vtt').write_text('\n'.join(vtt), encoding='utf8', newline='\n')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chapters', required=True)
    parser.add_argument('--presenter', required=True)
    parser.add_argument('--screens', required=True, help='JSON array of actual screenshot paths/durations')
    parser.add_argument('--output', required=True)
    parser.add_argument('--label')
    args = parser.parse_args()
    chapters_file, presenter = Path(args.chapters).resolve(), Path(args.presenter).resolve()
    data = json.loads(chapters_file.read_text(encoding='utf8'))
    screens = json.loads(Path(args.screens).read_text(encoding='utf8'))
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    work = output.parent / '.composition'
    work.mkdir(parents=True, exist_ok=True)
    stem = work / output.stem
    # The final still is repeated only to let the concat demuxer honor its duration.
    frames = []
    screen_records = []
    for entry in screens:
        file = Path(entry['path']).resolve()
        if not file.exists() or entry['durationSeconds'] <= 0:
            raise ValueError('Every screen must be a captured, existing image with a positive duration')
        frames += [f"file '{str(file).replace(chr(92), '/')}'", f"duration {entry['durationSeconds']:.6f}"]
        screen_records.append({**entry, 'path': str(file), 'sha256': sha256(file)})
    frames.append(f"file '{str(Path(screens[-1]['path']).resolve()).replace(chr(92), '/')}'")
    stem.with_suffix('.frames.txt').write_text('\n'.join(frames) + '\n', encoding='utf8', newline='\n')
    cues = repair_cues([{**cue, 'start': cue['start'] + chapter['startSeconds'], 'end': cue['end'] + chapter['startSeconds']}
                       for chapter in data['chapters'] for cue in chapter['captions']])
    write_captions(stem, cues)
    title = args.label or data['title']
    stem.with_suffix('.title.txt').write_text(title, encoding='utf8', newline='\n')
    font = ffmpeg_path(Path('C:/Windows/Fonts/arial.ttf'))
    # Retain the full captured height; trim only empty exterior side margins.
    # Captions occupy a separate band and leave 180 px below their baseline for
    # native playback controls. Neither captions nor the presenter cover the UI.
    filters = ("[0:v]fps=25,crop=w=min(iw-300\\,1290):h=ih:x=300:y=0,scale=1040:-2,"
               "pad=1920:1080:18:88:color=0xeff3fb[screen];"
               "[1:v]scale=512:512[human];"
               "[screen][human]overlay=x=1320:y=208:shortest=1,"
               "drawbox=x=1316:y=204:w=520:h=520:color=0xffffff:t=4,"
               "drawbox=x=0:y=784:w=1920:h=160:color=0x0f1924:t=fill,"
               f"drawtext=fontfile='{font}':textfile='{ffmpeg_path(stem.with_suffix('.title.txt'))}':fontsize=36:fontcolor=0x13213b:x=24:y=18,"
               f"drawtext=fontfile='{font}':text='Real product screens - fictional demonstration':fontsize=20:fontcolor=0x41506b:x=24:y=59,"
               f"drawtext=fontfile='{font}':text='AI presenter - fictional':fontsize=25:fontcolor=0x13213b:x=1442:y=737,"
               f"subtitles=filename='{ffmpeg_path(stem.with_suffix('.ass'))}'[finished]")
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
               '-i', str(stem.with_suffix('.frames.txt')), '-i', str(presenter), '-filter_complex', filters,
               '-map', '[finished]', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
               '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-t', str(data['durationSeconds']),
               '-movflags', '+faststart', str(output)]
    subprocess.run(command, check=True)
    output.with_suffix('.vtt').write_text(stem.with_suffix('.vtt').read_text(encoding='utf8'), encoding='utf8', newline='\n')
    output.with_suffix('.txt').write_text('\n\n'.join(c['narration'] for c in data['chapters']) + '\n', encoding='utf8', newline='\n')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '2', '-i', str(output), '-frames:v', '1', str(output.with_suffix('.jpg'))], check=True)
    record = {'contentKind': 'screen_walkthrough', 'hasBurnedCaptions': True, 'tutorialId': data['tutorialId'], 'title': title, 'file': str(output), 'sha256': sha256(output),
              'durationSeconds': data['durationSeconds'], 'sourcePresenterSha256': sha256(presenter),
              'screens': screen_records, 'chapters': [{k: c[k] for k in ['id', 'stageId', 'title', 'startSeconds', 'durationSeconds']} for c in data['chapters']],
              'screenMethod': 'actual CUA browser screenshots, edited as a montage; not a continuous screen recording',
              'presenterMethod': 'original fictional portrait + Kokoro af_heart + MuseTalk V15 manual crop/mask',
              'captionMethod': 'Kokoro predicted token timings and measured speech sample durations',
              'captionPresentation': {'fontSizeAt1080p': 54, 'maximumLines': 2,
                                      'wrapCharacters': 52, 'bottomMarginPixels': 180,
                                      'reservedBand': {'top': 784, 'bottom': 944},
                                      'nativeControlsSafeAreaPixels': 180,
                                      'screenCapturedHeightRetained': True},
              'paidApiCalls': 0, 'commercialComponentsReviewed': True, 'finalPlaybackReviewed': False}
    output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8', newline='\n')
    print(json.dumps(record), flush=True)

if __name__ == '__main__':
    main()
