# AI Novel Video Generator

AI 驱动的小说创作工具，支持大纲生成、章节写作、智能对话辅助和批量生成。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.11+、FastAPI、Uvicorn、SQLModel + SQLite |
| 前端 | React 18 + TypeScript、Vite、Zustand、TailwindCSS |
| AI 调用 | aiohttp 直连 OpenAI 兼容 API、LangChain（批量生成） |
| 安全 | Fernet 对称加密（API Key 加密存储） |
| 打包 | PyInstaller（桌面应用）、Inno Setup（安装包） |

---

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+

### 开发模式

```bash
# 安装依赖
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

# 一键启动
python start.py
```

启动后访问 `http://localhost:5173`，后端运行在 `http://localhost:8000`，前端自动代理 `/api` 请求。

### 生产打包

```bash
python build.py
```

自动执行 `npm run build` + PyInstaller 打包，输出 `dist/AINovelVideoGenerator/AINovelVideoGenerator.exe`。

可选：用 Inno Setup 打开 `installer/setup.iss` 生成安装包。

### 用户数据存储位置

| 模式 | 设置/数据库/密钥 | 小说项目文件 |
|------|------------------|-------------|
| 开发模式 | `backend/data/` | `projects/` |
| 打包模式 | `%APPDATA%\AINovelVideoGenerator\` | `Documents\AI小说项目\` |

---

## 功能模块

### 1. 模型配置（/models）

配置 AI 模型连接信息，支持多种提供商：

- **支持的提供商**：OpenAI、DeepSeek、Claude、智谱（Zhipu）、自定义兼容 API
- **模型类型**：文本生成（chat）、图片生成（image）、视频生成（video）
- **安全存储**：API Key 使用 Fernet 对称加密后存储在 `models_config.json`
- **连接测试**：添加模型后可一键测试连通性
- **默认模型**：设置一个默认模型供全局使用

### 2. 项目管理（/projects）

每个创作项目包含独立的大纲、章节和对话历史：

- 创建项目时设置名称、描述、类型（玄幻/仙侠/都市/科幻等）、风格、语言
- 项目卡片展示章节数、总字数等统计信息
- 每个项目在文件系统中拥有独立目录

### 3. AI 对话创作（/projects/:id/chat）— 核心创作入口

通过对话方式与 AI 协作，AI 具备工具调用能力（Agent 模式）：

**大纲模式：**
- 描述故事创意，AI 生成结构化大纲（Markdown 表格格式）
- 大纲包含：故事概念、核心冲突、分章节表格（章节 | 核心事件 | 冲突点 | 悬念）
- 「保存大纲」自动解析章节列表并创建章节文件
- 「扩充大纲」在现有章节基础上续写新章节（自动注入已有大纲和章节列表作为上下文）

**章节模式：**
- 选择具体章节进行 AI 辅助写作
- 可启用世界观设定和人物设定作为上下文补充

**Agent 工具调用：**
- AI 通过 OpenAI Function Calling 格式调用工具
- 可用工具：`read_outline`、`save_outline`、`list_chapters`、`read_chapter`、`update_chapter`、`create_chapter`、`delete_chapter`
- 最多 10 轮迭代，前端实时展示工具调用状态和思考过程

**上下文管理：**
- 最近 10 条消息完整保留
- 更早的历史通过 AI 压缩成摘要（缓存在数据库中）
- 避免超出模型上下文窗口限制

### 4. 小说编辑器（/projects/:id/novel）

章节管理和批量生成：

- 左侧章节导航，显示标题、概述、字数
- 导出整部小说为 `.md` 或 `.txt` 格式
- **批量 AI 写作**：一键生成所有章节（SSE 流式），每章目标 3000+ 字，不足时自动续写，支持暂停/继续

### 5. 章节详情（/projects/:id/chapters/:chapterId）

单章节深度编辑：

- 文本编辑器，800ms 防抖自动保存
- **AI 生成**：基于大纲和前文上下文生成章节内容（LangChain 链）
- **AI 续写**：在现有内容基础上继续创作
- **叙事状态追踪**：AI 生成后自动提取主角状态（属性/能力/道具/关系），作为后续章节的上下文
- 右侧对话面板（Agent 模式），AI 回复可一键「插入」编辑器光标位置

### 6. 叙事状态系统

跨章节的主角状态追踪机制：

- 每章生成后自动调用 AI 提取：数值/境界、能力/技能、道具/装备、敌友关系、其他状态
- 状态以 JSON 格式存储在章节文件的 HTML 注释中（`<!--narrative_state:{...}-->`）
- 后续章节写作时，自动注入前情提要作为上下文
- 确保角色状态在长篇创作中保持一致

---

## 运行逻辑

### 系统架构

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite, port 5173)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Projects │ │  Models  │ │ChatPage  │ │NovelEditor│  │
│  │  Page    │ │  Page    │ │(Agent)   │ │& Chapter  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       │            │            │              │        │
│       │     useSSEStream (SSE 流式客户端)       │        │
│       └────────────┴────────────┴──────────────┘        │
│                         │ /api proxy                    │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│  Backend (FastAPI + Uvicorn, port 8000)                  │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │              API Routers (/api)                  │    │
│  │  projects | models | chat | novel | ai-generate │    │
│  └──────────┬──────────────────┬───────────────────┘    │
│             │                  │                        │
│  ┌──────────▼──────┐ ┌────────▼────────┐               │
│  │  Agent Service  │ │ LangChain Service│               │
│  │  (工具调用循环)  │ │ (大纲/章节生成链) │               │
│  └────────┬────────┘ └────────┬────────┘               │
│           │                   │                        │
│  ┌────────▼───────────────────▼────────┐               │
│  │          Chat Service               │               │
│  │  SSE 流式推送 | 上下文压缩 | 历史摘要 │               │
│  └────────────────┬────────────────────┘               │
│                   │ aiohttp                            │
│  ┌────────────────▼────────────────────┐               │
│  │      OpenAI 兼容 API (外部)          │               │
│  │  DeepSeek / OpenAI / Claude / 智谱   │               │
│  └─────────────────────────────────────┘               │
│                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  SQLite DB  │  │ JSON Config  │  │  Markdown    │  │
│  │ (项目/对话)  │  │ (模型配置)   │  │  (章节文件)   │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 双 AI 通道设计

项目中有两条独立的 AI 调用路径：

| 通道 | 入口 | 实现 | 特点 |
|------|------|------|------|
| Agent 通道 | ChatPage 对话 | `agent_service.py` | 支持工具调用（读写大纲/章节），多轮迭代，模型自主决定操作 |
| LangChain 通道 | 编辑器 AI 生成按钮 | `langchain_service.py` | 直接生成内容，注入前 3 章上下文 + 叙事状态，支持批量 |

### 流式通信协议（SSE）

后端通过 Server-Sent Events 实时推送数据到前端：

```
data: {"event": "thinking",     "data": "..."}                     # 模型推理过程（DeepSeek 等思考型模型）
data: {"event": "delta",        "data": "..."}                     # 文本增量
data: {"event": "tool_use",     "data": "read_outline"}            # Agent 工具调用通知
data: {"event": "tool_result",  "data": "..."}                     # 工具执行结果（截取前 200 字符）
data: {"event": "done",         "data": "", "message_id": "..."}   # 完成
data: {"event": "error",        "data": "..."}                     # 错误
```

前端 `useSSEStream` Hook 处理流式数据，包含 120 秒无数据超时监控和中止控制。

### Agent 循环流程

```
用户输入
  │
  ▼
