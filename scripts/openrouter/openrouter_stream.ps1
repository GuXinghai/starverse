<# 
openrouter_stream.ps1

目标：
- 运行一次 OpenRouter SSE 流式请求（chat/completions, stream=true）
- 全程记录：stdout/stderr 每行加相对时间戳
- 结束时输出一个“可直接粘贴”的 REPORT 块，包含：
  - start/end/elapsed
  - firstByte/maxIdle/lastByteAge
  - data/comment 行计数、[DONE] 计数
  - curl exitCode
  - 解析/连接/IP/HTTP 状态/CF-RAY
  - 最后若干条 stderr（含 schannel 错误原句）
- 同时保存完整日志到文件，便于需要时回溯

使用：
1) 保存为 UTF-8：openrouter_stream.ps1
2) PowerShell 运行：.\scripts\openrouter\openrouter_stream.ps1
#>

[CmdletBinding()]
param(
  [string]$Model   = "deepseek/deepseek-v3.2-speciale",
  [string]$KeyEnv  = "OPENROUTER_API_KEY",
  [string]$Title   = "Starverse",
  [string]$Referer = "http://localhost",

  # 每隔多少秒打印一次 tick（仅用于运行中观察，可关：设 0）
  [int]$TickSeconds = 0,
  [int]$PrintIdleThresholdSeconds = 30,

  # 结束时在 REPORT 里附带的 stderr 尾部行数
  [int]$StderrTailLines = 30,

  # 日志文件路径（默认 artifacts/openrouter/logs 下按时间戳生成）
  [string]$LogPath = ""
)

# -------------------- 0) 读取 API Key --------------------
$apiKey = [Environment]::GetEnvironmentVariable($KeyEnv, "Process")
if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = [Environment]::GetEnvironmentVariable($KeyEnv, "User") }
if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = [Environment]::GetEnvironmentVariable($KeyEnv, "Machine") }

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  Write-Error "环境变量 $KeyEnv 为空。请先设置：`$env:$KeyEnv = 'YOUR_KEY'（仅当前窗口）"
  exit 1
}

# -------------------- 1) 题目内容（原样） --------------------
$content = @'
题目：切割平面上的根号分支、Joukowski 变换、辐角原理与含对数权积分

设
[
D=\mathbb{C}\setminus[-1,1].
]
在 (D) 上取 (\sqrt{z^2-1}) 的分支为满足
[
\sqrt{z^2-1}=z+O!\left(\frac1z\right)\quad (z\to\infty)
]
的那一个（由此分支唯一确定）。定义
[
\phi(z)=z+\sqrt{z^2-1},\qquad \psi(w)=\frac12\left(w+\frac1w\right).
]
并对每个正整数 (n) 定义
[
T_n(z)=\frac12\left(\phi(z)^n+\phi(z)^{-n}\right),\qquad z\in D.
]
（注意 (\phi(z)\neq 0) 在 (D) 上成立。）

(1) 证明 (\phi) 将 (D) 共形映到外圆域 ({w\in\mathbb{C}:|w|>1})，且其反函数为 (\psi)，即在 (D) 上有 (\psi(\phi(z))=z)，在 (|w|>1) 上有 (\phi(\psi(w))=w)。进一步证明：当 (x\in(-1,1)) 时，(\phi) 的上下边界值满足
[
\phi_+(x)=e^{i\arccos x},\qquad \phi_-(x)=e^{-i\arccos x},
]
其中 (\arccos x\in(0,\pi)) 取主值。

(2) 证明 (T_n) 可解析延拓为整函数，并且实际上是一个次数恰为 (n) 的多项式；给出其首项系数。随后由(1)推出恒等式
[
T_n(\cos\theta)=\cos(n\theta)\qquad(\theta\in\mathbb{R}).
]

(3) 令
[
x_k=\cos\frac{(2k-1)\pi}{2n}\quad (k=1,2,\dots,n).
]
用辐角原理（允许在 (w)-平面上做计数后再经 (\psi) 拉回）证明：(T_n) 的零点全部位于 ((-1,1)) 内且全为单零点，并且零点集合恰为 ({x_1,\dots,x_n})。

