# Run only on a disposable Windows CI runner: installs to the real per-user folder.
$ErrorActionPreference = 'Stop'
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
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Run-Silent($file, [string[]]$arguments) {
    $process = Start-Process -FilePath $file -ArgumentList $arguments -PassThru
    if (-not $process.WaitForExit(180000)) { throw "Timeout: $file" }
    Assert-True ($process.ExitCode -eq 0) "Installer command exited with $($process.ExitCode): $file"
}
function Wait-Button($process, $name) {
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) { throw "Installer closed before '$name' (exit $($process.ExitCode))" }
        $process.Refresh()
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
            $window = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            $condition = New-Object Windows.Automation.AndCondition(
                (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)),
                (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, $name)))
            $button = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
            if ($button -and $button.Current.IsEnabled) { return $button }
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Installer did not show '$name'"
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
    $invoke = $installButton.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    $finishButton = Wait-Button $process 'Готово'
    $window = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, 'Открыть Yoru')
    $checkbox = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
    Assert-True ($null -ne $checkbox) 'Missing launch checkbox'
    $toggle = $checkbox.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)
    if ($toggle.Current.ToggleState -eq [Windows.Automation.ToggleState]::On) { $toggle.Toggle() }
    $finishButton.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
    Assert-True ($process.WaitForExit(30000)) 'Installer did not finish'
    Assert-True ($process.ExitCode -eq 0) 'Interactive installation failed'
    Assert-Installed $installDir
    Write-Host 'PASS: visible Russian installer, user-only installation, shortcuts and registration'

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
