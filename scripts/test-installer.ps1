# Run only on a disposable Windows CI runner: installs to the real per-user folder.
$ErrorActionPreference = 'Stop'
trap {
    # Keep a bounded failure diagnosis in the Actions annotations as well as logs.
    $diagnosis = "$($_.Exception.Message) ($($_.InvocationInfo.ScriptLineNumber))" -replace '%', '%25' -replace "`r", '%0D' -replace "`n", '%0A'
    Write-Host "::error title=Windows installer verification::$diagnosis"
    break
}
if ($env:CI -ne 'true') { throw 'Installer integration tests require a disposable Windows CI runner (CI=true).' }
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "artifacts/Yoru-Setup-$version-x64.exe"
$installDir = Join-Path $env:LOCALAPPDATA 'Programs/Yoru'
$registryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Yoru'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Yoru.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs/Yoru/Yoru.lnk'
if ((Test-Path $installDir) -or (Test-Path $registryKey) -or (Test-Path $desktopLink) -or (Test-Path $startLink)) {
    throw 'Refusing to alter an existing Yoru installation.'
}
$profileDir = Join-Path $env:APPDATA 'kadr-anime'
New-Item -ItemType Directory -Force $profileDir | Out-Null
$sentinel = Join-Path $profileDir "installer-test-$([guid]::NewGuid()).txt"
$savedData = 'Библиотека, заметки и собственная тема — сохранить.'
[IO.File]::WriteAllText($sentinel, $savedData)
$shell = New-Object -ComObject WScript.Shell
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class InstallerUI {
    private delegate bool EnumCallback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] private static extern bool PostMessageW(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageW(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    private static string Text(IntPtr window) { var text = new StringBuilder(512); GetWindowTextW(window, text, text.Capacity); return text.ToString(); }
    private static bool Matches(IntPtr window, string name) { return Text(window).Replace("&", "").Trim() == name; }
    public static IntPtr Control(IntPtr parent, string name) {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, (window, state) => {
            if (IsWindowVisible(window) && IsWindowEnabled(window) && Matches(window, name)) { result = window; return false; }
            return true;
        }, IntPtr.Zero);
        return result;
    }
    public static IntPtr Button(int process, string name) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((window, state) => {
            uint owner; GetWindowThreadProcessId(window, out owner);
            if (owner == process) result = Control(window, name);
            return result == IntPtr.Zero;
        }, IntPtr.Zero);
        return result;
    }
    public static string Describe(int process) {
        var controls = new List<string>();
        EnumWindows((window, state) => {
            uint owner; GetWindowThreadProcessId(window, out owner);
            if (owner == process) {
                controls.Add("window: " + Text(window));
                EnumChildWindows(window, (child, unused) => { var text = Text(child); if (text.Length > 0 && controls.Count < 24) controls.Add(text); return true; }, IntPtr.Zero);
            }
            return true;
        }, IntPtr.Zero);
        return string.Join(" | ", controls);
    }
    public static void Click(IntPtr button) { if (!PostMessageW(button, 0xF5, IntPtr.Zero, IntPtr.Zero)) throw new Exception("Cannot click installer button"); }
    public static void Uncheck(IntPtr checkbox) { SendMessageW(checkbox, 0xF1, IntPtr.Zero, IntPtr.Zero); }
}
'@

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Run-Silent($file, [string[]]$arguments) {
    $process = Start-Process -FilePath $file -ArgumentList $arguments -PassThru
    if (-not $process.WaitForExit(180000)) { throw "Timeout: $file" }
    Assert-True ($process.ExitCode -eq 0) "Installer command exited with $($process.ExitCode): $file"
}
function Wait-Button($process, $name) {
    $timeout = if ($env:YORU_INSTALLER_UI_ONLY -eq '1') { 20 } else { 180 }
    $deadline = [DateTime]::UtcNow.AddSeconds($timeout)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) { throw "Installer closed before '$name' (exit $($process.ExitCode))" }
        $button = [InstallerUI]::Button($process.Id, $name)
        if ($button -ne [IntPtr]::Zero) { return $button }
        Start-Sleep -Milliseconds 300
    }
    throw "Installer did not show '$name'. $([InstallerUI]::Describe($process.Id))"
}
function Assert-Installed($directory) {
    Assert-True (Test-Path (Join-Path $directory 'Yoru.exe')) 'Missing installed EXE'
    Assert-True (Test-Path (Join-Path $directory 'resources/app.asar')) 'Missing installed ASAR'
    Assert-True (Test-Path (Join-Path $directory 'Uninstall Yoru.exe')) 'Missing uninstaller'
    $registration = Get-ItemProperty $registryKey
    Assert-True ($registration.DisplayVersion -eq $version) 'Incorrect installed version'
    Assert-True ($registration.InstallLocation -eq $directory) 'Incorrect installed directory'
    foreach ($link in @($desktopLink, $startLink)) {
        Assert-True (Test-Path $link) "Missing shortcut: $link"
        $shortcut = $shell.CreateShortcut($link)
        Assert-True ($shortcut.TargetPath -eq (Join-Path $directory 'Yoru.exe')) 'Shortcut targets wrong application'
        Assert-True ($shortcut.IconLocation -eq "$(Join-Path $directory 'Yoru.exe'),0") 'Shortcut uses wrong icon'
    }
    Assert-True ([IO.File]::ReadAllText($sentinel) -eq $savedData) 'Personal profile was altered'
}
function Uninstall($directory) {
    # _?= keeps NSIS in the installed directory, so WaitForExit covers actual cleanup.
    Run-Silent (Join-Path $directory 'Uninstall Yoru.exe') @('/S', "_?=$directory")
    # NSIS cannot remove its own running file in _?= test mode. Normal interactive
    # uninstall copies itself to TEMP and removes it automatically.
    Remove-Item (Join-Path $directory 'Uninstall Yoru.exe') -Force -ErrorAction SilentlyContinue
    Assert-True (-not (Test-Path (Join-Path $directory 'Yoru.exe'))) 'Installed EXE survived uninstall'
    Assert-True (-not (Test-Path $registryKey)) 'Uninstall registration survived'
    Assert-True (-not (Test-Path $desktopLink)) 'Desktop shortcut survived'
    Assert-True (-not (Test-Path $startLink)) 'Start shortcut survived'
    Assert-True ([IO.File]::ReadAllText($sentinel) -eq $savedData) 'Uninstaller deleted personal data'
}

