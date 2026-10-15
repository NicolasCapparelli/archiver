# Dot-source this file after PSReadLine is loaded. Does not modify profile files automatically.
# Prototype coverage: normal Enter / AcceptLine; custom Enter and alternate submission paths are not overridden.
param([string]$DataRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'app.archiver.desktop'))
if (Get-Variable ArchiverSession -Scope Global -ErrorAction SilentlyContinue) { return }
Import-Module PSReadLine -ErrorAction Stop
$archiverEnter = Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq 'Enter' } | Select-Object -First 1
if ($archiverEnter.Function -ne 'AcceptLine') {
    Write-Warning 'Archiver: custom Enter binding detected; integration not installed to preserve your editing behavior.'
    return
}
$global:ArchiverSession = [guid]::NewGuid().ToString()
$global:ArchiverSequence = 0L
$global:ArchiverSpool = Join-Path $DataRoot 'shell-spool'
$global:ArchiverStatePath = Join-Path (Split-Path $global:ArchiverSpool -Parent) 'capture-state.json'
[IO.Directory]::CreateDirectory($global:ArchiverSpool) | Out-Null
$global:ArchiverRoot = Split-Path $global:ArchiverSpool -Parent
$global:ArchiverSessionDirectory = Join-Path $global:ArchiverRoot 'shell-sessions'
[IO.Directory]::CreateDirectory($global:ArchiverSessionDirectory) | Out-Null
$global:ArchiverInsertChord = 'Ctrl+x,Ctrl+a'
$global:ArchiverPreviousInsertBinding = Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq $global:ArchiverInsertChord } | Select-Object -First 1
$global:ArchiverInsertionEnabled = -not $global:ArchiverPreviousInsertBinding
function global:Update-ArchiverSession {
    param([bool]$Ready = $true)
    $data = @{ session = $global:ArchiverSession; source = "PowerShell $($PSVersionTable.PSVersion)"; pid = $PID;
        directory = (Get-Location).Path; ready = $Ready; insertion = $global:ArchiverInsertionEnabled; updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    $path = Join-Path $global:ArchiverSessionDirectory "$($global:ArchiverSession).json"
    try {
        $pending = "$path.pending"
        [IO.File]::WriteAllText($pending, ($data | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        if ([IO.File]::Exists($path)) { [IO.File]::Replace($pending, $path, [System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($pending, $path) }
    }
    catch { Write-Warning "Archiver: shell session could not be updated." }
}
function global:Receive-ArchiverInsertion {
    param([scriptblock]$Insert = { param($Text) [Microsoft.PowerShell.PSConsoleReadLine]::Insert($Text) })
    $path = Join-Path $global:ArchiverRoot "insert-$($global:ArchiverSession).txt"
    if (-not [IO.File]::Exists($path)) { return }
    try {
        $data = [IO.File]::ReadAllText($path)
        [IO.File]::Delete($path)
        $parts = $data.Split(@("`n"), 2, [StringSplitOptions]::None)
        $header = $parts[0].Split(' ')
        if ($parts.Count -ne 2 -or $header.Count -ne 2 -or [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -gt [long]$header[1]) { return }
        $requestId = [guid]::Parse($header[0]).ToString()
        # Insert edits PSReadLine's buffer; neither AcceptLine nor an Enter key is invoked.
        & $Insert $parts[1]
        [IO.File]::WriteAllText("$path.ack", $requestId, [Text.UTF8Encoding]::new($false))
    } catch { Write-Warning "Archiver: insertion was not completed; no automatic retry." }
}
if ($global:ArchiverInsertionEnabled) {
    Set-PSReadLineKeyHandler -Chord $global:ArchiverInsertChord -BriefDescription ArchiverInsert -Description 'Insert staged Archiver text without accepting the line' -ScriptBlock { Receive-ArchiverInsertion }
} else { Write-Warning 'Archiver: Ctrl+X, Ctrl+A is already bound; command insertion disabled to preserve that binding.' }
$global:ArchiverOriginalPrompt = $function:prompt
function global:prompt {
    param([bool]$ArchiverLastSuccess = $?, $ArchiverLastExitCode = $global:LASTEXITCODE)
    # Invoke the user's prompt first, so its inspection of $? sees command status.
    $output = & $global:ArchiverOriginalPrompt
    if ($global:ArchiverPendingCommand) {
        $pending = $global:ArchiverPendingCommand
        $duration = $pending.watch.ElapsedMilliseconds
        $history = Get-History -Count 1
        if ($history -and $history.CommandLine -eq $pending.text) { $duration = [long]($history.EndExecutionTime - $history.StartExecutionTime).TotalMilliseconds }
        $nativeExit = $null
        if ($pending.native) { $nativeExit = $ArchiverLastExitCode }
        Write-ArchiverResult -Sequence $pending.sequence -Successful $ArchiverLastSuccess -ExitCode $nativeExit -DurationMs ([Math]::Max(0, $duration))
        $global:ArchiverPendingCommand = $null
    }
    Update-ArchiverSession
    $global:LASTEXITCODE = $ArchiverLastExitCode
    $output
}
Update-ArchiverSession

function global:Write-ArchiverCommand {
    param([string]$Command, [string]$Directory, [long]$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), [bool]$Native = $false)
    if ([string]::IsNullOrWhiteSpace($Command)) { return }
    if ([IO.File]::Exists($global:ArchiverStatePath)) {
        try { if (([IO.File]::ReadAllText($global:ArchiverStatePath) | ConvertFrom-Json).paused) { return } }
        catch { Write-Warning "Archiver: could not read capture policy; command not captured."; return }
    }
    $global:ArchiverSequence++
    $eventData = @{ kind = 'command'; text = $Command; source = "PowerShell $($PSVersionTable.PSVersion)";
        timestamp = $Timestamp; directory = $Directory; session = $global:ArchiverSession; sequence = $global:ArchiverSequence }
    $eventName = "$($global:ArchiverSession)-$($global:ArchiverSequence)"
    $pendingPath = Join-Path $global:ArchiverSpool "$eventName.pending"
    $readyPath = Join-Path $global:ArchiverSpool "$eventName.json"
    try {
        $json = ConvertTo-Json -InputObject $eventData -Compress
        [IO.File]::WriteAllText($pendingPath, $json, [Text.UTF8Encoding]::new($false))
        [IO.File]::Move($pendingPath, $readyPath)
        $global:ArchiverPendingCommand = @{ sequence = $global:ArchiverSequence; text = $Command; native = $Native; watch = [Diagnostics.Stopwatch]::StartNew() }
    } catch { Write-Warning "Archiver: command could not be saved: $($_.Exception.Message)" }
}
function global:Write-ArchiverResult {
    param([long]$Sequence, [bool]$Successful, $ExitCode, [long]$DurationMs)
    $event = @{ kind = 'command_result'; session = $global:ArchiverSession; sequence = $Sequence; successful = $Successful; exitCode = $ExitCode; durationMs = $DurationMs }
    $path = Join-Path $global:ArchiverSpool "$($global:ArchiverSession)-$Sequence-result.json"
    try {
        [IO.File]::WriteAllText("$path.pending", ($event | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        [IO.File]::Move("$path.pending", $path)
    } catch { Write-Warning 'Archiver: command completion could not be saved.' }
}

Set-PSReadLineKeyHandler -Chord Enter -BriefDescription ArchiverAcceptLine -Description 'Capture accepted input and use the original AcceptLine behavior' -ScriptBlock {
    param($key, $arg)
    $line = $null; $cursor = 0
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
    $tokens = $null; $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($line, [ref]$tokens, [ref]$parseErrors)
    if (-not ($parseErrors | Where-Object IncompleteInput)) {
        $native = $false
        if ($ast.EndBlock.Statements.Count -eq 1 -and $ast.EndBlock.Statements[0] -is [System.Management.Automation.Language.PipelineAst]) {
            $last = $ast.EndBlock.Statements[0].PipelineElements | Select-Object -Last 1
            if ($last -is [System.Management.Automation.Language.CommandAst] -and $last.GetCommandName()) {
                $resolved = Get-Command -Name $last.GetCommandName() -ErrorAction SilentlyContinue
                $native = $resolved -and $resolved.CommandType -eq 'Application'
            }
        }
        Write-ArchiverCommand -Command $line -Directory (Get-Location).Path -Native $native
        Update-ArchiverSession -Ready $false
    }
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine($key, $arg)
}

function global:Disconnect-Archiver {
    $binding = Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq 'Enter' } | Select-Object -First 1
    if ($binding.Function -eq 'ArchiverAcceptLine') { Set-PSReadLineKeyHandler -Chord Enter -Function AcceptLine }
    $insertBinding = Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq $global:ArchiverInsertChord } | Select-Object -First 1
    if ($insertBinding.Function -eq 'ArchiverInsert') { Remove-PSReadLineKeyHandler -Chord $global:ArchiverInsertChord }
    $function:global:prompt = $global:ArchiverOriginalPrompt
    $sessionPath = Join-Path $global:ArchiverSessionDirectory "$($global:ArchiverSession).json"
    if (Test-Path -LiteralPath $sessionPath) { Remove-Item -LiteralPath $sessionPath }
    Remove-Variable ArchiverRoot, ArchiverSessionDirectory, ArchiverInsertChord, ArchiverPreviousInsertBinding, ArchiverInsertionEnabled, ArchiverOriginalPrompt -Scope Global -ErrorAction SilentlyContinue
    Remove-Item Function:\Receive-ArchiverInsertion, Function:\Update-ArchiverSession -ErrorAction SilentlyContinue
    Remove-Variable ArchiverSession, ArchiverSequence, ArchiverSpool, ArchiverStatePath, ArchiverPendingCommand -Scope Global -ErrorAction SilentlyContinue
    Remove-Item Function:\Write-ArchiverResult -ErrorAction SilentlyContinue
    Remove-Item Function:\Write-ArchiverCommand -ErrorAction SilentlyContinue
}
