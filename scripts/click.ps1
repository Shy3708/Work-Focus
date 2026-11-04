param([int]$X, [int]$Y, [int]$DelayMs = 60)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WfMouse {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@

[WfMouse]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
[WfMouse]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds $DelayMs
[WfMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
[WfMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 400
Write-Host "clicked $X,$Y"
