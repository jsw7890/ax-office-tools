Get-Process OllamaSetup, ollama, Ollama -ErrorAction SilentlyContinue | Select-Object Name, Id, CPU
$paths = @(
  "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
  "$env:ProgramFiles\Ollama\ollama.exe",
  "${env:ProgramFiles(x86)}\Ollama\ollama.exe"
)
foreach ($p in $paths) {
  if (Test-Path $p) { Write-Output "FOUND $p" }
}
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2
  Write-Output "API $($r.StatusCode) $($r.Content)"
} catch {
  Write-Output "API_DOWN"
}
