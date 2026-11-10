$exe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
& $exe stop llama3.2:1b
& $exe pull qwen2.5:0.5b
Write-Output "PULL_EXIT $LASTEXITCODE"
& $exe list
