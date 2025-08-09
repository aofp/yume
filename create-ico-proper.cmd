@echo off
echo Creating proper ICO file with multiple resolutions...

REM Use Windows built-in tools to create a proper ICO
powershell -Command ^
"Add-Type -AssemblyName System.Drawing; ^
$sizes = @(256, 128, 64, 48, 32, 24, 16); ^
$images = @(); ^
$original = [System.Drawing.Image]::FromFile('yurucode.png'); ^
foreach ($size in $sizes) { ^
    $bitmap = New-Object System.Drawing.Bitmap $size, $size; ^
    $g = [System.Drawing.Graphics]::FromImage($bitmap); ^
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; ^
    $g.DrawImage($original, 0, 0, $size, $size); ^
    $images += $bitmap; ^
    $g.Dispose(); ^
}; ^
$ms = New-Object System.IO.MemoryStream; ^
$writer = New-Object System.IO.BinaryWriter $ms; ^
$writer.Write([byte]0); $writer.Write([byte]0); ^
$writer.Write([uint16]1); ^
$writer.Write([uint16]$images.Count); ^
$offset = 6 + (16 * $images.Count); ^
$imageData = @(); ^
foreach ($img in $images) { ^
    $imgMs = New-Object System.IO.MemoryStream; ^
    $img.Save($imgMs, [System.Drawing.Imaging.ImageFormat]::Png); ^
    $data = $imgMs.ToArray(); ^
    $imageData += ,@($data); ^
    $writer.Write([byte]$img.Width); ^
    $writer.Write([byte]$img.Height); ^
    $writer.Write([byte]0); ^
    $writer.Write([byte]0); ^
    $writer.Write([uint16]1); ^
    $writer.Write([uint16]32); ^
    $writer.Write([uint32]$data.Length); ^
    $writer.Write([uint32]$offset); ^
    $offset += $data.Length; ^
    $imgMs.Dispose(); ^
}; ^
foreach ($data in $imageData) { ^
    $writer.Write($data); ^
}; ^
$writer.Flush(); ^
[System.IO.File]::WriteAllBytes('assets\yurucode_new.ico', $ms.ToArray()); ^
$ms.Dispose(); ^
$writer.Dispose(); ^
foreach ($img in $images) { $img.Dispose(); }; ^
$original.Dispose(); ^
Write-Host 'Created assets\yurucode_new.ico'"

echo Done!