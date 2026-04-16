# LangChain 集成说明

## 概述

已成功集成 LangChain 到 AI 小说视频生成器项目，实现了带记忆的智能小说生成功能。

## 核心功能

### 1. 记忆管理
- **大纲记忆**：记住用户对大纲的修改需求和对话历史
- **章节上下文记忆**：生成章节时自动加载前 3 章内容，保持连贯性
- **对话历史**：保留最近 5 轮对话，理解用户意图

### 2. 大纲生成
- 根据用户需求生成完整小说大纲
- 支持迭代修改，AI 会记住之前的讨论
- 自动保存到 `outline.md`

### 3. 章节生成
- **智能生成**：根据大纲和前文自动创作章节
- **续写功能**：继续写当前章节，保持风格连贯
- **部分扩写**：针对大纲中的某个部分进行详细扩写

### 4. 连贯性保证
- 自动加载大纲作为上下文
- 读取前几章内容（可配置窗口大小）
- 保持人物性格、世界观、情节发展的一致性

## 技术架构

### 后端文件结构
```
backend/
├── services/
│   ├── langchain_llm.py          # 自定义 LLM 包装器
│   ├── memory_service.py         # 记忆管理服务
│   └── langchain_service.py      # Chain 实现
├── routers/
│   └── ai_generate.py            # API 端点
└── requirements.txt              # 新增 LangChain 依赖
```

### 前端文件结构
```
frontend/src/
├── api/
│   └── aiGenerateApi.ts          # AI 生成 API 客户端
└── components/novel/
    ├── AIGenerateButtons.tsx     # AI 生成按钮组件
    └── NovelEditorPage.tsx       # 集成 AI 按钮
```

## API 端点

### 1. 生成大纲
```
POST /api/ai-generate/{project_id}/outline
Body: {
  "user_request": "创作一个武侠小说大纲",
  "model_id": "optional"
}
```

### 2. 生成章节
```
POST /api/ai-generate/{project_id}/chapter
Body: {
  "chapter_order": 1,
  "chapter_title": "初入江湖",
  "chapter_summary": "主角离开家乡，开始冒险",
  "user_request": "按照大纲创作",
  "model_id": "optional"
}
```

### 3. 续写章节
```
POST /api/ai-generate/{project_id}/chapter/continue
Body: {
  "chapter_id": "chapter_1",
  "current_content": "当前章节内容...",
  "user_request": "继续写下去",
  "model_id": "optional"
}
```

### 4. 扩写部分
```
POST /api/ai-generate/{project_id}/chapter/expand
Body: {
  "chapter_order": 1,
  "section_description": "主角与神秘老者的对话",
  "user_request": "详细描写这段对话",
  "model_id": "optional"
}
```

### 5. 清除记忆
```
DELETE /api/ai-generate/{project_id}/memory/outline
DELETE /api/ai-generate/{project_id}/memory/chapter
```

## 使用流程

### 典型工作流程

1. **创建项目**
   - 在项目管理页面创建新项目

2. **生成大纲**
   - 使用聊天功能或 API 生成大纲
   - 可以多轮对话完善大纲
   - AI 会记住之前的讨论

3. **创建章节**
   - 在章节列表点击 + 创建空章节
   - 填写章节标题和概述

4. **AI 生成内容**
   - 点击 "AI 生成" 按钮，自动创作章节
   - AI 会参考大纲和前文，保持连贯性

5. **续写或修改**
   - 如果内容不够，点击 "AI 续写"
   - 或使用对话功能进行局部修改

6. **导出作品**
   - 完成后导出为 .md 或 .txt 格式

## 配置说明

### 记忆窗口大小
在 `memory_service.py` 中可以调整：
```python
def get_chapter_context(self, current_order: int, context_window: int = 3)
```
- `context_window=3`：默认加载前 3 章
- 可根据模型上下文长度调整

### 生成参数
在 `langchain_service.py` 中可以调整：
```python
self.llm = CustomLLM(
    model_id=model_id,
    temperature=0.8,    # 创意度
    max_tokens=8192     # 最大长度
)
```

## 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

新增依赖：
- `langchain==0.3.0`
- `langchain-core==0.3.0`
- `langchain-community==0.3.0`

## 优势

### 相比原有方案
1. **记忆能力**：AI 能记住之前的对话和大纲
2. **上下文感知**：自动加载前文，保持连贯性
3. **结构化生成**：通过 Chain 组织复杂的生成流程
4. **易于扩展**：后续可以轻松添加图片、视频生成

### 相比其他方案
- **vs instructor**：支持多步推理和记忆
- **vs pydantic-ai**：更成熟的生态系统
- **vs 手动 JSON**：自动处理上下文和记忆

## 后续扩展

### 1. 图片生成
```python
class ImageGenerationChain:
    """根据章节内容生成配图"""
    async def generate_scene_images(self, chapter_content: str):
        # 分析场景
        # 调用 DALL-E / Stable Diffusion
        pass
```

### 2. 视频生成
```python
class VideoGenerationChain:
    """将章节转换为视频"""
    async def generate_video(self, chapter_id: str):
        # 场景分析 → 图片生成 → 视频合成 → 配音
        pass
```

### 3. 多模态 Agent
```python
class MultiModalAgent:
    """统一管理文本、图片、视频生成"""
    tools = [
        TextGenerator(),
        ImageGenerator(),
        VideoGenerator(),
        AudioGenerator()
    ]
```

## 注意事项

1. **API 密钥**：确保在模型配置中设置了有效的 API 密钥
2. **上下文长度**：注意模型的上下文限制，避免加载过多前文
3. **成本控制**：生成长文本会消耗较多 token，注意成本
4. **错误处理**：API 调用可能失败，前端已做基本错误提示

## 故障排查

### 问题：生成失败
- 检查模型配置是否正确
- 检查 API 密钥是否有效
- 查看后端日志：`uvicorn main:app --reload --port 8000`

### 问题：内容不连贯
- 增加 `context_window` 大小
- 检查大纲是否完整
- 确保前几章内容已保存

### 问题：记忆不生效
- 记忆是会话级别的，重启后会清空
- 可以调用清除记忆 API 重置对话

## 总结

通过集成 LangChain，项目现在具备了：
- ✅ 智能记忆管理
- ✅ 上下文感知生成
- ✅ 多步推理能力
- ✅ 易于扩展的架构

为后续的图片和视频生成打下了坚实基础。