try {
    # Exercise the actual visible Russian UI, rather than only /S.
    $process = Start-Process -FilePath $installer -PassThru
    $installButton = Wait-Button $process 'Установить'
    [InstallerUI]::Click($installButton)
    $finishButton = Wait-Button $process 'Готово'
    # The main button caption can change just before nsDialogs shows its child
    # page. Wait for the checkbox itself instead of racing that page transition.
    $checkbox = Wait-Button $process 'Открыть Yoru'
    [InstallerUI]::Uncheck($checkbox)
    [InstallerUI]::Click($finishButton)
    Assert-True ($process.WaitForExit(30000)) 'Installer did not finish'
    Assert-True ($process.ExitCode -eq 0) 'Interactive installation failed'
    Assert-Installed $installDir
    Write-Host 'PASS: visible Russian installer, user-only installation, shortcuts and registration'
    if ($env:YORU_INSTALLER_UI_ONLY -eq '1') {
        # A tiny inert payload checks the same NSIS pages without spending minutes
        # compressing Electron. The main CI job still tests the complete EXE.
        Uninstall $installDir
        if (Test-Path $installDir) { Remove-Item $installDir }
        return
    }

    # Upgrade/reinstall must preserve the profile and files not owned by the package.
    $extra = Join-Path $installDir 'личный файл.txt'
    [IO.File]::WriteAllText($extra, 'keep')
    Run-Silent $installer @('/S')
    Assert-Installed $installDir
    Assert-True ([IO.File]::ReadAllText($extra) -eq 'keep') 'Reinstallation changed an unrelated file'
    $env:YORU_SMOKE_EXECUTABLE = Join-Path $installDir 'Yoru.exe'
    try {
        & node (Join-Path $PSScriptRoot 'smoke-desktop.js')
        if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed' }
    } finally { Remove-Item Env:YORU_SMOKE_EXECUTABLE -ErrorAction SilentlyContinue }
    Write-Host 'PASS: actual installed EXE launched, playback and UI smoke checks passed'

    # Do not replace an application while it is running.
    $running = Start-Process -FilePath (Join-Path $installDir 'Yoru.exe') -PassThru
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do { Start-Sleep -Milliseconds 300; $running.Refresh() } while ($running.MainWindowHandle -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline -and -not $running.HasExited)
        Assert-True (-not $running.HasExited) 'Application unexpectedly exited'
        $blocked = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
        Assert-True ($blocked.WaitForExit(30000)) 'Running-app check hung'
        Assert-True ($blocked.ExitCode -eq 2) 'Installer overwrote a running application'
    } finally {
        if (-not $running.HasExited) { $null = $running.CloseMainWindow(); if (-not $running.WaitForExit(10000)) { $running.Kill($true); $running.WaitForExit() } }
    }
    Uninstall $installDir
    Assert-True ([IO.File]::ReadAllText($extra) -eq 'keep') 'Uninstaller deleted an unrelated file'
    Remove-Item $extra
    Remove-Item $installDir
    Write-Host 'PASS: running application protected; uninstall keeps personal profile and unrelated files'

    $customDir = Join-Path $env:TEMP "Yoru проверка $([guid]::NewGuid())"
    Run-Silent $installer @('/S', "/D=$customDir")
    Assert-Installed $customDir
    Uninstall $customDir
    if (Test-Path $customDir) { Remove-Item $customDir }
    Write-Host 'PASS: Unicode path with spaces; install, shortcuts and uninstall'
} finally {
    Remove-Item $sentinel -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
}
