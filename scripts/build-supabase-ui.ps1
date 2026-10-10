param([switch]$Verify)
$ErrorActionPreference = 'Stop'
$uiRepoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$uiBundleRoot = [System.IO.Path]::GetFullPath((Join-Path $uiRepoRoot 'docs/supabase-ui'))
if (-not $uiBundleRoot.StartsWith($uiRepoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The generated bundle directory must stay inside this repository.'
}
$uiFunctions = @('tailor-cv','get-entitlement','create-checkout','paddle-webhook','stripe-webhook','trigger-make-run','check-email-provider','lemon-squeezy-webhook')
$uiExternal = 'https://esm.sh/@supabase/supabase-js@2.57.4'
$uiManifestBundles = @()
New-Item -ItemType Directory -Path $uiBundleRoot -Force | Out-Null
Push-Location -LiteralPath $uiRepoRoot
try {
  foreach ($uiFunction in $uiFunctions) {
    $uiEntry = "supabase/functions/$uiFunction/index.ts"
    $uiArtifact = "docs/supabase-ui/$uiFunction.js"
    & npm.cmd exec --yes --package deno@2.9.6 -- deno bundle --platform=deno "--external=$uiExternal" "--output=$uiArtifact" $uiEntry
    if ($LASTEXITCODE -ne 0) { throw "Bundling failed for $uiFunction." }
    $uiDependencies = @($uiEntry)
    if ($uiFunction -in @('trigger-make-run','check-email-provider','lemon-squeezy-webhook')) { $uiDependencies += 'supabase/functions/retired-response.ts' }
    else {
      $uiDependencies += @('supabase/functions/_shared/core.ts','supabase/functions/_shared/runtime.ts')
      if ($uiFunction -in @('create-checkout','paddle-webhook')) { $uiDependencies += 'supabase/functions/_shared/paddle.ts' }
    }
    $uiSourceHashes = @($uiDependencies | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $uiRepoRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant() } })
    $uiManifestBundles += @{ function = $uiFunction; artifact = $uiArtifact; sha256 = (Get-FileHash -LiteralPath (Join-Path $uiRepoRoot $uiArtifact) -Algorithm SHA256).Hash.ToLowerInvariant(); sources = $uiSourceHashes }
  }
  $uiManifest = @{ generator = 'deno@2.9.6 bundle --platform=deno'; externalImport = $uiExternal; bundles = $uiManifestBundles }
  $uiManifestJson = $uiManifest | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText((Join-Path $uiBundleRoot 'manifest.json'), $uiManifestJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  if ($Verify) {
    $uiPreviousTestFlag = $env:JOBVANCE_TEST_UI_BUNDLES
    try {
      $env:JOBVANCE_TEST_UI_BUNDLES = 'true'
      & npm.cmd exec --yes --package deno@2.9.6 -- deno test --allow-env supabase/tests/edge-auth.deno.ts supabase/tests/retirement.deno.ts
      if ($LASTEXITCODE -ne 0) { throw 'Generated handler verification failed.' }
    } finally {
      if ($null -eq $uiPreviousTestFlag) { Remove-Item Env:JOBVANCE_TEST_UI_BUNDLES -ErrorAction SilentlyContinue }
      else { $env:JOBVANCE_TEST_UI_BUNDLES = $uiPreviousTestFlag }
    }
  }
} finally { Pop-Location }
