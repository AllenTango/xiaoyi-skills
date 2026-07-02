# xiaoyi-wsman

Workspace 项目管理 —— 让 AI 清晰掌握工作区每个项目的状态、进度、调整落实情况与审核测试结果。

## 安装

```bash
git clone https://github.com/AllenTango/skills ~/skills-repo
```

把 `xiaoyi-wsman/` 链接（或复制）到你的 AI 工具的 skills 目录，重启客户端即可：

```bash
ln -s ~/skills-repo/skills/xiaoyi-wsman ~/.opencode/skills/xiaoyi-wsman
ln -s ~/skills-repo/skills/xiaoyi-wsman ~/.claude/skills/xiaoyi-wsman
ln -s ~/skills-repo/skills/xiaoyi-wsman ~/.codex/skills/xiaoyi-wsman
# 其它加载 SKILL.md 的平台同理
```


## 使用

本 skill **仅在 slash 命令显式调用时触发**，不会被"列出项目 / 切换目录"等普通措辞自动加载。

```
/xiaoyi-wsman
```

加载后再告诉 AI "workspace 在 `<路径>`" 等指令：

| 你说 | AI 做什么 |
|------|----------|
| `列出所有项目` / `项目进度如何` | 跑扫描脚本，按阶段汇总输出 |
| `把项目 X 纳管` | 用 templates 初始化缺失文件 |
| `在项目 X 加个功能` | 进入项目，读 STATUS.md，工作完强制回写 |
| `切换到 ~/other` | 更新 state.json 中的 ws_root |

## 五阶段

```
idea → in-progress → review → done
            ↘       ↗
            paused
```

进入 `done` 前必须满足 `reviewed: true` 且 `tested: true`。

## 设计原则

1. **准确 > 好看**：状态反映真实。
2. **AI 先跑脚本再作答**：禁止凭空描述。
3. **状态由 STATUS.md frontmatter 驱动**：脚本负责一致性校验。
4. **三文件职责分离**：STATUS.md（机读）+ AGENTS.md（AI 协作）+ README.md（人读）。

## 项目内三文件

被管理的每个项目目录需含：

- `STATUS.md` —— 状态（YAML frontmatter + 正文）
- `AGENTS.md` —— AI 协作指导
- `README.md` —— 项目说明

模板见本 skill 的 `templates/` 目录。

## 脚本

```bash
# bash
bash <skill>/scripts/xiaoyi-wsman-scan.sh "$WS_ROOT" [--json|--issues-only]

# PowerShell
pwsh <skill>/scripts/xiaoyi-wsman-scan.ps1 "$WS_ROOT" [-Json|-IssuesOnly]
```

环境变量 `WSMAN_STALE_DAYS` 调整陈旧阈值（默认 30 天）。