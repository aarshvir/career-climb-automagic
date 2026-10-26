param([string]$CachedDenoExecutable = '', [string]$CachedEsbuildExecutable = '')
$ErrorActionPreference = 'Stop'
$loopRepo = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$loopOutput = [System.IO.Path]::GetFullPath((Join-Path $loopRepo 'docs/supabase-loop-ui'))
if (-not $loopOutput.StartsWith($loopRepo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Bundle output must remain in this repository.' }
$loopNames = @('job-loop-control', 'job-loop-worker', 'job-loop-oauth', 'jobvance-admin', 'jobvance-review-worker', 'jobvance-guest-support', 'jobvance-marketing')
$loopExternal = 'https://esm.sh/@supabase/supabase-js@2.57.4'
$loopManifest = @()
function Get-LoopNormalizedTextHash([string]$loopSourcePath) {
  $loopSourceText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($loopSourcePath))
  if ($loopSourceText.Length -gt 0 -and $loopSourceText[0] -eq [char]0xFEFF) { $loopSourceText = $loopSourceText.Substring(1) }
  $loopSourceText = $loopSourceText.Replace("`r`n", "`n").Replace("`r", "`n")
  $loopHasher = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($loopHasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($loopSourceText))).Replace('-', '').ToLowerInvariant() }
  finally { $loopHasher.Dispose() }
}
$loopGenerator = 'deno@2.9.6 bundle --config=supabase/functions/job-loop-worker/deno.json --platform=deno --minify --external=jspdf --external=docx; pin npm specifiers'
if ($CachedDenoExecutable) {
  if (-not (Test-Path -LiteralPath $CachedDenoExecutable -PathType Leaf)) { throw 'The explicit cached Deno executable does not exist.' }
  $loopDenoVersion = & $CachedDenoExecutable --version
  if ($LASTEXITCODE -ne 0 -or $loopDenoVersion[0] -notmatch '^deno 2\.9\.6 ') { throw 'The bundle builder requires the reviewed Deno 2.9.6.' }
}
if ($CachedEsbuildExecutable) {
  if (-not (Test-Path -LiteralPath $CachedEsbuildExecutable -PathType Leaf)) { throw 'The explicit cached esbuild executable does not exist.' }
  $loopEsbuildVersion = (& $CachedEsbuildExecutable --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $loopEsbuildVersion -ne '0.25.5') { throw 'The offline fallback requires the reviewed esbuild 0.25.5 bundled by Deno.' }
  $loopGenerator = 'cached esbuild@0.25.5 --bundle --platform=neutral --format=esm --minify; pin npm specifiers (offline Deno tooling fallback)'
}
New-Item -ItemType Directory -Path $loopOutput -Force | Out-Null
Push-Location -LiteralPath $loopRepo
try {
  $loopShared = @(Get-ChildItem -LiteralPath 'supabase/functions/_shared' -Filter '*.ts' -File | Sort-Object Name | ForEach-Object { 'supabase/functions/_shared/' + $_.Name })
  $loopHandlers = @($loopNames | ForEach-Object {
    $loopDirectory = "supabase/functions/$_"
    Get-ChildItem -LiteralPath $loopDirectory -File | Sort-Object Name | ForEach-Object { $loopDirectory + '/' + $_.Name }
  })
  foreach ($loopName in $loopNames) {
    $loopEntry = "supabase/functions/$loopName/index.ts"
    $loopArtifact = "docs/supabase-loop-ui/$loopName.js"
    if ($CachedEsbuildExecutable) {
      & $CachedEsbuildExecutable $loopEntry --bundle --platform=neutral --format=esm --minify --external:jspdf --external:docx "--external:$loopExternal" "--outfile=$loopArtifact"
    } elseif ($CachedDenoExecutable) {
      & $CachedDenoExecutable bundle --config=supabase/functions/job-loop-worker/deno.json --platform=deno --minify --external=jspdf --external=docx "--external=$loopExternal" "--output=$loopArtifact" $loopEntry
    } else {
      & npm.cmd exec --yes --package deno@2.9.6 -- deno bundle --config=supabase/functions/job-loop-worker/deno.json --platform=deno --minify --external=jspdf --external=docx "--external=$loopExternal" "--output=$loopArtifact" $loopEntry
    }
    if ($LASTEXITCODE -ne 0) { throw "Bundling failed for $loopName." }
    # Explicit npm: imports work in the single-file dashboard without an import map.
    $loopCode = [System.IO.File]::ReadAllText((Join-Path $loopRepo $loopArtifact)).Replace('from"jspdf"', 'from"npm:jspdf@4.2.1"').Replace('from"docx"', 'from"npm:docx@9.9.0"')
    if ($loopCode.Contains('from"jspdf"') -or $loopCode.Contains('from"docx"')) { throw 'A library import was not converted to its pinned Deno specifier.' }
    [System.IO.File]::WriteAllText((Join-Path $loopRepo $loopArtifact), $loopCode, [System.Text.UTF8Encoding]::new($false))
    $loopBytes = (Get-Item -LiteralPath $loopArtifact).Length
    if ($loopBytes -gt 5000000) { throw "$loopName exceeds the dashboard's 5 MB bundle limit. Use a separately authenticated official CLI deployment; do not paste a truncated bundle." }
    $loopSources = @('src/lib/admin-types.ts', 'src/lib/marketing-types.ts', 'src/lib/employer-discovery.ts', 'package-lock.json', 'scripts/build-job-loop-ui.ps1', 'scripts/source-text-hash.mjs', 'scripts/read-edge-deploy-chunk.mjs') + $loopShared + $loopHandlers
    $loopHashes = @($loopSources | ForEach-Object { @{ path = $_; sha256 = Get-LoopNormalizedTextHash (Join-Path $loopRepo $_) } })
    $loopManifest += @{ function = $loopName; artifact = $loopArtifact; bytes = $loopBytes; sha256 = (Get-FileHash -LiteralPath $loopArtifact -Algorithm SHA256).Hash.ToLowerInvariant(); sources = $loopHashes }
  }
  $loopMigrations = @(Get-ChildItem -LiteralPath 'supabase/migrations' -File | Where-Object { $_.Name -match '_job_loop_|_jobvance_admin_|_jobvance_marketing_|_jobvance_analytics' } | Sort-Object Name | ForEach-Object { @{ path = 'supabase/migrations/' + $_.Name; sha256 = Get-LoopNormalizedTextHash $_.FullName } })
  $loopJson = @{ generator = $loopGenerator; hashAlgorithms = @{ artifact = 'sha256-bytes'; source = 'sha256-utf8-lf-no-bom'; migration = 'sha256-utf8-lf-no-bom' }; externalImport = $loopExternal; externalPackages = @('npm:jspdf@4.2.1', 'npm:docx@9.9.0'); bundles = $loopManifest; migrations = $loopMigrations } | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText((Join-Path $loopOutput 'manifest.json'), $loopJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
} finally { Pop-Location }
