Stop-Process -Id 35752 -Force -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 3460 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Write-Output "STOPPED"
