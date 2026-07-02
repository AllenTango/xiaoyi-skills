<#
.SYNOPSIS
  xiaoyi-wsman-scan.ps1 — 扫描 workspace，输出准确的项目状态全局视图。

.DESCRIPTION
  跨平台：Windows PowerShell 5.1+ 与 PowerShell 7+（含 Linux/macOS 上的 pwsh）。
  与 xiaoyi-wsman-scan.sh 行为等价：相同的输入/输出/校验规则。
  只读：本脚本不修改任何文件。

.PARAMETER WorkspaceRoot
  被管理的 workspace 根目录。省略时默认当前目录。

.PARAMETER Json
  以 JSON 数组输出（供程序/AI 结构化消费）。

.PARAMETER IssuesOnly
  只输出存在异常的项目。

.EXAMPLE
  pwsh xiaoyi-wsman-scan.ps1 C:\Users\me\workspace

.EXAMPLE
  pwsh xiaoyi-wsman-scan.ps1 ~ -Json

.EXAMPLE
  pwsh xiaoyi-wsman-scan.ps1 ~ -IssuesOnly

.NOTES
  合法 stage: idea | in-progress | review | done | paused
  一致性校验：缺文件 / 非法 stage / done 但未审未测 / done 但 git dirty / 长期未更新
#>

[CmdletBinding()]
param(
  [string]$WorkspaceRoot,
  [switch]$Json,
  [switch]$IssuesOnly
)

$ErrorActionPreference = 'Stop'

$StaleDays = 30
if ($env:WSMAN_STALE_DAYS) { $StaleDays = [int]$env:WSMAN_STALE_DAYS }

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = (Get-Location).Path
}

if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
  Write-Error "错误: workspace 根目录不存在: $WorkspaceRoot"
  exit 1
}

$WorkspaceRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$NowEpoch = [int][double]::Parse((Get-Date -UFormat %s))

$ValidStages = @('idea','in-progress','review','done','paused')

