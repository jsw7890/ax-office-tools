$ErrorActionPreference = "Continue"
$waits = @(4, 8, 16, 32)
$urls = @(
  "https://github.com/ollama/ollama/releases/download/v0.40.15/OllamaSetup.exe",
  "https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe"
)
$dest = Join-Path $env:TEMP "OllamaSetup.exe"
$ok = $false
foreach ($wait in $waits) {
  Start-Sleep -Seconds $wait
  foreach ($url in $urls) {
    Write-Output "TRY $url after ${wait}s"
    & curl.exe -L --fail --retry 2 --retry-delay 3 --connect-timeout 20 --max-time 180 -o $dest $url
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1000000)) {
      Write-Output "DOWNLOADED $((Get-Item $dest).Length)"
      $ok = $true
      break
    }
  }
  if ($ok) { break }
}
if (-not $ok) {
  Write-Output "DOWNLOAD_FAILED"
  exit 1
}
Write-Output "INSTALLING"
Start-Process -FilePath $dest -ArgumentList "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES" -Wait
Write-Output "INSTALL_DONE"
Get-ChildItem (Join-Path $env:LOCALAPPDATA "Programs\Ollama") -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
