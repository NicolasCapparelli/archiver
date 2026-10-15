$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path $workspaceRoot ('target\install-test-' + [guid]::NewGuid())
$profiles = Join-Path $testRoot 'documents'
$adapters = Join-Path $testRoot 'adapters'
[IO.Directory]::CreateDirectory((Join-Path $profiles 'WindowsPowerShell')) | Out-Null
$profilePath = Join-Path $profiles 'WindowsPowerShell\profile.ps1'
$original = "# Preserve my profile`r`n`$userSetting = 'keep me'`r`n"
[IO.File]::WriteAllText($profilePath, $original)
$installer = Join-Path $workspaceRoot 'integrations\install.ps1'
# Mock Clink only: never touches CMD registry or installs software during tests.
$mock = Join-Path $testRoot 'mock-clink.ps1'
$log = Join-Path $testRoot 'clink.log'
$mockBody = "Add-Content -LiteralPath '$($log.Replace("'", "''"))' -Value (`$args -join '|')`r`n`$global:LASTEXITCODE = 0"
[IO.File]::WriteAllText($mock, $mockBody)
& $installer -InstallRoot $adapters -ProfileRoot $profiles -ClinkPath $mock
$first = [IO.File]::ReadAllText($profilePath)
& $installer -InstallRoot $adapters -ProfileRoot $profiles -ClinkPath $mock
if ([IO.File]::ReadAllText($profilePath) -ne $first) { throw 'Setup was not idempotent' }
if (-not $first.StartsWith($original) -or ([regex]::Matches($first, '# BEGIN ARCHIVER INTEGRATION')).Count -ne 1) { throw 'User profile content or managed block damaged' }
if ([IO.File]::ReadAllText("$profilePath.archiver-backup") -ne $original) { throw 'Original backup changed' }
if (-not (Test-Path -LiteralPath (Join-Path $profiles 'PowerShell\profile.ps1'))) { throw 'PowerShell 7 profile missing' }
if (-not (Test-Path -LiteralPath (Join-Path $adapters 'archiver.lua'))) { throw 'CMD adapter not copied' }
& $installer -Uninstall -InstallRoot $adapters -ProfileRoot $profiles -ClinkPath $mock
if ([IO.File]::ReadAllText($profilePath) -ne $original) { throw 'Uninstall did not preserve original profile' }
$calls = [IO.File]::ReadAllText($log)
if (-not $calls.Contains('installscripts|') -or -not $calls.Contains('autorun|install') -or -not $calls.Contains('uninstallscripts|') -or $calls.Contains('autorun|uninstall')) { throw 'Incorrect Clink commands' }
if (Test-Path -LiteralPath (Join-Path $adapters 'archiver.ps1')) { throw 'Adapter not removed' }
$previewRoot = Join-Path $testRoot 'preview'
& $installer -WhatIf -SkipCmd -InstallRoot $previewRoot -ProfileRoot (Join-Path $testRoot 'preview-profiles')
if (Test-Path -LiteralPath $previewRoot) { throw 'WhatIf changed disk' }
# Only remove the exact generated workspace test directory after containment validation.
$resolvedTest = [IO.Path]::GetFullPath($testRoot)
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'target')) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedTest.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cleanup escaped workspace' }
Remove-Item -LiteralPath $resolvedTest -Recurse -Force
'Shell installer: both profiles, idempotency, backups, CMD registration, uninstall, and WhatIf passed.'