function Read-FrontmatterValue {
  param([string]$FilePath, [string]$Key)
  if (-not (Test-Path -LiteralPath $FilePath)) { return '' }
  $lines = Get-Content -LiteralPath $FilePath -Encoding UTF8
  $inFm = $false
  foreach ($line in $lines) {
    if (-not $inFm) {
      if ($line -match '^---\s*$') { $inFm = $true }
      continue
    }
    if ($line -match '^---\s*$') { return '' }
    if ($line -match "^\s*$") { continue }
    $idx = $line.IndexOf(':')
    if ($idx -gt 0) {
      $name = $line.Substring(0, $idx).Trim()
      $val  = $line.Substring($idx + 1).Trim().Trim('"','''')
      if ($name -eq $Key) { return $val }
    }
  }
  return ''
}

function Days-Since {
  param([string]$Date)
  if ([string]::IsNullOrWhiteSpace($Date)) { return '' }
  try {
    $dt = [datetime]::ParseExact($Date, 'yyyy-MM-dd', $null)
    return [int]([math]::Floor(($NowEpoch - $dt.ToUniversalTime().Subtract([datetime]'1970-01-01').TotalSeconds) / 86400))
  } catch {
    return ''
  }
}

function Get-GitDirty {
  param([string]$Dir)
  try {
    $inside = & git -C $Dir rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0) { return 'no-git' }
    $status = & git -C $Dir status --porcelain 2>$null
    if ([string]::IsNullOrWhiteSpace($status)) { return 'clean' } else { return 'dirty' }
  } catch {
    return 'no-git'
  }
}

function Escape-JsonString {
  param([string]$s)
  return ($s -replace '\\','\\\\' -replace '"','\\"')
}

$total = 0
$issueCount = 0
$countIdea = 0
$countInProgress = 0
$countReview = 0
$countDone = 0
$countPaused = 0
$countUnknown = 0
$jsonItems = New-Object System.Collections.Generic.List[string]

$subdirs = Get-ChildItem -LiteralPath $WorkspaceRoot -Directory -Force |
  Where-Object { -not $_.Name.StartsWith('.') } |
  Sort-Object Name

foreach ($dir in $subdirs) {
  $name = $dir.Name
  $total++
  $statusFile = Join-Path $dir.FullName 'STATUS.md'
  $issues = New-Object System.Collections.Generic.List[string]

  if (-not (Test-Path -LiteralPath $statusFile))        { $issues.Add('缺少 STATUS.md') | Out-Null }
  if (-not (Test-Path -LiteralPath (Join-Path $dir.FullName 'AGENTS.md'))) { $issues.Add('缺少 AGENTS.md') | Out-Null }
  if (-not (Test-Path -LiteralPath (Join-Path $dir.FullName 'README.md'))) { $issues.Add('缺少 README.md') | Out-Null }

  $stage        = Read-FrontmatterValue -FilePath $statusFile -Key 'stage'
  $progress     = Read-FrontmatterValue -FilePath $statusFile -Key 'progress'
  $lastUpdated  = Read-FrontmatterValue -FilePath $statusFile -Key 'last_updated'
  $reviewed     = Read-FrontmatterValue -FilePath $statusFile -Key 'reviewed'
  $tested       = Read-FrontmatterValue -FilePath $statusFile -Key 'tested'

  if ([string]::IsNullOrWhiteSpace($stage)) {
    if (Test-Path -LiteralPath $statusFile) { $issues.Add('stage 缺失') | Out-Null }
    $stageKey = 'unknown'
  } elseif ($ValidStages -contains $stage) {
    $stageKey = $stage
  } else {
    $issues.Add("stage 非法: $stage") | Out-Null
    $stageKey = 'unknown'
  }

  switch ($stageKey) {
    'idea'         { $countIdea++ }
    'in-progress'  { $countInProgress++ }
    'review'       { $countReview++ }
    'done'         { $countDone++ }
    'paused'       { $countPaused++ }
    default        { $countUnknown++ }
  }

  $dirty = Get-GitDirty -Dir $dir.FullName
  $age   = Days-Since -Date $lastUpdated

  if ($stage -eq 'done') {
    if ($dirty -eq 'dirty')        { $issues.Add('stage=done 但 git 有未提交改动') | Out-Null }
    if ($reviewed -ne 'true')      { $issues.Add('stage=done 但 reviewed 非 true') | Out-Null }
    if ($tested -ne 'true')        { $issues.Add('stage=done 但 tested 非 true') | Out-Null }
  }

  if ($age -ne '' -and [int]$age -gt $StaleDays -and $stage -ne 'done' -and $stage -ne 'paused') {
    $issues.Add("STATUS 已 $age 天未更新(>$StaleDays)") | Out-Null
  }

  if ($dirty -eq 'dirty' -and $age -ne '' -and [int]$age -gt 7) {
    $issues.Add("git 有改动但 STATUS $age 天未更新") | Out-Null
  }

  $hasIssue = $false
  if ($issues.Count -gt 0) { $hasIssue = $true; $issueCount++ }

  if ($Json) {
    $issuesJsonParts = @()
    foreach ($it in $issues) {
      $issuesJsonParts += '"' + (Escape-JsonString $it) + '"'
    }
    $issuesJson = '[' + ($issuesJsonParts -join ',') + ']'
    $item = @{
      name         = $name
      stage        = if ($stage)        { $stage }        else { '' }
      progress     = if ($progress)     { $progress }     else { '' }
      last_updated = if ($lastUpdated)  { $lastUpdated }  else { '' }
      reviewed     = if ($reviewed)     { $reviewed }     else { '' }
      tested       = if ($tested)       { $tested }       else { '' }
      git          = $dirty
      issues       = $issues
    }
    # 手动 JSON 序列化以保持与 bash 版字段顺序一致
    $jsonItem = '{' +
      '"name":"'        + (Escape-JsonString $name)               + '",' +
      '"stage":"'       + (Escape-JsonString ([string]$item.stage))       + '",' +
      '"progress":"'    + (Escape-JsonString ([string]$item.progress))    + '",' +
      '"last_updated":"'+ (Escape-JsonString ([string]$item.last_updated)) + '",' +
      '"reviewed":"'    + (Escape-JsonString ([string]$item.reviewed))    + '",' +
      '"tested":"'      + (Escape-JsonString ([string]$item.tested))      + '",' +
      '"git":"'         + (Escape-JsonString $dirty)               + '",' +
      '"issues":'       + $issuesJson +
    '}'
    $jsonItems.Add($jsonItem)
  } else {
    if ($IssuesOnly -and -not $hasIssue) { continue }
    $mark = if ($hasIssue) { '!!' } else { '  ' }
    $stageDisp    = if ($stage)        { $stage }        else { '?' }
    $progressDisp = if ($progress)     { $progress }     else { '?' }
    $reviewedDisp = if ($reviewed)     { $reviewed }     else { '?' }
    $testedDisp   = if ($tested)       { $tested }       else { '?' }
    $updatedDisp  = if ($lastUpdated)  { $lastUpdated }  else { '?' }
    '{0} {1,-24} stage={2,-12} progress={3,-5} reviewed={4,-5} tested={5,-5} git={6,-6} updated={7}' -f `
      $mark, $name, $stageDisp, $progressDisp, $reviewedDisp, $testedDisp, $dirty, $updatedDisp
    foreach ($it in $issues) {
      '     - ' + $it
    }
  }
}

if ($Json) {
  $joined = $jsonItems -join ','
  '[' + $joined + ']'
  exit 0
}

''
"================ 汇总 ($WorkspaceRoot) ================"
"项目总数: $total    异常项目: $issueCount"
"按阶段: 想法(idea)=$countIdea  进行中(in-progress)=$countInProgress  待审核(review)=$countReview  已完成(done)=$countDone  搁置(paused)=$countPaused  未知(unknown)=$countUnknown"
"(行首 '!!' 表示该项目存在需关注的异常)"