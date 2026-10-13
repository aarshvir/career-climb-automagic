"""Minimal MuseTalk inference: manual crop/mask, no face detectors or stock demo media.

The model interfaces and preprocessing follow the inspected MIT-licensed MuseTalk
implementation. This original wrapper avoids importing its optional detector,
face parsing, enhancement and test-media pipelines entirely.
"""
import argparse
import gc
import hashlib
import json
import math
import os
import subprocess
import time
from pathlib import Path

os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

import numpy as np
import soundfile as sf
import torch
from diffusers import AutoencoderKL, UNet2DConditionModel
from PIL import Image, ImageDraw, ImageFilter
from scipy.signal import resample_poly
from transformers import AutoFeatureExtractor, WhisperModel

def sha256(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def positional_encoding(audio):
    length, dimensions = audio.shape[1:]
    position = torch.arange(length, device=audio.device, dtype=torch.float32).unsqueeze(1)
    divisor = torch.exp(torch.arange(0, dimensions, 2, device=audio.device, dtype=torch.float32) * (-math.log(10000.0) / dimensions))
    encoding = torch.zeros((length, dimensions), device=audio.device, dtype=torch.float32)
    encoding[:, 0::2] = torch.sin(position * divisor)
    encoding[:, 1::2] = torch.cos(position * divisor)
    return audio + encoding.to(audio.dtype).unsqueeze(0)

def load_unet(root, device, dtype):
    configuration = json.loads((root / 'musetalk/musetalkV15/musetalk.json').read_text(encoding='utf8'))
    weight_file = root / 'musetalk/musetalkV15/unet.pth'
    # A weights-only deserializer cannot execute arbitrary checkpoint pickle code.
    with weight_file.open('rb') as stream:
        is_zip = stream.read(2) == b'PK'
    state = torch.load(weight_file, map_location='cpu', weights_only=True, mmap=is_zip)
    with torch.device('meta'):
        model = UNet2DConditionModel.from_config(configuration)
    model.load_state_dict(state, strict=True, assign=True)
    model = model.to(device=device, dtype=dtype).eval()
    del state
    gc.collect()
    return model

@torch.inference_mode()
def audio_chunks(wav_file, root, device, dtype, fps, limit_seconds):
    audio, sample_rate = sf.read(wav_file, dtype='float32')
    if audio.ndim != 1:
        audio = audio.mean(axis=1)
    if limit_seconds:
        audio = audio[:round(sample_rate * limit_seconds)]
    duration = len(audio) / sample_rate
    if sample_rate != 16000:
        common = math.gcd(sample_rate, 16000)
        audio = resample_poly(audio, 16000 // common, sample_rate // common).astype(np.float32)
    extractor = AutoFeatureExtractor.from_pretrained(root / 'whisper', local_files_only=True, trust_remote_code=False)
    whisper = WhisperModel.from_pretrained(root / 'whisper', local_files_only=True, use_safetensors=True,
                                           torch_dtype=dtype).to(device).eval()
    features = []
    for start in range(0, len(audio), 30 * 16000):
        mel = extractor(audio[start:start + 30 * 16000], return_tensors='pt', sampling_rate=16000).input_features.to(device=device, dtype=dtype)
        hidden = whisper.encoder(mel, output_hidden_states=True).hidden_states
        features.append(torch.stack(hidden, dim=2))
    features = torch.cat(features, dim=1)[:, :math.floor(duration * 50)]
    # The author's normal window uses two frames of context on each side (50 Hz encoder, 25 fps video).
    feature_multiplier = 50 / fps
    padding_count = math.ceil(feature_multiplier)
    features = torch.cat([torch.zeros_like(features[:, :padding_count * 2]), features,
                          torch.zeros_like(features[:, :padding_count * 6])], dim=1)
    windows = []
    for index in range(math.ceil(duration * fps)):
        start = math.floor(index * feature_multiplier)
        window = features[:, start:start + 10]
        if window.shape[1] != 10:
            raise RuntimeError('Incomplete audio context window')
        windows.append(window.reshape(1, 50, 384))
    chunks = torch.cat(windows).cpu()
    del whisper, extractor, features, windows
    gc.collect()
    if device.startswith('cuda'):
        torch.cuda.empty_cache()
    return chunks, duration

@torch.inference_mode()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-root', required=True)
    parser.add_argument('--portrait', required=True)
    parser.add_argument('--audio', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--bbox', default='431,224,823,671', help='Manual original-image face crop x1,y1,x2,y2')
    parser.add_argument('--output-size', type=int, default=512)
    parser.add_argument('--fps', type=int, default=25)
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--seconds', type=float)
    parser.add_argument('--device', default='cuda')
    args = parser.parse_args()
    started = time.monotonic()
    torch.manual_seed(7)
    torch.set_num_threads(4)
    root, output = Path(args.model_root).resolve(), Path(args.output).resolve()
    portrait_file, wav_file = Path(args.portrait).resolve(), Path(args.audio).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    device, dtype = args.device, (torch.float16 if args.device.startswith('cuda') else torch.float32)
    original = Image.open(portrait_file).convert('RGB')
    original_width, original_height = original.size
    x1, y1, x2, y2 = [int(value) for value in args.bbox.split(',')]
    if not (0 <= x1 < x2 <= original_width and 0 <= y1 < y2 <= original_height):
        raise ValueError('Manual face crop must be inside the original portrait')
    size = args.output_size
    height = round(original_height / original_width * size / 2) * 2
    base = original.resize((size, height), Image.Resampling.LANCZOS)
    scale_x, scale_y = size / original_width, height / original_height
    scaled_box = [round(x1 * scale_x), round(y1 * scale_y), round(x2 * scale_x), round(y2 * scale_y)]
    bx1, by1, bx2, by2 = scaled_box
    face = original.crop((x1, y1, x2, y2)).resize((256, 256), Image.Resampling.LANCZOS)
    tensor = torch.from_numpy(np.asarray(face).copy()).permute(2, 0, 1).float().unsqueeze(0).to(device) / 127.5 - 1
    mask_tensor = tensor.clone()
    mask_tensor[:, :, 128:, :] = -1
    vae = AutoencoderKL.from_pretrained(root / 'vae', local_files_only=True, use_safetensors=True).to(device=device, dtype=torch.float32).eval()
    scale = vae.config.scaling_factor
    latent = torch.cat([vae.encode(mask_tensor).latent_dist.mode() * scale,
                        vae.encode(tensor).latent_dist.mode() * scale], dim=1).to(dtype)
    del tensor, mask_tensor
    chunks, duration = audio_chunks(wav_file, root, device, dtype, args.fps, args.seconds)
    unet = load_unet(root, device, dtype)
    # This mask is authored by us; it does not use face parsing, landmarks or an external face model.
    mask = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((27, 112, 229, 250), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(8)).resize((bx2 - bx1, by2 - by1), Image.Resampling.LANCZOS)
    alpha = np.asarray(mask, dtype=np.float32)[:, :, None] / 255
    base_pixels = np.asarray(base)
    pipe_args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                 '-s', f'{size}x{height}', '-r', str(args.fps), '-i', 'pipe:0', '-i', str(wav_file),
                 '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest']
    if args.seconds:
        pipe_args += ['-t', str(args.seconds)]
    pipe_args += [str(output)]
    process = subprocess.Popen(pipe_args, stdin=subprocess.PIPE)
    variation, previous, count = 0.0, None, 0
    try:
        for start in range(0, len(chunks), args.batch_size):
            audio = positional_encoding(chunks[start:start + args.batch_size].to(device=device, dtype=dtype))
            batch_count = len(audio)
            prediction = unet(latent.repeat(batch_count, 1, 1, 1), torch.tensor([0], device=device),
                              encoder_hidden_states=audio).sample
            decoded = (vae.decode((prediction.float() / scale)).sample / 2 + 0.5).clamp(0, 1)
            if not torch.isfinite(decoded).all():
                raise RuntimeError('Non-finite generated image values')
            generated = (decoded.permute(0, 2, 3, 1).cpu().numpy() * 255).round().astype(np.uint8)
            for face_pixels in generated:
                region = np.asarray(Image.fromarray(face_pixels).resize((bx2 - bx1, by2 - by1), Image.Resampling.LANCZOS))
                frame = base_pixels.copy()
                frame[by1:by2, bx1:bx2] = (region * alpha + base_pixels[by1:by2, bx1:bx2] * (1 - alpha)).round().astype(np.uint8)
                if previous is not None:
                    variation += float(np.abs(region.astype(np.float32) - previous).mean())
                previous = region.astype(np.float32)
                process.stdin.write(frame.tobytes())
                count += 1
            if count % 100 < args.batch_size:
                print(json.dumps({'framesRendered': count, 'totalFrames': len(chunks)}), flush=True)
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError('FFmpeg did not encode the presenter clip')
    except BaseException:
        process.kill()
        raise
    record = {'model': 'TMElyralab/MuseTalk musetalkV15', 'portrait': str(portrait_file),
              'portraitSha256': sha256(portrait_file), 'audioSha256': sha256(wav_file),
              'output': str(output), 'outputSha256': sha256(output), 'frames': count, 'fps': args.fps,
              'durationSeconds': duration, 'manualOriginalImageBbox': [x1, y1, x2, y2],
              'meanInterframeFaceDifference': variation / max(1, count - 1),
              'renderElapsedSeconds': time.monotonic() - started,
              'optionalFaceModelsUsed': [], 'humanIdentity': 'original fictional AI-generated presenter',
              'outputVerifiedByEncoder': True, 'qualityReviewed': False}
    output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8')
    print(json.dumps(record), flush=True)

if __name__ == '__main__':
    main()
