param([switch]$DownloadModels)
$ErrorActionPreference = 'Stop'
$AvatarProject = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$AvatarVenv = Join-Path $AvatarProject '.sites-runtime/avatar-venv'
$AvatarModels = Join-Path $AvatarProject '.sites-runtime/avatar-models'
$AvatarBundledPython = 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$AvatarPython = Join-Path $AvatarVenv 'Scripts/python.exe'
$env:HF_HUB_DISABLE_IMPLICIT_TOKEN = '1'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:HF_HOME = Join-Path $AvatarModels '.cache'
if (!(Test-Path -LiteralPath $AvatarPython)) { & $AvatarBundledPython -m venv $AvatarVenv; if ($LASTEXITCODE) { throw 'Virtual environment creation failed' } }
& $AvatarPython -m pip install --disable-pip-version-check 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE) { throw 'PyTorch CUDA install failed' }
& $AvatarPython -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'Avatar dependencies failed' }
& $AvatarPython -m pip install --disable-pip-version-check 'en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl#sha256=1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85'
if ($LASTEXITCODE) { throw 'Pinned English phoneme model install failed' }
& $AvatarPython -c "import torch; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'); print('Torch:', torch.__version__)"
if ($LASTEXITCODE) { throw 'Torch environment validation failed' }
if ($DownloadModels) { & $AvatarPython (Join-Path $PSScriptRoot 'download_models.py') --model-root $AvatarModels; if ($LASTEXITCODE) { throw 'Model download failed' } }
