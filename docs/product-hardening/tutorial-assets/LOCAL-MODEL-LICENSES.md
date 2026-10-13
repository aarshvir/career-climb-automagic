# Licensed local presenter production

Reviewed 13 October 2026 from primary sources. Root independently accepted this minimal local implementation. No paid API, account purchase or private face/voice cloning is involved.

| Actual component | Author's applicable declaration | Retained source |
| --- | --- | --- |
| MuseTalk V15 U-Net | Authors explicitly permit commercial use of their code and trained models; official weight card labels MIT | [Repository license](https://github.com/TMElyralab/MuseTalk#disclaimerlicense), [official model](https://huggingface.co/TMElyralab/MuseTalk) |
| `stabilityai/sd-vae-ft-mse` | This specific official VAE model card identifies MIT | [VAE model card](https://huggingface.co/stabilityai/sd-vae-ft-mse) |
| Whisper tiny | OpenAI releases code and original weights under MIT; its official converted HF model identifies Apache-2.0 | [OpenAI license declaration](https://github.com/openai/whisper#license), [actual converted model](https://huggingface.co/openai/whisper-tiny) |
| Kokoro 82M and `af_heart` voice | Official weight card identifies Apache-2.0 and explicitly welcomes production/commercial use | [Official model](https://huggingface.co/hexgrad/Kokoro-82M), [voice reference](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| Misaki English phoneme processing | Apache-2.0 | [License](https://github.com/hexgrad/misaki/blob/main/LICENSE) |
| `en_core_web_sm` 3.8.0 | Author's release identifies MIT and publishes the wheel SHA256 | [Official release](https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-3.8.0) |
| Core runtime | PyTorch BSD-style, Diffusers/Transformers Apache-2.0; applicable installed dependency notices are retained | [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE), [Diffusers](https://github.com/huggingface/diffusers/blob/main/LICENSE), [Transformers](https://github.com/huggingface/transformers/blob/main/LICENSE) |

The pipeline uses an original fictional portrait generated for this task. The unmodified original is `original-fictional-presenter.png`, SHA256 `3fd8ecb2fa0b0de04eb4c1eb7eb1790ce90a29c82416ea91df3bd279314e570d`. It does not depict the account owner or an asserted employee. Every final video visibly discloses an AI presenter and fictional demonstration.

Only the official MuseTalk U-Net/config, this VAE, Whisper tiny and the selected Kokoro model/voice are downloaded. `download_models.py` uses anonymous `token=False` requests, pins each actual repository revision and hashes every downloaded file. The model manifest and relevant model cards are retained; weights and the isolated runtime stay under ignored `.sites-runtime/` and are not redistributed with the website.

The original `animate.py` wrapper uses a manually selected face rectangle and our own feathered lower-face mask. It directly loads Diffusers/Transformers interfaces, safetensors and a `torch.load(..., weights_only=True)` state dictionary. It never imports the stock MuseTalk inference/preprocessing scripts. No DWPose, face alignment, S3FD, BiSeNet, SyncNet, MuseV, GFPGAN, CodeFormer, Wav2Lip, dlib landmarks, sample portraits or test footage is used.

SadTalker's Apache header was insufficient to clear its packaged renderer/audio weight chain; it was not installed or run. HeyGen Free outputs remain restricted to internal evaluation under its current Terms §4 and are absent from the local production chain.

Kokoro's English phoneme path uses GPL-licensed eSpeak/phonemizer runtime dependencies; the generated speech and final videos are delivered without distributing those runtime binaries. Their applicable installed notices remain in the local production record. A license label is not a guarantee about all optional components or third-party media, which this limited pipeline excludes.

Videos are **narrated product-screen walkthroughs** made from actual CUA capture stills and an actual speaking portrait video, not continuous screen recordings. The Job Loop fixture uses the unchanged real product components with fictional in-memory services and blocks external requests; its persistent “FICTIONAL LOCAL DEMO — no account, cloud run or application” banner stays visible. It is not evidence of a real account, cloud preparation result, employer application or provider configuration.

Production limitations: the pose and eyes remain largely static, while MuseTalk generates mouth/lower-face motion from the actual narration. Caption timings come from Kokoro token-duration predictions and measured audio sample lengths. Playback, visible wording, two-line captions and presenter placement require final review before publication.
