Set-Location "c:\Users\hitea\Desktop\Cursor\ax-office-tools"
$env:LLM_PROVIDER = "ollama"
$env:OLLAMA_MODEL = "qwen2.5:0.5b"
$env:OLLAMA_HOST = "http://127.0.0.1:11434"
$env:DATABASE_PATH = "memory"
$env:SESSION_SECRET = "test-secret-test-secret-test-secret"
npm run dev -- --port 3460
