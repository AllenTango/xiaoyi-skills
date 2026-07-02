#!/usr/bin/env bash
#
# xiaoyi-wsman-scan.sh — 扫描 workspace，输出准确的项目状态全局视图。
# 跨平台：Linux / macOS / Windows (Git Bash / WSL)
# 兼容 bash 3.2+（不使用 bash 4 特性如 declare -A）。
#
# 只读：本脚本不修改任何文件。
#
# 用法:
#   xiaoyi-wsman-scan.sh [WORKSPACE_ROOT] [--json] [--issues-only]
#
#   WORKSPACE_ROOT   被管理的 workspace 根目录。省略时默认当前目录 (PWD)。
#   --json           以 JSON 数组输出（供程序/AI 结构化消费）。
#   --issues-only    只输出存在异常的项目。
#
# 项目识别规则:
#   WORKSPACE_ROOT 下的每个一级子目录视为一个项目。
#   隐藏目录（以 . 开头）被忽略。
#
# 每个项目读取其 STATUS.md 的 YAML frontmatter:
#   project / stage / progress / last_updated / reviewed / tested
# 合法 stage: idea | in-progress | review | done | paused
#
# 一致性校验（标记为 ISSUE）:
#   - 缺少 STATUS.md / AGENTS.md / README.md
#   - stage 缺失或非法
#   - stage=done 但 git 工作区有未提交改动
#   - stage=done 但 reviewed/tested 不为 true
#   - last_updated 超过 STALE_DAYS（默认 30）天
#   - git 有未提交改动但 STATUS.md 长期未更新
#
set -eu

STALE_DAYS="${WSMAN_STALE_DAYS:-30}"
OUTPUT_JSON=0
ISSUES_ONLY=0
WORKSPACE_ROOT=""

print_usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --json) OUTPUT_JSON=1 ;;
    --issues-only) ISSUES_ONLY=1 ;;
    -h|--help) print_usage; exit 0 ;;
    *)
      if [ -z "$WORKSPACE_ROOT" ]; then
        WORKSPACE_ROOT="$arg"
      else
        echo "未知参数: $arg" >&2
        exit 2
      fi
      ;;
  esac
done

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$PWD}"

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo "错误: workspace 根目录不存在: $WORKSPACE_ROOT" >&2
  exit 1
fi

cd "$WORKSPACE_ROOT"
WORKSPACE_ROOT="$(pwd)"
NOW_EPOCH="$(date +%s)"

VALID_STAGES="idea in-progress review done paused"