构建消息列表（system prompt + 历史摘要 + 近 10 条消息）
  │
  ▼
┌─── 循环开始（最多 10 次）────────────────────────┐
│                                                  │
│  调用模型 API（streaming）                        │
│    │                                             │
│    ├── 收到 reasoning_content → 发送 thinking 事件│
│    ├── 收到 content → 发送 delta 事件             │
│    └── 收到 tool_calls → 记录工具调用             │
│                                                  │
│  无工具调用？→ 跳出循环                            │
│                                                  │
│  有工具调用？→ 逐个执行工具                        │
│    │                                             │
│    ├── 发送 tool_use 事件                         │
│    ├── 执行工具（读写文件系统）                     │
│    ├── 发送 tool_result 事件                      │
│    └── 将结果加入消息列表                          │
│                                                  │
│  发送 keepalive → 进入下一轮                      │
└──────────────────────────────────────────────────┘
  │
  ▼
保存 assistant 消息到数据库 → 发送 done 事件
```

### 章节文件格式

```markdown
# 第1章：觉醒之日

> 核心事件：主角觉醒异能 | 冲突点：被组织追杀 | 悬念：神秘老者的身份

章节正文内容...

<!--narrative_state:{"stats":"等级1","abilities":"火焰掌控","items":"破损玉佩","relations":"与老者结盟","other":"位于青云山"}-->
```

---

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/api/projects` | 项目 CRUD |
| GET/POST/PUT/DELETE | `/api/models` | 模型配置 CRUD |
| POST | `/api/models/{id}/test` | 测试模型连接 |
| GET | `/api/chat/{project_id}/history` | 获取对话历史 |
| POST | `/api/chat/{project_id}/send` | 流式对话（SSE） |
| POST | `/api/chat/{project_id}/agent` | Agent 对话（SSE + 工具调用） |
| DELETE | `/api/chat/{project_id}/history` | 清空对话 |
| GET | `/api/chat/{project_id}/export` | 导出对话为 Markdown |
| GET/POST/PUT/DELETE | `/api/novel/{project_id}/chapters` | 章节 CRUD |
| GET/PUT | `/api/novel/{project_id}/outline` | 大纲读写 |
| GET | `/api/novel/{project_id}/export` | 导出小说（.md / .txt） |
| POST | `/api/novel/{project_id}/chapters/{id}/summarize` | 章节叙事状态提取 |
| GET | `/api/novel/{project_id}/chapters/{id}/narrative-context` | 获取前文叙事上下文 |
| POST | `/api/ai-generate/{project_id}/outline` | LangChain 大纲生成 |
| POST | `/api/ai-generate/{project_id}/chapter` | LangChain 章节生成/续写/扩展 |
| DELETE | `/api/ai-generate/{project_id}/memory` | 清除 LangChain 记忆 |
| POST | `/api/ai-generate/{project_id}/batch-generate` | 批量章节生成（SSE） |

