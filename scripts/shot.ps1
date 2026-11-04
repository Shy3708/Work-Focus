param(
    [string]$OutFile = "docs/screenshots/shot.png",
    [string]$WindowTitle = "Work Focus",
    [int]$Pad = 32,
    [bool]$Raw = $false
)

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Runtime.InteropServices;

public class WfShot {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out WfRect rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct WfRect { public int Left; public int Top; public int Right; public int Bottom; }

    public static IntPtr Find(string title) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            if (!IsWindowVisible(h)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(h, sb, 256);
            if (sb.ToString() == title) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    // transparent margins render as pure black in PrintWindow; key them out, then draw onto the backdrop
    public static Bitmap Composite(Bitmap shot, Bitmap bg, int canvasW, int canvasH) {
        Bitmap canvas = new Bitmap(canvasW, canvasH, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(canvas)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            g.DrawImage(bg, 0, 0, canvasW, canvasH);
            int ox = (canvasW - shot.Width) / 2;
            int oy = (canvasH - shot.Height) / 2;
            for (int y = 0; y < shot.Height; y++) {
                for (int x = 0; x < shot.Width; x++) {
                    Color c = shot.GetPixel(x, y);
                    if (c.R < 10 && c.G < 10 && c.B < 10) continue;
                    canvas.SetPixel(ox + x, oy + y, c);
                }
            }
        }
        return canvas;
    }
}
"@

$hwnd = [WfShot]::Find($WindowTitle)
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Error "window not found: $WindowTitle"
    exit 1
}

$rect = New-Object WfShot+WfRect
[WfShot]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top

$shot = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($shot)
$hdc = $g.GetHdc()
[WfShot]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()

$outPath = Join-Path (Get-Location) $OutFile
$dir = Split-Path -Parent $outPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

if ($Raw) {
    $shot.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $shot.Dispose()
    Write-Host "saved $outPath (raw) $($w)x$($h)"
    exit 0
}

$bgPath = Join-Path (Get-Location) "docs/screenshots/backdrop.png"
$canvasW = [Math]::Max($w + $Pad * 2, 480)
$canvasH = [Math]::Max($h + $Pad * 2, 520)

if (Test-Path $bgPath) {
    $bg = [System.Drawing.Image]::FromFile($bgPath)
} else {
    $bg = New-Object System.Drawing.Bitmap(1, 1)
    $bg.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, 12, 22, 36))
}

$canvas = [WfShot]::Composite($shot, $bg, $canvasW, $canvasH)
$canvas.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$bg.Dispose()
$shot.Dispose()

Write-Host "saved $outPath $($canvasW)x$($canvasH) (widget $($w)x$($h))"