(4) 对实参数 (a>1)，定义
[
I(a)=\int_{-1}^{1}\frac{\ln(1-x)}{a-x},\frac{dx}{\sqrt{1-x^2}},
]
其中 (\sqrt{1-x^2}) 表示 ((-1,1)) 上的正值平方根，(\ln) 为实对数。要求用复变方法求出 (I(a)) 的闭式表达（答案应能写成只含 (a)、(\sqrt{a^2-1}) 与对数的形式）。提示：将积分视为沿割线的边界值问题，结合(1)把它化为单位圆上的留数计算。

(5) 设 (a>1)。证明下列两个量都有闭式表达，并将它们化到只含 (a) 与 (\sqrt{a^2-1}) 的形式：
[
P_n(a)=\prod_{k=1}^n (a-x_k),\qquad S_n(a)=\sum_{k=1}^n \frac{1}{a-x_k}.
]
要求你的推导中必须显式使用(2)(3)得到的多项式结构（例如利用 (T_n(z)=) 首项系数 (\times\prod(z-x_k)) 与对数导数，或等价的留数论证）。
'@

# -------------------- 2) Payload（自动转义） --------------------
$payloadObj = @{
  model    = $Model
  stream   = $true
  messages = @(
    @{ role = "user"; content = $content }
  )
}
$payload = $payloadObj | ConvertTo-Json -Depth 30 -Compress

# -------------------- 3) 日志与统计 --------------------
$startLocal = Get-Date
$sw = [System.Diagnostics.Stopwatch]::StartNew()

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $ts = $startLocal.ToString("yyyyMMdd_HHmmss")
  $repoRoot = (Resolve-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath "..\\..")).Path
  $defaultLogDir = Join-Path -Path $repoRoot -ChildPath "artifacts\\openrouter\\logs"
  New-Item -ItemType Directory -Force -Path $defaultLogDir | Out-Null
  $LogPath = Join-Path -Path $defaultLogDir -ChildPath ("openrouter_stream_{0}.log" -f $ts)
}

$script:lock = New-Object object
$script:writer = New-Object System.IO.StreamWriter($LogPath, $false, [System.Text.Encoding]::UTF8)
$script:writer.AutoFlush = $true

$script:firstByteAt = $null
$script:lastByteAt = $startLocal
$script:maxIdleMs = 0.0

$script:outLines = 0
$script:errLines = 0
$script:dataLines = 0
$script:commentLines = 0
$script:doneLines = 0

# 从 -v stderr 中提取关键信息
$script:dnsResolved = $null
$script:remoteIPs = @()
$script:established = $null
$script:httpStatus = $null
$script:cfRay = $null

# stderr 尾部缓存
$script:stderrTail = New-Object System.Collections.Generic.Queue[string]

function Format-Elapsed {
  '{0:00}:{1:00}.{2:000}' -f $sw.Elapsed.Minutes, $sw.Elapsed.Seconds, $sw.Elapsed.Milliseconds
}

function Tail-Enqueue([string]$line) {
  $script:stderrTail.Enqueue($line)
  while ($script:stderrTail.Count -gt $StderrTailLines) { [void]$script:stderrTail.Dequeue() }
}

function Write-LogLine([string]$line) {
  [System.Threading.Monitor]::Enter($script:lock)
  try { $script:writer.WriteLine($line) }
  finally { [System.Threading.Monitor]::Exit($script:lock) }
}

function Update-IdleStats {
  $now = Get-Date
  if (-not $script:firstByteAt) { $script:firstByteAt = $now }
  $idleMs = ($now - $script:lastByteAt).TotalMilliseconds
  if ($idleMs -gt $script:maxIdleMs) { $script:maxIdleMs = $idleMs }
  $script:lastByteAt = $now
}

# -------------------- 4) 启动 curl 进程（捕获 stdout/stderr） --------------------
$headers = @(
  "Authorization: Bearer $apiKey",
  "Content-Type: application/json",
  "Accept: text/event-stream",
  "X-Title: $Title",
  "HTTP-Referer: $Referer"
)

