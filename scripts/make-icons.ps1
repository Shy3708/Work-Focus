Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'

function New-OrbPng {
    param([int]$Size, [string]$OutFile)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $c = $Size / 2.0
    $r = $Size * 0.36

    # soft outer glow
    for ($i = 6; $i -ge 1; $i--) {
        $rr = $r + ($Size * 0.030 * $i)
        $alpha = [int](44 / $i)
        $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 87, 190, 255))
        $g.FillEllipse($glow, [single]($c - $rr), [single]($c - $rr), [single]($rr * 2), [single]($rr * 2))
        $glow.Dispose()
    }

    # radial body
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rect = New-Object System.Drawing.RectangleF([single]($c - $r), [single]($c - $r), [single]($r * 2), [single]($r * 2))
    $shape.AddEllipse($rect)
    $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($shape)
    $brush.CenterPoint = New-Object System.Drawing.PointF([single]($c - $r * 0.28), [single]($c - $r * 0.34))
    $brush.CenterColor = [System.Drawing.Color]::FromArgb(255, 241, 253, 255)
    $brush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(255, 36, 108, 182))
    $brush.FocusScales = New-Object System.Drawing.PointF([single]0.45, [single]0.45)
    $g.FillPath($brush, $shape)

    # ice blue mid layer
    $halo = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 133, 220, 255))
    $hr = $r * 1.0
    $g.FillEllipse($halo, [single]($c - $hr), [single]($c - $hr), [single]($hr * 2), [single]($hr * 2))

    # rim light
    $penWidth = [single]([Math]::Max(1, $Size / 128))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 222, 247, 255), $penWidth)
    $g.DrawEllipse($pen, $rect)

    # specular dot
    $specR = $r * 0.42
    $spec = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
    $g.FillEllipse($spec, [single]($c - $r * 0.62), [single]($c - $r * 0.78), [single]($specR), [single]($specR))

    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pen.Dispose()
    $halo.Dispose()
    $spec.Dispose()
    $brush.Dispose()
    $shape.Dispose()
}

function Write-Ico {
    param([object[]]$Entries, [string]$OutPath)

    $count = $Entries.Count
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]$count)

    $offset = 6 + (16 * $count)
    $payloads = @()
    foreach ($entry in $Entries) {
        $bytes = [System.IO.File]::ReadAllBytes($entry.Path)
        $payloads += , $bytes
        $dim = $entry.Size
        if ($entry.Size -ge 256) { $dim = 0 }
        $bw.Write([Byte]$dim)
        $bw.Write([Byte]$dim)
        $bw.Write([Byte]0)
        $bw.Write([Byte]0)
        $bw.Write([UInt16]1)
        $bw.Write([UInt16]32)
        $bw.Write([UInt32]$bytes.Length)
        $bw.Write([UInt32]$offset)
        $offset += $bytes.Length
    }
    foreach ($payload in $payloads) {
        $bw.Write([byte[]]$payload)
    }
    $bw.Flush()
    [System.IO.File]::WriteAllBytes($OutPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
}

$appSizes = @(16, 32, 48, 256)
$appEntries = @()
foreach ($s in $appSizes) {
    $p = Join-Path $assets "app-icon-$s.png"
    New-OrbPng -Size $s -OutFile $p
    $appEntries += [pscustomobject]@{ Path = $p; Size = $s }
}
Write-Ico -Entries $appEntries -OutPath (Join-Path $assets 'app-icon.ico')

$traySizes = @(16, 32)
$trayEntries = @()
foreach ($s in $traySizes) {
    $p = Join-Path $assets "tray-icon-$s.png"
    New-OrbPng -Size $s -OutFile $p
    $trayEntries += [pscustomobject]@{ Path = $p; Size = $s }
}
Write-Ico -Entries $trayEntries -OutPath (Join-Path $assets 'tray-icon.ico')

foreach ($s in @(16, 32, 48)) {
    Remove-Item (Join-Path $assets "app-icon-$s.png") -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path $assets 'tray-icon-16.png') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $assets 'tray-icon-32.png') -ErrorAction SilentlyContinue

Write-Host 'icons written:'
Get-ChildItem $assets | Select-Object Name, Length



