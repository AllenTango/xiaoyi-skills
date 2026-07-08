# xiaoyi-wsman

Workspace 项目状态管理器。详见 SKILL.md。

## Ignoring subdirectories

The scanner auto-skips hidden directories and a built-in list (`node_modules`, `.git`, `.next`, `dist`, `build`, …). To skip additional directories, drop a `.xiaoyi-wsman.config.json` at the workspace root:

```json
{
  "ignore": ["junk-*", "scripts/", "**/playground"]
}
```

Use `--show-ignored` to verify what is being skipped and why.

Pattern syntax (see SKILL.md for full details):
- `*` matches any chars except `/`
- `**` matches across segments
- Trailing `/` or `/**` switches to prefix match
- `?` matches a single character