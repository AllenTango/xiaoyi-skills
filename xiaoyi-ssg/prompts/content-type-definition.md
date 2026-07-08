# Content Type Definition Prompt

指导 AI 通过对话引导用户定义内容类型，生成 `content-types.json`。

## 交互流程

```
AI: "需要什么内容类型？举例：文章、项目、视频、图集、页面、演讲、作品..."
用户: "项目（封面、技术栈、链接）、文章（标题、日期、标签）、关于页面"
AI: 针对每个类型追问字段（见下）
AI: 生成 content-types.json
AI: "确认无误？确认后将生成对应的列表/详情模板。"
用户: "确认"
AI: 触发管线重新生成
```

## 字段定义引导模板

对每个内容类型，按以下顺序追问：

### 1. 基础标识（必需）

```
AI: "类型名称（kebab-case，如 project, talk, essay）？"
用户: "project"
AI: "中文标签？"
用户: "项目"
AI: "内容目录名（默认 source/_project）？"
用户: "用默认"
```

### 2. 字段定义（核心）

```
AI: "定义字段。每个字段告诉我：字段名、类型、是否必需、默认值、说明。常用类型：
- string: 单行文本
- datetime: 日期时间 (YYYY-MM-DD HH:MM:SS)
- date: 仅日期 (YYYY-MM-DD)
- boolean: true/false
- string[]: 标签数组
- url: 链接
- number: 数字
- object: 任意对象

必需字段建议：title, date
```

用户逐个给出，AI 整理为：

```json
"fields": {
  "title": { "type": "string", "required": true },
  "date": { "type": "date", "required": true },
  "cover": { "type": "string", "required": true, "description": "封面图路径" },
  "tech_stack": { "type": "string[]", "required": false, "description": "技术栈标签" },
  "repo_url": { "type": "url", "required": false },
  "live_url": { "type": "url", "required": false },
  "description": { "type": "string", "required": true },
  "featured": { "type": "boolean", "default": false }
}
```

### 3. 媒体/关系字段（可选）

```
AI: "需要特殊媒体字段吗？
- images[]: 图集
- video_url + embed_type: 视频
- audio_url: 音频
需要关系字段吗？
- related[]: 关联内容
- series: 系列归属"
```

### 4. 模板与分页

```
AI: "列表页布局偏好？（grid/list/masonry，默认 grid）"
AI: "每页显示多少条？（默认 12）"
```

## 内容类型分类与默认字段建议

| 类型 | 典型字段 | 说明 |
|------|---------|------|
| `post` (文章) | title, date, tags[], categories[], cover, excerpt, draft | 标准博客文章 |
| `project` (项目) | title, date, cover, tech_stack[], repo_url, live_url, description, featured | 作品集项目 |
| `video` (视频) | title, date, video_url, embed_type(youtube/bilibili/vimeo/local), cover, tags[] | 视频日志 |
| `gallery` (图集) | title, date, images[], cover, tags[] | 相册/图集 |
| `page` (页面) | title, date, nav, nav_title, nav_order | 独立页面(关于/联系) |
| `talk` (演讲) | title, date, event, video_url, slides_url, cover, description | 会议演讲 |
| `essay` (随笔) | title, date, tags[], cover, excerpt | 短文/随想 |
| `link` (链接) | title, date, url, description, tags[] | 链接收藏/书签 |

## 生成规范

输出 `content-types.json`：

```json
{
  "version": 1,
  "types": {
    "project": {
      "label": "项目",
      "dir": "source/_projects",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": true },
        "cover": { "type": "string", "required": true },
        "tech_stack": { "type": "string[]", "required": false },
        "repo_url": { "type": "url", "required": false },
        "live_url": { "type": "url", "required": false },
        "description": { "type": "string", "required": true },
        "featured": { "type": "boolean", "default": false }
      }
    },
    "post": {
      "label": "文章",
      "dir": "source/_posts",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "datetime", "required": true },
        "tags": { "type": "string[]", "required": false },
        "categories": { "type": "string[]", "required": false },
        "cover": { "type": "string", "required": false },
        "excerpt": { "type": "string", "required": false },
        "draft": { "type": "boolean", "default": false }
      }
    },
    "about": {
      "label": "关于",
      "dir": "source/_about",
      "fields": {
        "title": { "type": "string", "required": true },
        "date": { "type": "date", "required": true },
        "nav": { "type": "boolean", "default": true },
        "nav_title": { "type": "string", "required": false },
        "nav_order": { "type": "number", "required": false }
      }
    }
  },
  "nav_order": ["project", "post", "about"]
}
```

> **注意**：
> - 模板选择由 `template-manifest.json` 的 `templates[]` 声明决定（参考 `prompts/template-manifest-generation.md`）
> - 分页由 `manifest.collections[].pagination` 声明
> - 单例页由 `manifest.collections[].singleton: true` 表达

## 字段类型校验规则

| 类型 | 校验 | 示例 |
|------|------|------|
| `string` | 非空字符串 | `"Hello World"` |
| `datetime` | ISO 8601 日期时间 | `"2025-01-15 14:30:00"` |
| `date` | ISO 8601 日期 | `"2025-01-15"` |
| `boolean` | `true`/`false` | `true` |
| `string[]` | 字符串数组 | `["tag1", "tag2"]` |
| `url` | 合法 URL | `"https://example.com"` |
| `number` | 数字 | `42` |
| `object` | 任意 JSON 对象 | `{"key": "value"}` |

## 生成后的动作

1. 写入 `<SITE_ROOT>/.xiaoyi-ssg/content-types.json`
2. 触发 `template-manifest.json` 同步更新（如新增内容类型，对应 collection 需新增，templates 视用户意图扩展）
3. 创建 `source/_<type>/` 目录
4. 触发 `REGENERATE_PIPELINE` 重新生成对应模板与 manifest

## 给 AI 的提示

> 你是内容建模师。引导用户定义**最小必要字段**，避免过度设计。每个字段要有明确用途（模板渲染、SEO、筛选、展示）。用户不确定时，给出该类型的标准建议。生成的 JSON 必须通过 `schemas/config.schema.json` 校验。
>
> **关键原则**：content-types.json 只定义**数据结构**（内容源、字段、类型），**不定义渲染方式**（列表/详情/分页等）。渲染相关的一切由 template-manifest.json 表达。