# 从 frontmatter 中提取某个 key 的值（取首行 --- 与 次行 --- 之间的简单 key: value）。
# 仅支持简单 scalar 字符串/数字，不解析嵌套结构。
read_fm() {
  local file="$1" key="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  awk -v k="$key" '
    NR==1 && $0 ~ /^---[[:space:]]*$/ { infm=1; next }
    infm && $0 ~ /^---[[:space:]]*$/ { exit }
    infm {
      line=$0
      idx=index(line, ":")
      if (idx>0) {
        name=substr(line,1,idx-1)
        val=substr(line,idx+1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        gsub(/^["'\''"]|["'\''"]$/, "", val)
        if (name==k) { print val; exit }
      }
    }
  ' "$file"
}

# 计算日期字符串(YYYY-MM-DD)距今天数；非法返回空。
days_since() {
  local d="$1" epoch
  if [ -z "$d" ]; then
    return 0
  fi
  epoch="$(date -d "$d" +%s 2>/dev/null || true)"
  if [ -z "$epoch" ]; then
    return 0
  fi
  echo $(( (NOW_EPOCH - epoch) / 86400 ))
}

# 项目内是否为 git 仓库（或位于某个 git 仓库内）且有未提交改动。
git_dirty() {
  local dir="$1"
  if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then
      echo "dirty"
    else
      echo "clean"
    fi
  else
    echo "no-git"
  fi
}

json_escape() {
  # 转义 \ 与 " 以适配 JSON 字符串字面量。
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

TOTAL=0
ISSUE_COUNT=0
COUNT_IDEA=0
COUNT_IN_PROGRESS=0
COUNT_REVIEW=0
COUNT_DONE=0
COUNT_PAUSED=0
COUNT_UNKNOWN=0
JSON_ITEMS=""

# 使用 NUL 分隔临时收集 JSON item，避免依赖 bash 4+ 数组追加。
JSON_TMP="$(mktemp -t wsman.XXXXXX)"
trap 'rm -f "$JSON_TMP"' EXIT

for dir in "$WORKSPACE_ROOT"/*/; do
  if [ ! -d "$dir" ]; then
    continue
  fi
  name="$(basename "$dir")"
  case "$name" in
    .*) continue ;;
  esac
  TOTAL=$((TOTAL+1))

  status_file="$dir/STATUS.md"
  issues=""

  if [ ! -f "$dir/STATUS.md" ]; then issues="${issues}缺少 STATUS.md
"; fi
  if [ ! -f "$dir/AGENTS.md" ]; then issues="${issues}缺少 AGENTS.md
"; fi
  if [ ! -f "$dir/README.md" ]; then issues="${issues}缺少 README.md
"; fi

  stage="$(read_fm "$status_file" stage || true)"
  progress="$(read_fm "$status_file" progress || true)"
  last_updated="$(read_fm "$status_file" last_updated || true)"
  reviewed="$(read_fm "$status_file" reviewed || true)"
  tested="$(read_fm "$status_file" tested || true)"

  if [ -z "$stage" ]; then
    if [ -f "$status_file" ]; then
      issues="${issues}stage 缺失
"
    fi
    stage_key="unknown"
  else
    valid=0
    for s in $VALID_STAGES; do
      if [ "$s" = "$stage" ]; then valid=1; break; fi
    done
    if [ $valid -eq 0 ]; then
      issues="${issues}stage 非法: $stage
"
      stage_key="unknown"
    else
      stage_key="$stage"
    fi
  fi

  case "$stage_key" in
    idea)          COUNT_IDEA=$((COUNT_IDEA+1)) ;;
    in-progress)   COUNT_IN_PROGRESS=$((COUNT_IN_PROGRESS+1)) ;;
    review)        COUNT_REVIEW=$((COUNT_REVIEW+1)) ;;
    done)          COUNT_DONE=$((COUNT_DONE+1)) ;;
    paused)        COUNT_PAUSED=$((COUNT_PAUSED+1)) ;;
    *)             COUNT_UNKNOWN=$((COUNT_UNKNOWN+1)) ;;
  esac

  dirty="$(git_dirty "$dir")"
  age="$(days_since "$last_updated" || true)"

  if [ "$stage" = "done" ]; then
    if [ "$dirty" = "dirty" ]; then issues="${issues}stage=done 但 git 有未提交改动
"; fi
    if [ "$reviewed" != "true" ]; then issues="${issues}stage=done 但 reviewed 非 true
"; fi
    if [ "$tested" != "true" ]; then issues="${issues}stage=done 但 tested 非 true
"; fi
  fi

  if [ -n "$age" ] && [ "$age" -gt "$STALE_DAYS" ] && [ "$stage" != "done" ] && [ "$stage" != "paused" ]; then
    issues="${issues}STATUS 已 ${age} 天未更新(>${STALE_DAYS})
"
  fi

  if [ "$dirty" = "dirty" ] && [ -n "$age" ] && [ "$age" -gt 7 ]; then
    issues="${issues}git 有改动但 STATUS ${age} 天未更新
"
  fi

  has_issue=0
  if [ -n "$issues" ]; then
    has_issue=1
    ISSUE_COUNT=$((ISSUE_COUNT+1))
  fi

  if [ $OUTPUT_JSON -eq 1 ]; then
    # 构造 JSON item 并写入临时文件（NUL 分隔）
    issues_json=""
    if [ -n "$issues" ]; then
      issues_json="["
      first=1
      while IFS= read -r it; do
        [ -z "$it" ] && continue
        if [ $first -eq 0 ]; then issues_json="${issues_json},"; fi
        issues_json="${issues_json}\"$(json_escape "$it")\""
        first=0
      done <<EOF
$issues
EOF
      issues_json="${issues_json}]"
    else
      issues_json="[]"
    fi
    printf '%s\0' "{\"name\":\"$(json_escape "$name")\",\"stage\":\"$(json_escape "${stage:-}")\",\"progress\":\"$(json_escape "${progress:-}")\",\"last_updated\":\"$(json_escape "${last_updated:-}")\",\"reviewed\":\"$(json_escape "${reviewed:-}")\",\"tested\":\"$(json_escape "${tested:-}")\",\"git\":\"$dirty\",\"issues\":$issues_json}" >> "$JSON_TMP"
  else
    if [ $ISSUES_ONLY -eq 1 ] && [ $has_issue -eq 0 ]; then
      continue
    fi
    if [ $has_issue -eq 1 ]; then
      mark="!!"
    else
      mark="  "
    fi
    printf '%s %-24s stage=%-12s progress=%-5s reviewed=%-5s tested=%-5s git=%-6s updated=%s\n' \
      "$mark" "$name" "${stage:-?}" "${progress:-?}" "${reviewed:-?}" "${tested:-?}" "$dirty" "${last_updated:-?}"
    if [ -n "$issues" ]; then
      printf '%s' "$issues" | while IFS= read -r it; do
        [ -z "$it" ] && continue
        printf '     - %s\n' "$it"
      done
    fi
  fi
done

if [ $OUTPUT_JSON -eq 1 ]; then
  printf '['
  first=1
  while IFS= read -r -d '' item; do
    if [ $first -eq 0 ]; then printf ','; fi
    printf '%s' "$item"
    first=0
  done < "$JSON_TMP"
  printf ']\n'
  exit 0
fi

echo ""
echo "================ 汇总 ($WORKSPACE_ROOT) ================"
echo "项目总数: $TOTAL    异常项目: $ISSUE_COUNT"
echo "按阶段: 想法(idea)=$COUNT_IDEA  进行中(in-progress)=$COUNT_IN_PROGRESS  待审核(review)=$COUNT_REVIEW  已完成(done)=$COUNT_DONE  搁置(paused)=$COUNT_PAUSED  未知(unknown)=$COUNT_UNKNOWN"
echo "(行首 '!!' 表示该项目存在需关注的异常)"