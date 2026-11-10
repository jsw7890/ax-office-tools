$exe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
Write-Output "EXE $exe"
& $exe --version
& $exe pull llama3.2:1b
Write-Output "PULL_EXIT $LASTEXITCODE"
& $exe list
