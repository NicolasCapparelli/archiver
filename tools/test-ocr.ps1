param([switch]$KeepFixture)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$testDir=Join-Path $root ('target\ocr-test-'+[guid]::NewGuid().ToString())
$null=New-Item -ItemType Directory -Path $testDir
try {
    Add-Type -AssemblyName System.Drawing
    $bitmap=[Drawing.Bitmap]::new(900,180)
    $graphics=[Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.Color]::White)
    $font=[Drawing.Font]::new('Arial',36)
    $graphics.DrawString('ORBITAL ARCHIVE 42',$font,[Drawing.Brushes]::Black,20,50)
    $image=Join-Path $testDir 'fixture.png'
    $bitmap.Save($image,[Drawing.Imaging.ImageFormat]::Png)
    if($KeepFixture){Copy-Item -LiteralPath $image -Destination (Join-Path $root 'target\ocr-fixture.png') -Force}
    $font.Dispose();$graphics.Dispose();$bitmap.Dispose()
    $script=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ocr-windows.ps1'))
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $info.Arguments="-NoLogo -NoProfile -NonInteractive -EncodedCommand $encoded"
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $process=[Diagnostics.Process]::Start($info)
    $process.StandardInput.Write((@{path=$image}|ConvertTo-Json -Compress));$process.StandardInput.Close()
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(40000)){$process.Kill();throw 'OCR test timed out'}
    if($process.ExitCode){throw $errors.Result}
    $result=$output.Result | ConvertFrom-Json
    if($result.text -notmatch 'ORBITAL ARCHIVE 42'){throw "OCR fixture mismatch: $($result.text)"}
    Write-Output "Windows OCR fixture passed ($($result.language)): $($result.text)"
} finally {
    $resolved=[IO.Path]::GetFullPath($testDir)
    $allowed=[IO.Path]::GetFullPath((Join-Path $root 'target'))+[IO.Path]::DirectorySeparatorChar
    if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
