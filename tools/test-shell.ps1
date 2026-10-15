$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
# Loading the handler only affects this isolated PowerShell process, never a profile file.
$testSpool = Join-Path $workspaceRoot ('target\shell-test-' + [guid]::NewGuid().ToString())
[IO.Directory]::CreateDirectory($testSpool) | Out-Null
. (Join-Path $workspaceRoot 'integrations\archiver.ps1') -DataRoot $testSpool
if (-not (Get-Command Write-ArchiverCommand -ErrorAction SilentlyContinue)) { throw 'PowerShell hook was not installed' }
$global:ArchiverSpool = $testSpool
$global:ArchiverStatePath = Join-Path $testSpool 'capture-state.settings'
$expectedCommand = "Write-Output 'quote and backslash \'`nsecond line"
Write-ArchiverCommand -Command $expectedCommand -Directory 'C:\project with spaces' -Timestamp 123456789
$files = @(Get-ChildItem -LiteralPath $testSpool -Filter '*.json')
if ($files.Count -ne 1) { throw 'Expected exactly one published event' }
$data = [IO.File]::ReadAllText($files[0].FullName) | ConvertFrom-Json
if ($data.text -ne $expectedCommand -or $data.directory -ne 'C:\project with spaces' -or $data.timestamp -ne 123456789 -or $data.sequence -ne 1 -or $data.kind -ne 'command') { throw 'Command metadata did not round-trip' }
Write-ArchiverCommand -Command ' ' -Directory 'C:\unused'
if (@(Get-ChildItem -LiteralPath $testSpool -Filter '*.json').Count -ne 1) { throw 'Empty command should not be published' }
[IO.File]::WriteAllText($global:ArchiverStatePath, '{"paused":true}')
Write-ArchiverCommand -Command 'should not be captured' -Directory 'C:\unused'
if (@(Get-ChildItem -LiteralPath $testSpool -Filter '*.json').Count -ne 1) { throw 'Paused command should not be published' }
$testStatePath = $global:ArchiverStatePath
$testFilePath = $files[0].FullName
$requestId = [guid]::NewGuid().ToString()
$insertionPath = Join-Path $global:ArchiverRoot "insert-$($global:ArchiverSession).txt"
$expires = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 5
$insertText = "Write-Output 'Unicode satellite: $([char]0x2604)'`nGet-Date`n"
[IO.File]::WriteAllText($insertionPath, "$requestId $expires`n$insertText", [Text.UTF8Encoding]::new($false))
$script:inserted = $null
Receive-ArchiverInsertion -Insert { param($Text) $script:inserted = $Text }
if ($script:inserted -ne $insertText -or [IO.File]::ReadAllText("$insertionPath.ack") -ne $requestId -or (Test-Path -LiteralPath $insertionPath)) { throw 'Multiline insertion did not edit/acknowledge exactly once' }
$script:inserted = $null
Receive-ArchiverInsertion -Insert { param($Text) $script:inserted = $Text }
if ($null -ne $script:inserted) { throw 'Insertion replayed' }
[IO.File]::WriteAllText($insertionPath, "$requestId 1`nexpired")
Receive-ArchiverInsertion -Insert { param($Text) $script:inserted = $Text }
if ($null -ne $script:inserted) { throw 'Expired insertion accepted' }
Remove-Item -LiteralPath "$insertionPath.ack"
Remove-Item -LiteralPath $testStatePath
Write-ArchiverCommand -Command 'native failure' -Directory 'C:\project' -Native $true
$global:ArchiverOriginalPrompt = { $script:promptSawStatus = $?; 'test prompt' }
$global:LASTEXITCODE = 7
Write-Error 'isolated expected failure' -ErrorAction SilentlyContinue
prompt | Out-Null
$resultPath = Join-Path $testSpool "$($global:ArchiverSession)-2-result.json"
$nativeCommandPath = Join-Path $testSpool "$($global:ArchiverSession)-2.json"
$result = [IO.File]::ReadAllText($resultPath) | ConvertFrom-Json
if ($result.successful -ne $false -or $result.exitCode -ne 7 -or $result.durationMs -lt 0 -or $global:LASTEXITCODE -ne 7 -or $script:promptSawStatus -ne $false) { throw 'Prompt/status/duration completion did not round-trip' }
Remove-Item -LiteralPath $resultPath
Remove-Item -LiteralPath $nativeCommandPath
Disconnect-Archiver
if ((Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq 'Enter' } | Select-Object -First 1).Function -ne 'AcceptLine') { throw 'Original Enter handler was not restored' }
Remove-Item -LiteralPath $testFilePath
Remove-Item -LiteralPath (Join-Path $testSpool 'shell-spool')
Remove-Item -LiteralPath (Join-Path $testSpool 'shell-sessions')
Remove-Item -LiteralPath $testSpool
'PowerShell adapter: metadata, pause, multiline insertion/acknowledgement, replay/expiry rejection, and handler restoration passed.'
