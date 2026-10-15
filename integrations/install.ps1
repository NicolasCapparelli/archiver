# One-time, current-user setup. Run from PowerShell; restart shells afterwards.
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Uninstall,
    [switch]$SkipCmd,
    [string]$ClinkPath,
    [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'app.archiver.desktop\integrations'),
    [string]$ProfileRoot = ([Environment]::GetFolderPath('MyDocuments'))
)
$ErrorActionPreference = 'Stop'
$begin = '# BEGIN ARCHIVER INTEGRATION'
$end = '# END ARCHIVER INTEGRATION'
$pattern = '(?ms)^# BEGIN ARCHIVER INTEGRATION\r?\n.*?^# END ARCHIVER INTEGRATION(?:\r?\n|$)'
$adapter = Join-Path $InstallRoot 'archiver.ps1'
$lua = Join-Path $InstallRoot 'archiver.lua'

function Find-Clink {
    if ($ClinkPath) {
        if (-not (Test-Path -LiteralPath $ClinkPath -PathType Leaf)) { throw "Clink not found at $ClinkPath" }
        return $ClinkPath
    }
    foreach ($name in @('clink.exe', 'clink_x64.exe', 'clink.bat')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    $locations = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\clink'),
        (Join-Path $env:ProgramFiles 'clink'),
        (Join-Path ${env:ProgramFiles(x86)} 'clink')
    )
    foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        $locations += @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Clink*' -and $_.InstallLocation } | ForEach-Object InstallLocation)
    }
    foreach ($directory in $locations) {
        foreach ($name in @('clink_x64.exe', 'clink.exe', 'clink.bat', 'clink_x86.exe')) {
            $candidate = Join-Path $directory $name
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        }
    }
}
function Invoke-Clink([string[]]$Arguments) {
    & $script:resolvedClink @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Clink failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}

if (-not $Uninstall -and $PSCmdlet.ShouldProcess($InstallRoot, 'Copy stable shell adapters')) {
    [IO.Directory]::CreateDirectory($InstallRoot) | Out-Null
    foreach ($name in @('archiver.ps1', 'archiver.lua')) {
        $source = Join-Path $PSScriptRoot $name
        $destination = Join-Path $InstallRoot $name
        if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($destination)) { Copy-Item -LiteralPath $source -Destination $destination -Force }
    }
}
foreach ($shell in @('WindowsPowerShell', 'PowerShell')) {
    $profilePath = Join-Path (Join-Path $ProfileRoot $shell) 'profile.ps1'
    $original = if (Test-Path -LiteralPath $profilePath) { [IO.File]::ReadAllText($profilePath) } else { '' }
    $content = [regex]::Replace($original, $pattern, '')
    if (-not $Uninstall) {
        if ($content -and -not $content.EndsWith("`n")) { $content += "`r`n" }
        $quotedAdapter = $adapter.Replace("'", "''")
        $content += "$begin`r`nif (`$Host.Name -eq 'ConsoleHost' -and (Test-Path -LiteralPath '$quotedAdapter')) { . '$quotedAdapter' }`r`n$end`r`n"
    }
    if ($content -ne $original -and $PSCmdlet.ShouldProcess($profilePath, $(if ($Uninstall) { 'Remove Archiver block' } else { 'Install Archiver block (back up existing profile)' }))) {
        [IO.Directory]::CreateDirectory((Split-Path $profilePath -Parent)) | Out-Null
        if ((Test-Path -LiteralPath $profilePath) -and -not (Test-Path -LiteralPath "$profilePath.archiver-backup")) {
            Copy-Item -LiteralPath $profilePath -Destination "$profilePath.archiver-backup"
        }
        [IO.File]::WriteAllText($profilePath, $content, [Text.UTF8Encoding]::new($true))
    }
    Write-Host "$shell profile: $profilePath"
}
if (-not $SkipCmd) {
    $script:resolvedClink = Find-Clink
    if (-not $script:resolvedClink -and -not $Uninstall) {
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
            throw 'PowerShell setup completed. CMD needs Clink: install it from https://chrisant996.github.io/clink/ then rerun this script. Windows Package Manager (winget) was unavailable.'
        }
        if ($PSCmdlet.ShouldProcess('chrisant996.Clink', 'Install Clink using Windows Package Manager')) {
            & winget.exe install --id chrisant996.Clink --exact --source winget --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -ne 0) { throw "PowerShell setup completed; Clink installation failed ($LASTEXITCODE). Rerun after installing Clink." }
            $script:resolvedClink = Find-Clink
            if (-not $script:resolvedClink) { throw 'Clink installed but could not be located. Rerun with -ClinkPath followed by the path to clink_x64.exe.' }
        }
    }
    if ($script:resolvedClink -and $PSCmdlet.ShouldProcess($InstallRoot, $(if ($Uninstall) { 'Unregister Archiver CMD adapter' } else { 'Register Archiver CMD adapter and enable Clink autorun for this user' }))) {
        if ($Uninstall) { Invoke-Clink @('uninstallscripts', $InstallRoot) }
        else {
            Invoke-Clink @('installscripts', $InstallRoot)
            Invoke-Clink @('autorun', 'install')
            Invoke-Clink @('set', 'cmd.get_errorlevel', 'true')
        }
    }
}
if ($Uninstall -and $PSCmdlet.ShouldProcess($InstallRoot, 'Remove Archiver adapter files')) {
    foreach ($path in @($adapter, $lua)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path } }
    # Clink itself and its autorun stay installed; other scripts may depend on them.
}
if ($WhatIfPreference) { Write-Host 'Preview only: no changes made.' }
elseif ($Uninstall) { Write-Host 'Archiver shell hooks removed. Restart existing shells. Clink and unrelated profile content are retained.' }
else { Write-Host 'Archiver shell setup complete. Restart PowerShell and CMD. Custom Enter bindings are preserved; settings may block profile loading under a restrictive execution policy.' }