# curl 参数：保留 -v/-N；如需你也可以自己加 keepalive/speed-time/speed-limit
$argList = @("-v","-N","https://openrouter.ai/api/v1/chat/completions")
foreach ($h in $headers) { $argList += @("-H", $h) }
$argList += @("--data-binary","@-")

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "curl.exe"
$psi.Arguments = ($argList | ForEach-Object {
  if ($_ -match '\s') { '"' + ($_ -replace '"','\"') + '"' } else { $_ }
}) -join ' '
$psi.UseShellExecute = $false
$psi.RedirectStandardInput  = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.CreateNoWindow = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()

# stdout：SSE data/comment 统计 + 计时
$stdoutSub = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -SourceIdentifier "or.stdout" -Action {
  if ($EventArgs.Data -ne $null) {
    $script:outLines++
    Update-IdleStats

    $line = $EventArgs.Data

    if ($line.StartsWith("data:")) { $script:dataLines++ }
    if ($line.StartsWith(":"))     { $script:commentLines++ }
    if ($line -match "^\s*data:\s*\[DONE\]\s*$") { $script:doneLines++ }

    $t = Format-Elapsed
    $log = "[{0}] [stdout] {1}" -f $t, $line
    Write-Host $log
    Write-LogLine $log
  }
}

# stderr：curl -v（DNS/IP/HTTP/CF-RAY/错误）提取 + 尾部缓存
$stderrSub = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -SourceIdentifier "or.stderr" -Action {
  if ($EventArgs.Data -ne $null) {
    $script:errLines++
    Update-IdleStats

    $line = $EventArgs.Data

    # 抽取关键信息
    if ($line -match '^\*\s*Host\s+openrouter\.ai:443\s+was\s+resolved\.' ) { $script:dnsResolved = $true }
    if ($line -match '^\*\s*IPv4:\s*(.+)$') { $script:remoteIPs = ($Matches[1] -split ',\s*') }
    if ($line -match '^\*\s*Established connection to openrouter\.ai\s+\(([^)]+)\s+port\s+443\)') { $script:established = $Matches[1] }
    if ($line -match '^<\s*HTTP/\d\.\d\s+(\d{3})\s+(.+)$') { $script:httpStatus = "$($Matches[1]) $($Matches[2])" }
    if ($line -match '^<\s*CF-RAY:\s*(.+)$') { $script:cfRay = $Matches[1].Trim() }

    Tail-Enqueue $line

    $t = Format-Elapsed
    $log = "[{0}] [stderr] {1}" -f $t, $line
    Write-Host $log
    Write-LogLine $log
  }
}

$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

# 喂 payload
$proc.StandardInput.WriteLine($payload)
$proc.StandardInput.Close()

Write-Host ("[start] {0} model={1} stream=true keyLen={2} log={3}" -f $startLocal.ToString("yyyy-MM-dd HH:mm:ss.fff"), $Model, $apiKey.Length, $LogPath)
Write-LogLine ("[start] {0} model={1} stream=true keyLen={2}" -f $startLocal.ToString("yyyy-MM-dd HH:mm:ss.fff"), $Model, $apiKey.Length)

