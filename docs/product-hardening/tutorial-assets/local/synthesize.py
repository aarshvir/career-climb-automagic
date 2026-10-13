"""Exact help narration + measured speech timings with the Apache-licensed Kokoro model."""
import argparse
import hashlib
import json
import os
import textwrap
from pathlib import Path

os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

import numpy as np
import soundfile as sf
import torch
from kokoro import KModel, KPipeline

SAMPLE_RATE = 24000

def timestamp(seconds):
    milliseconds = max(0, round(seconds * 1000))
    h, milliseconds = divmod(milliseconds, 3600000)
    m, milliseconds = divmod(milliseconds, 60000)
    s, milliseconds = divmod(milliseconds, 1000)
    return f'{h:02}:{m:02}:{s:02}.{milliseconds:03}'

def cues_from_tokens(tokens, chunk_start, chunk_seconds, text):
    timed = [(t.text + (t.whitespace or ''), t.start_ts, t.end_ts) for t in (tokens or [])
             if t.start_ts is not None and t.end_ts is not None]
    if not timed:
        return [{'start': chunk_start, 'end': chunk_start + chunk_seconds, 'text': text}]
    cues, group = [], []
    for item in timed:
        proposed = ''.join(t[0] for t in group + [item]).strip()
        punctuation_only = not any(character.isalnum() for character in item[0])
        if group and not punctuation_only and (len(proposed) > 78 or item[2] - group[0][1] > 5):
            cues.append({'start': chunk_start + max(0, group[0][1]),
                         'end': chunk_start + min(chunk_seconds, group[-1][2]),
                         'text': ''.join(t[0] for t in group).strip()})
            group = []
        group.append(item)
    if group:
        cues.append({'start': chunk_start + max(0, group[0][1]),
                     'end': chunk_start + min(chunk_seconds, group[-1][2]),
                     'text': ''.join(t[0] for t in group).strip()})
    return cues

def write_vtt(file, cues):
    lines = ['WEBVTT', '']
    for index, cue in enumerate(cues):
        if cue['end'] <= cue['start']:
            continue
        wrapped = textwrap.wrap(cue['text'], width=42, break_long_words=False, break_on_hyphens=False)
        lines += [str(index + 1), f"{timestamp(cue['start'])} --> {timestamp(cue['end'])}", '\n'.join(wrapped), '']
    file.write_text('\n'.join(lines), encoding='utf8')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-root', required=True)
    parser.add_argument('--scripts-root', required=True)
    parser.add_argument('--output-root', required=True)
    parser.add_argument('--tutorial')
    parser.add_argument('--scene')
    parser.add_argument('--device', default='cuda')
    parser.add_argument('--speed', type=float, default=0.95)
    args = parser.parse_args()
    model_dir = Path(args.model_root).resolve() / 'kokoro'
    model = KModel(repo_id='hexgrad/Kokoro-82M', config=str(model_dir / 'config.json'),
                   model=str(model_dir / 'kokoro-v1_0.pth')).to(args.device).eval()
    pipeline = KPipeline(lang_code='a', model=model, repo_id='hexgrad/Kokoro-82M', trf=False)
    voice = str(model_dir / 'voices/af_heart.pt')
    scripts_root, output_root = Path(args.scripts_root).resolve(), Path(args.output_root).resolve()
    files = [scripts_root / f'{args.tutorial}.json'] if args.tutorial else sorted(p for p in scripts_root.glob('*.json') if '-part-' not in p.name)
    for file in files:
        tutorial = json.loads(file.read_text(encoding='utf8'))
        folder = output_root / tutorial['id']
        folder.mkdir(parents=True, exist_ok=True)
        all_audio, all_cues, chapters, offset = [], [], [], 0.0
        for scene in tutorial['scenes']:
            if args.scene and scene['id'] != args.scene:
                continue
            pieces, cues, scene_offset = [], [], 0.0
            for result in pipeline(scene['narration'], voice=voice, speed=args.speed):
                audio = result.audio.detach().cpu().numpy().astype(np.float32)
                duration = len(audio) / SAMPLE_RATE
                pieces.append(audio)
                cues += cues_from_tokens(result.tokens, scene_offset, duration, result.graphemes)
                scene_offset += duration
            if not pieces:
                raise RuntimeError(f"No speech generated: {tutorial['id']}/{scene['id']}")
            samples = np.concatenate(pieces)
            duration = len(samples) / SAMPLE_RATE
            wav_file = folder / f"{scene['id']}.wav"
            sf.write(wav_file, samples, SAMPLE_RATE, subtype='PCM_16')
            write_vtt(folder / f"{scene['id']}.vtt", cues)
            record = {'id': scene['id'], 'stageId': scene['stageId'], 'title': scene['title'],
                      'startSeconds': offset, 'durationSeconds': duration, 'narration': scene['narration'],
                      'audioFile': str(wav_file), 'sha256': hashlib.sha256(wav_file.read_bytes()).hexdigest(),
                      'captions': cues, 'timingMethod': 'Kokoro predicted token timing + measured 24000 Hz samples'}
            chapters.append(record)
            all_audio.append(samples)
            all_cues += [{**cue, 'start': cue['start'] + offset, 'end': cue['end'] + offset} for cue in cues]
            offset += duration
            print(json.dumps({'tutorial': tutorial['id'], 'scene': scene['id'], 'durationSeconds': duration}), flush=True)
        combined = np.concatenate(all_audio)
        output_id = tutorial['id'] + (f'-{args.scene}' if args.scene else '')
        sf.write(folder / f'{output_id}.wav', combined, SAMPLE_RATE, subtype='PCM_16')
        write_vtt(folder / f'{output_id}.vtt', all_cues)
        (folder / f'{output_id}-chapters.json').write_text(json.dumps({
            'tutorialId': tutorial['id'], 'title': tutorial['title'], 'durationSeconds': offset,
            'voiceModel': 'hexgrad/Kokoro-82M', 'voice': 'af_heart', 'speed': args.speed,
            'sourceSha256': tutorial['sourceSha256'], 'chapters': chapters,
        }, indent=2) + '\n', encoding='utf8')
        (folder / f'{output_id}.txt').write_text('\n\n'.join(s['narration'] for s in chapters) + '\n', encoding='utf8')

if __name__ == '__main__':
    main()
