$exe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
& $exe list
try {
  (Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 5).Content
} catch {
  Write-Output "API_DOWN"
}
