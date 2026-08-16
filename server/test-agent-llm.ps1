# 乡芽 Agent LLM 编排模式端到端测试脚本
# 用法: pwsh -File test-agent-llm.ps1 <task> [username]
param(
  [string]$Task = "帮我诊断一下我的学习薄弱点",
  [string]$Username = "lixiaoyu",
  [string]$Password = "Demo@2026xy"
)

$ErrorActionPreference = "Stop"
$base = "http://localhost:3000/api/v1"

# 1. CSRF token
$csrfRes = Invoke-WebRequest -Uri "$base/auth/csrf" -Method GET -UseBasicParsing -SessionVariable sess
$csrf = ($csrfRes.Content | ConvertFrom-Json).data.csrfToken
if (-not $csrf) { throw "未获取到 csrfToken: $($csrfRes.Content)" }

# 2. 登录
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$loginRes = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Headers @{ "X-CSRF-Token" = $csrf } -Body $loginBody -ContentType "application/json" -UseBasicParsing -WebSession $sess
$login = $loginRes.Content | ConvertFrom-Json
$token = $login.data.accessToken
if (-not $token) { throw "登录失败: $($loginRes.Content)" }
Write-Host "== 登录成功: $Username (role=$($login.data.user.role))"

# 3. SSE chat（流式）
$headers = @{
  "X-CSRF-Token" = $csrf
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}
$chatBody = @{ task = $Task } | ConvertTo-Json
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $req = [System.Net.HttpWebRequest]::Create("$base/agent/chat")
  $req.Method = "POST"
  $req.ContentType = "application/json"
  $req.Accept = "text/event-stream"
  $req.Headers["X-CSRF-Token"] = $csrf
  $req.Headers["Authorization"] = "Bearer $token"
  $req.Timeout = 120000
  $req.AllowReadStreamBuffering = $false
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($chatBody)
  $req.ContentLength = $bytes.Length
  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
  $resp = $req.GetResponse()
  Write-Host "== HTTP $([int]$resp.StatusCode) $($resp.ContentType)"
  $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
  $event = ""
  $evCount = 0
  while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    if ($line -eq "") {
      if ($event) {
        $evCount++
        $evName = ($event -split "`n" | Where-Object { $_ -like "event:*" }) -replace "event:", ""
        $data = ($event -split "`n" | Where-Object { $_ -like "data:*" }) -replace "^data: ", ""
        $short = if ($data.Length -gt 300) { $data.Substring(0, 300) + "..." } else { $data }
        Write-Host "[$($sw.ElapsedMilliseconds)ms] <$evName> $short"
        $event = ""
      }
    } else {
      $event += $line + "`n"
    }
  }
  $reader.Close()
  $resp.Close()
  Write-Host "== 事件总数: $evCount"
} catch {
  Write-Host "== CHAT_FAIL: $($_.Exception.Message)"
  if ($_.Exception.InnerException) { Write-Host "   inner: $($_.Exception.InnerException.Message)" }
  exit 1
}

# 4. 拉取最近一次 run 的完整轨迹
try {
  $runsRes = Invoke-WebRequest -Uri "$base/agent/runs?page=1&pageSize=1" -Headers @{ "Authorization" = "Bearer $token"; "X-CSRF-Token" = $csrf } -UseBasicParsing -WebSession $sess
  $runs = ($runsRes.Content | ConvertFrom-Json).data
  if ($runs.list.Count -gt 0) {
    $runId = $runs.list[0].id
    Write-Host "== 最近 run #$runId status=$($runs.list[0].status) intent=$($runs.list[0].intent) tools=$($runs.list[0].toolCalls) duration=$($runs.list[0].durationMs)ms"
    $detailRes = Invoke-WebRequest -Uri "$base/agent/runs/$runId" -Headers @{ "Authorization" = "Bearer $token"; "X-CSRF-Token" = $csrf } -UseBasicParsing -WebSession $sess
    $detail = ($detailRes.Content | ConvertFrom-Json).data
    Write-Host "== 轨迹明细 ($($detail.messages.Count) 条):"
    foreach ($m in $detail.messages) {
      $c = if ($m.content) { $m.content.Substring(0, [Math]::Min(120, $m.content.Length)) } else { "" }
      Write-Host "   [$($m.kind)] tool=$($m.tool) status=$($m.status) dur=$($m.durationMs)ms $c"
    }
  }
} catch {
  Write-Host "== RUN_DETAIL_FAIL: $($_.Exception.Message)"
}