---

## 项目结构

```
ai_novel_video_generator/
├── start.py                    # 开发模式启动入口（前后端同时启动）
├── build.py                    # 自动化构建脚本
├── backend/
│   ├── main.py                 # FastAPI 应用入口，注册路由和中间件
│   ├── config.py               # 环境配置（开发/打包路径检测）
│   ├── app_launcher.py         # PyInstaller 启动入口
│   ├── db/
│   │   ├── database.py         # SQLite 引擎 & Session 依赖注入
│   │   └── tables.py           # 数据表：Project, ConversationMessage, ConversationSummary
│   ├── routers/
│   │   ├── projects.py         # /api/projects
│   │   ├── models.py           # /api/models
│   │   ├── chat.py             # /api/chat（流式对话 + Agent）
│   │   ├── novel.py            # /api/novel（章节 + 大纲 + 导出）
│   │   └── ai_generate.py      # /api/ai-generate（LangChain 生成）
│   ├── services/
│   │   ├── chat_service.py     # 流式对话核心：SSE 推送、上下文压缩、历史摘要
│   │   ├── agent_service.py    # Agent 循环：工具调用（读写大纲/章节）+ keepalive
│   │   ├── novel_service.py    # 章节文件读写（Markdown + 叙事状态）
│   │   ├── langchain_service.py # LangChain 链：大纲生成 + 章节生成
│   │   ├── model_service.py    # 模型配置管理（JSON 文件 + Fernet 加密）
│   │   ├── memory_service.py   # LangChain 对话记忆管理
│   │   └── project_service.py  # 项目 CRUD + 文件系统初始化
│   ├── models/
│   │   ├── chat.py             # SendMessageRequest, StreamEvent, ChatMessage
│   │   └── novel.py            # ChapterCreate, ChapterRead, ChapterContent, NarrativeState
│   └── utils/
│       ├── encryption.py       # Fernet 加密/解密
│       └── file_utils.py       # safe_path() 路径校验 + atomic_write 原子写入
├── frontend/
│   ├── vite.config.ts          # Vite 配置（/api 代理到 8000 端口）
│   └── src/
│       ├── App.tsx             # 路由定义 + AppShell 侧边栏布局
│       ├── api/
│       │   ├── chatApi.ts      # 对话相关 API 调用
│       │   └── novelApi.ts     # 小说/章节相关 API 调用
│       ├── components/
│       │   ├── chat/
│       │   │   └── ChatPage.tsx          # 主创作页：对话 + 大纲管理 + 章节列表
│       │   ├── novel/
│       │   │   ├── NovelEditorPage.tsx    # 小说编辑器：章节导航 + 批量生成
│       │   │   ├── ChapterDetailPage.tsx  # 章节详情：编辑器 + AI 生成 + 对话辅助
│       │   │   ├── AIGenerateButtons.tsx  # AI 生成/续写/扩展按钮组
│       │   │   └── BatchGeneratePanel.tsx # 批量写作面板（进度 + 暂停/继续）
│       │   ├── projects/
│       │   │   └── ProjectsPage.tsx      # 项目列表 + 新建项目
│       │   └── models/
│       │       └── ModelConfigPage.tsx   # 模型配置管理
│       ├── hooks/
│       │   ├── useSSEStream.ts  # SSE 流式客户端（超时监控 + 中止控制）
│       │   └── useDebounce.ts   # 防抖 Hook（自动保存用）
│       ├── store/
│       │   ├── useChatStore.ts   # 对话状态（消息 + 流式缓冲 + 思考文本）
│       │   ├── useNovelStore.ts  # 小说状态（章节列表 + 保存状态）
│       │   ├── useProjectStore.ts # 项目状态
│       │   └── useModelStore.ts  # 模型状态
│       ├── constants/
│       │   └── systemPrompts.ts  # 系统提示词预设（大纲/章节/人物/世界观/自由创作）
│       └── types/
│           ├── chat.ts           # ChatMessage, StreamEvent, MessageRole
│           └── novel.ts          # ChapterRead, ChapterContent, NarrativeState
├── projects/                     # 项目文件存储目录
├── installer/
│   └── setup.iss                 # Inno Setup 安装包脚本
└── app.spec                      # PyInstaller 打包配置
```

