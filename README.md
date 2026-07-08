# xiaoyi-skills

Codex/agent skills maintained by AllenTango.

## Skills

- `xiaoyi-ssg` - Conversational custom static site generator. It helps an AI agent design a content model, extract design tokens, and generate a self-contained SSG pipeline for a project.
- `xiaoyi-wsman` - Workspace project status manager. It scans fixed-structure project workspaces and keeps `STATUS.md`, `AGENTS.md`, and `README.md` aligned.

## Install

Install the full package and choose skills interactively:

```bash
npx skills add AllenTango/xiaoyi-skills
```

Install a specific skill:

```bash
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-ssg
npx skills add AllenTango/xiaoyi-skills --skill xiaoyi-wsman
```

Use the latest CLI explicitly:

```bash
npx skills@latest add AllenTango/xiaoyi-skills --skill xiaoyi-ssg
npx skills@latest add AllenTango/xiaoyi-skills --skill xiaoyi-wsman
```

Install from a local checkout:

```bash
npx skills add /absolute/path/to/xiaoyi-skills --skill xiaoyi-ssg
```

## Validate

List discoverable skills without installing:

```bash
npx skills add AllenTango/xiaoyi-skills --list
npx skills add /absolute/path/to/xiaoyi-skills --list
```
