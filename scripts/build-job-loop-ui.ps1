param()
$ErrorActionPreference = 'Stop'
$loopRepo = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$loopOutput = [System.IO.Path]::GetFullPath((Join-Path $loopRepo 'docs/supabase-loop-ui'))
if (-not $loopOutput.StartsWith($loopRepo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Bundle output must remain in this repository.' }
$loopNames = @('job-loop-control', 'job-loop-worker', 'job-loop-oauth')
$loopExternal = 'https://esm.sh/@supabase/supabase-js@2.57.4'
$loopManifest = @()
New-Item -ItemType Directory -Path $loopOutput -Force | Out-Null
Push-Location -LiteralPath $loopRepo
try {
  $loopShared = @(Get-ChildItem -LiteralPath 'supabase/functions/_shared' -Filter 'job-loop*.ts' -File | Sort-Object Name | ForEach-Object { 'supabase/functions/_shared/' + $_.Name })
  $loopHandlers = @($loopNames | ForEach-Object {
    $loopDirectory = "supabase/functions/$_"
    Get-ChildItem -LiteralPath $loopDirectory -File | Sort-Object Name | ForEach-Object { $loopDirectory + '/' + $_.Name }
  })
  foreach ($loopName in $loopNames) {
    $loopEntry = "supabase/functions/$loopName/index.ts"
    $loopArtifact = "docs/supabase-loop-ui/$loopName.js"
    & npm.cmd exec --yes --package deno@2.9.6 -- deno bundle --config=supabase/functions/job-loop-worker/deno.json --platform=deno --minify --external=jspdf --external=docx "--external=$loopExternal" "--output=$loopArtifact" $loopEntry
    if ($LASTEXITCODE -ne 0) { throw "Bundling failed for $loopName." }
    # Explicit npm: imports work in the single-file dashboard without an import map.
    $loopCode = [System.IO.File]::ReadAllText((Join-Path $loopRepo $loopArtifact)).Replace('from"jspdf"', 'from"npm:jspdf@4.2.1"').Replace('from"docx"', 'from"npm:docx@9.9.0"')
    if ($loopCode.Contains('from"jspdf"') -or $loopCode.Contains('from"docx"')) { throw 'A library import was not converted to its pinned Deno specifier.' }
    [System.IO.File]::WriteAllText((Join-Path $loopRepo $loopArtifact), $loopCode, [System.Text.UTF8Encoding]::new($false))
    $loopBytes = (Get-Item -LiteralPath $loopArtifact).Length
    if ($loopBytes -gt 5000000) { throw "$loopName exceeds the dashboard's 5 MB bundle limit. Use a separately authenticated official CLI deployment; do not paste a truncated bundle." }
    $loopSources = @('supabase/functions/_shared/core.ts', 'supabase/functions/_shared/runtime.ts', 'package-lock.json') + $loopShared + $loopHandlers
    $loopHashes = @($loopSources | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() } })
    $loopManifest += @{ function = $loopName; artifact = $loopArtifact; bytes = $loopBytes; sha256 = (Get-FileHash -LiteralPath $loopArtifact -Algorithm SHA256).Hash.ToLowerInvariant(); sources = $loopHashes }
  }
  $loopJson = @{ generator = 'deno@2.9.6 bundle --config=supabase/functions/job-loop-worker/deno.json --platform=deno --minify --external=jspdf --external=docx; pin npm specifiers'; externalImport = $loopExternal; externalPackages = @('npm:jspdf@4.2.1', 'npm:docx@9.9.0'); bundles = $loopManifest } | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText((Join-Path $loopOutput 'manifest.json'), $loopJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
} finally { Pop-Location }
