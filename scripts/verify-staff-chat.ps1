$base = "http://127.0.0.1:3460"
$headers = @{
  "content-type" = "application/json"
  "origin" = $base
  "x-requested-with" = "ax-office"
}
$page = Invoke-WebRequest -Uri "$base/chat" -UseBasicParsing -TimeoutSec 20
Write-Output "PAGE_HAS_FUTURE $($page.Content.Contains('향후 LLM'))"
Write-Output "PAGE_HAS_LOCAL $($page.Content.Contains('꺼져 있으면 조문 검색'))"

$login = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -Headers $headers -Body '{"email":"staff@example.com"}' -UseBasicParsing -TimeoutSec 20
$cookie = ($login.Headers["Set-Cookie"] | Select-Object -First 1).Split(";")[0]
Write-Output "LOGIN $($login.StatusCode) $($login.Content)"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
# cookie set via Header
$h2 = @{
  "content-type" = "application/json"
  "origin" = $base
  "x-requested-with" = "ax-office"
  "cookie" = $cookie
}
$status = Invoke-WebRequest -Uri "$base/api/chat/status" -Headers $h2 -UseBasicParsing -TimeoutSec 20
Write-Output "STATUS $($status.Content)"

$ask = Invoke-WebRequest -Uri "$base/api/chat" -Method POST -Headers $h2 -Body '{"question":"1주 근로시간은 최대 몇 시간인가요?"}' -UseBasicParsing -TimeoutSec 120
Write-Output "ASK $($ask.Content)"