### 项目目录结构（每个项目）

```
projects/{project_id}/
├── outline.md              # 故事大纲
├── characters.json         # 人物设定
├── chapters/
│   ├── chapter_1.md        # 章节内容（标题 + 概述 + 正文 + 叙事状态）
│   ├── chapter_2.md
│   └── ...
└── generated/
    ├── images/             # （预留）AI 生成图片
    ├── videos/             # （预留）AI 生成视频
    └── scenes.json         # （预留）场景数据
```

---

## 设计决策

- **双 AI 通道**：对话页使用 Agent 循环（支持工具调用，模型自主决定操作），编辑器页使用 LangChain 链（直接生成，适合批量）
- **文件存储优先**：章节内容以 Markdown 文件存储而非数据库，便于直接查看和编辑
- **原子写入**：所有文件写入通过临时文件 + `os.replace()` 实现，防止写入中断导致损坏
- **路径安全**：所有文件系统访问经过 `safe_path()` 校验，防止路径穿越攻击
- **上下文压缩**：超过 10 条的对话历史自动压缩为 AI 摘要，控制 Token 消耗
- **API Key 加密**：使用 Fernet 对称加密，密钥文件仅限当前用户读取
- **模型配置文件化**：模型配置存储在 JSON 文件而非数据库，便于手动备份和迁移