# 可选 tick
$timer = $null
$timerSub = $null
if ($TickSeconds -gt 0) {
  $timer = New-Object System.Timers.Timer
  $timer.Interval = $TickSeconds * 1000
  $timer.AutoReset = $true
  $timerSub = Register-ObjectEvent -InputObject $timer -EventName Elapsed -SourceIdentifier "or.tick" -Action {
    $now = Get-Date
    $idle = ($now - $script:lastByteAt).TotalSeconds
    if ($PrintIdleThresholdSeconds -le 0 -or $idle -ge $PrintIdleThresholdSeconds) {
      $t = Format-Elapsed
      $maxIdleS = [math]::Round(($script:maxIdleMs / 1000.0), 3)
      $idleS = [math]::Round($idle, 3)
      $msg = "[{0}] [tick] idle={1}s maxIdle={2}s out/err={3}/{4} data/comment/done={5}/{6}/{7}" -f `
        $t, $idleS, $maxIdleS, $script:outLines, $script:errLines, $script:dataLines, $script:commentLines, $script:doneLines
      Write-Host $msg
      Write-LogLine $msg
    }
  }
  $timer.Start()
}

# 等待结束
$proc.WaitForExit()
$endLocal = Get-Date
$sw.Stop()

if ($timer) { $timer.Stop() }

# 清理订阅
foreach ($id in @("or.stdout","or.stderr","or.tick")) {
  Unregister-Event -SourceIdentifier $id -ErrorAction SilentlyContinue
}
# 关闭 writer
[System.Threading.Monitor]::Enter($script:lock)
try { $script:writer.Dispose() } finally { [System.Threading.Monitor]::Exit($script:lock) }

# -------------------- 5) 结束汇总 REPORT（可直接粘贴） --------------------
$total = $sw.Elapsed
$firstDelta = if ($script:firstByteAt) { ($script:firstByteAt - $startLocal).TotalSeconds } else { $null }
$lastAge = ($endLocal - $script:lastByteAt).TotalSeconds
$maxIdleS2 = [math]::Round(($script:maxIdleMs / 1000.0), 3)

$report = New-Object System.Text.StringBuilder
[void]$report.AppendLine("========== OPENROUTER STREAM REPORT ==========")
[void]$report.AppendLine(("start_local: {0}" -f $startLocal.ToString("yyyy-MM-dd HH:mm:ss.fff")))
[void]$report.AppendLine(("end_local:   {0}" -f $endLocal.ToString("yyyy-MM-dd HH:mm:ss.fff")))
[void]$report.AppendLine(("elapsed:     {0:00}:{1:00}.{2:000}" -f $total.Minutes, $total.Seconds, $total.Milliseconds))
[void]$report.AppendLine(("model:       {0}" -f $Model))
[void]$report.AppendLine(("stream:      true"))
[void]$report.AppendLine(("keyLen:      {0}" -f $apiKey.Length))
[void]$report.AppendLine(("endpoint:    https://openrouter.ai/api/v1/chat/completions"))
[void]$report.AppendLine(("log_file:    {0}" -f $LogPath))
[void]$report.AppendLine("")
[void]$report.AppendLine(("curl_exit:   {0}" -f $proc.ExitCode))
[void]$report.AppendLine(("first_byte_s:{0}" -f ($(if($firstDelta -ne $null){[math]::Round($firstDelta,3)} else {"<none>"}))))
[void]$report.AppendLine(("max_idle_s:  {0}" -f $maxIdleS2))
[void]$report.AppendLine(("last_byte_age_s_at_end:{0}" -f ([math]::Round($lastAge,3))))
[void]$report.AppendLine(("lines_out/err:{0}/{1}" -f $script:outLines, $script:errLines))
[void]$report.AppendLine(("lines_data/comment/done:{0}/{1}/{2}" -f $script:dataLines, $script:commentLines, $script:doneLines))
[void]$report.AppendLine("")
[void]$report.AppendLine(("dns_resolved: {0}" -f ($(if($script:dnsResolved){ "true" } else { "false/<unknown>" }))))
if ($script:remoteIPs.Count -gt 0) { [void]$report.AppendLine(("remote_ipv4:  {0}" -f ($script:remoteIPs -join ", "))) }
if ($script:established)          { [void]$report.AppendLine(("established_ip:{0}" -f $script:established)) }
if ($script:httpStatus)           { [void]$report.AppendLine(("http_status:  {0}" -f $script:httpStatus)) }
if ($script:cfRay)                { [void]$report.AppendLine(("cf_ray:       {0}" -f $script:cfRay)) }
[void]$report.AppendLine("")
[void]$report.AppendLine(("stderr_tail_last_{0}_lines:" -f $StderrTailLines))
foreach ($l in $script:stderrTail.ToArray()) { [void]$report.AppendLine($l) }
[void]$report.AppendLine("========== END REPORT ==========")

Write-Host ""
Write-Host $report.ToString()
