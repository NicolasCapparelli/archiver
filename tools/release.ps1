[CmdletBinding()]
param([string]$CertificateThumbprint,[string]$UpdateEndpoint,[string]$UpdatePublicKey,[switch]$Unsigned)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
if (-not $Unsigned -and -not $CertificateThumbprint) {throw 'Supply a certificate thumbprint from your Windows certificate store, or explicitly choose -Unsigned for a local test installer.'}
if ($CertificateThumbprint -and $CertificateThumbprint -notmatch '^[a-fA-F0-9]{40}$') {throw 'Invalid certificate thumbprint.'}
if ($UpdateEndpoint -and (-not $UpdatePublicKey -or -not $env:TAURI_SIGNING_PRIVATE_KEY)) {throw 'Updates require the public key and TAURI_SIGNING_PRIVATE_KEY set locally. Never put private keys into this repository.'}
if ($UpdatePublicKey -and -not $UpdateEndpoint) {throw 'Supply the HTTPS update endpoint with its public key.'}
if ($UpdateEndpoint -and ([uri]$UpdateEndpoint).Scheme -ne 'https') {throw 'Updates require HTTPS.'}
$env:CARGO_TARGET_DIR=Join-Path $root 'target'
$env:ARCHIVER_UPDATE_ENDPOINT=$UpdateEndpoint
$env:ARCHIVER_UPDATE_PUBLIC_KEY=$UpdatePublicKey
$cargo=Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
$env:PATH="$(Split-Path $cargo -Parent);$env:PATH"
& $cargo build --manifest-path src-tauri/Cargo.toml --release --bin archiverctl
if ($LASTEXITCODE) {throw 'CLI build failed.'}
$overlay=@{bundle=@{active=$true;targets=@('nsis');createUpdaterArtifacts=[bool]$UpdateEndpoint;windows=@{}}}
if($CertificateThumbprint){$overlay.bundle.windows=@{certificateThumbprint=$CertificateThumbprint;digestAlgorithm='sha256';timestampUrl='http://timestamp.digicert.com'}}
$config=Join-Path $root 'target\release-config.json'
[IO.File]::WriteAllText($config,($overlay|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
& node node_modules/@tauri-apps/cli/tauri.js build --config src-tauri/tauri.release.conf.json --config $config
if($LASTEXITCODE){throw 'Installer build failed.'}
Write-Host 'Installer is in target/release/bundle/nsis. Publish only after signing and interactive release validation.'
