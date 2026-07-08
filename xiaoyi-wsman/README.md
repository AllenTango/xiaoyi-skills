# xiaoyi-wsman

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/AllenTango/xiaoyi-skills)

Workspace 项目管理 —— 让 AI 清晰掌握工作区每个项目的状态、进度、调整落实情况与审核测试结果。

## 安装

```bash
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-wsman
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
node <skill>/scripts/xiaoyi-wsman-scan.js "$WS_ROOT" [--json|--issues-only]
```

要求 **Node.js 18+**（`npx skills add` 安装本 skill 时已要求 Node.js，AI 客户端必定具备）。
无需 `npm install`，无外部依赖。

环境变量 `WSMAN_STALE_DAYS` 调整陈旧阈值（默认 30 天）。