# Installs an autostart shortcut in the user Startup folder.
# The shortcut runs wscript.exe on autostart.vbs (hidden server launcher).
$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $projectDir 'autostart.vbs'
$startupDir = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startupDir 'ImmersiveSite-Autostart.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnk)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $vbs + '"'
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = 'Immersive Site autostart (server.py on 127.0.0.1:8090)'
$shortcut.Save()

Write-Host "OK: autostart shortcut created at $lnk"
