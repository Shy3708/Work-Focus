param(
    [string]$OutFile = "docs/screenshots/capture.png",
    [int]$Pad = 28,
    [string]$WindowTitle = "Work Focus"
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WfDpi {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
[WfDpi]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

# park the cursor away so hover tooltips do not appear in the screenshot
[WfDpi]::SetCursorPos(60, 980) | Out-Null
Start-Sleep -Milliseconds 1200

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public struct WfRect { public int Left; public int Top; public int Right; public int Bottom; }
public class WfWin {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out WfRect rect);
}
"@

$script:target = [IntPtr]::Zero
$cb = {
    param($hWnd, $lParam)
    if (-not [WfWin]::IsWindowVisible($hWnd)) { return $true }
    $sb = New-Object System.Text.StringBuilder 256
    [WfWin]::GetWindowText($hWnd, $sb, 256) | Out-Null
    if ($sb.ToString() -eq $WindowTitle) { $script:target = $hWnd; return $false }
    return $true
}
[WfWin]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

if ($script:target -eq [IntPtr]::Zero) {
    Write-Error "window not found: $WindowTitle"
    exit 1
}

$rect = New-Object WfRect
[WfWin]::GetWindowRect($script:target, [ref]$rect) | Out-Null

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$x = [Math]::Max($screen.X, $rect.Left - $Pad)
$y = [Math]::Max($screen.Y, $rect.Top - $Pad)
$w = [Math]::Min($screen.Right, $rect.Right + $Pad) - $x
$h = [Math]::Min($screen.Bottom, $rect.Bottom + $Pad) - $y

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()

$outPath = Join-Path (Get-Location) $OutFile
$dir = Split-Path -Parent $outPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "saved $outPath"
Write-Host "rect: $($rect.Left),$($rect.Top) $($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
