# Removes the autostart shortcut from the user Startup folder.
$startupDir = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startupDir 'ImmersiveSite-Autostart.lnk'
if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "OK: autostart shortcut removed."
} else {
    Write-Host "Info: autostart shortcut not found (nothing to remove)."
}
