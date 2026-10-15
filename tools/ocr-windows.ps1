$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$stream=$null;$bitmap=$null
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
    $null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
    $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
    $null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
    $null=[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
    $null=[Windows.Media.Ocr.OcrResult,Windows.Media.Ocr,ContentType=WindowsRuntime]
    $asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await($operation,[Type]$type) {
        $task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation))
        if(-not $task.Wait(15000)){throw 'Windows OCR operation timed out'}
        return $task.Result
    }
    $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
    $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if(-not $engine){throw 'No OCR language is installed for your Windows profile. Add a supported language in Windows Settings.'}
    $file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($request.path)) ([Windows.Storage.StorageFile])
    $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    if($bitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $bitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension){throw 'Image exceeds the installed OCR engine dimension limit'}
    $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    [Console]::Write((@{text=($result.Lines | ForEach-Object {$_.Text}) -join "`n";language=$engine.RecognizerLanguage.LanguageTag} | ConvertTo-Json -Compress))
} catch {
    $failure=$_.Exception
    while($failure.InnerException){$failure=$failure.InnerException}
    [Console]::Error.Write($failure.Message)
    exit 1
} finally {
    if($bitmap){$bitmap.Dispose()}
    if($stream){$stream.Dispose()}
}
