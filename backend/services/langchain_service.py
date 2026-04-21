"""LangChain chains for novel generation."""
import re
from typing import Optional

from langchain.chains import LLMChain
from langchain_core.prompts import PromptTemplate

from services.langchain_llm import CustomLLM
from services.memory_service import NovelMemoryManager, OutlineMemoryManager

_SUMMARY_RE = re.compile(r"【章节概括】\s*(.+)", re.DOTALL)


def parse_content_and_summary(text: str) -> tuple[str, str]:
    """Split model output into (content, summary). Returns empty summary if marker not found."""
    m = _SUMMARY_RE.search(text)
    if m:
        content = text[:m.start()].rstrip()
        summary = m.group(1).strip().split("\n")[0].strip()
        return content, summary
    return text.strip(), ""


class OutlineGenerationChain:
    """Chain for generating and editing novel outlines with memory."""

    def __init__(self, project_id: str, model_id: Optional[str] = None):
        self.project_id = project_id
        self.memory_manager = OutlineMemoryManager(project_id)
        self.llm = CustomLLM(model_id=model_id)

        # Prompt template for outline generation
        self.prompt = PromptTemplate(
            input_variables=["context", "user_request", "chat_history"],
            template="""你是一位专业的小说大纲创作助手。

{context}

对话历史：
{chat_history}

用户需求：
{user_request}

请根据用户需求和当前大纲，生成或修改小说大纲。大纲应该包括：
1. 故事背景和世界观
2. 主要角色设定
3. 情节发展（分章节概述）
4. 核心冲突和高潮
5. 结局方向

请以 Markdown 格式输出大纲。"""
        )

        self.chain = LLMChain(
            llm=self.llm,
            prompt=self.prompt,
            memory=self.memory_manager.memory,
            verbose=True
        )

    async def generate(self, user_request: str) -> str:
        """Generate or update outline based on user request."""
        context = self.memory_manager.get_full_context()
        chat_history = self._format_chat_history()

        result = await self.chain.arun(
            context=context,
            user_request=user_request,
            chat_history=chat_history
        )

        return result

    def _format_chat_history(self) -> str:
        """Format chat history for the prompt."""
        memory_vars = self.memory_manager.get_memory_variables()
        messages = memory_vars.get("chat_history", [])

        if not messages:
            return "（无对话历史）"

        formatted = []
        for msg in messages:
            if hasattr(msg, "type"):
                role = "用户" if msg.type == "human" else "助手"
                formatted.append(f"{role}: {msg.content}")

        return "\n".join(formatted[-5:])  # Last 5 messages

    def clear_memory(self):
        """Clear conversation memory."""
        self.memory_manager.clear()


class ChapterGenerationChain:
    """Chain for generating novel chapters with context awareness."""

    def __init__(self, project_id: str, model_id: Optional[str] = None):
        self.project_id = project_id
        self.memory_manager = NovelMemoryManager(project_id)
        self.llm = CustomLLM(model_id=model_id, temperature=0.8, max_tokens=8192)

        # Prompt template for chapter generation
        self.prompt = PromptTemplate(
            input_variables=["outline", "chapter_context", "chapter_info", "user_request"],
            template="""你是一位专业的小说作家。请根据大纲和前文，创作连贯的小说章节。

{outline}

{chapter_context}

当前章节信息：
{chapter_info}

用户要求：
{user_request}

创作要求：
1. 保持与前文的连贯性（人物性格、情节发展、世界观设定）
2. 符合大纲的整体规划
3. 语言生动，情节紧凑
4. 适当的细节描写和对话
5. 章节长度建议 2000-4000 字

输出格式要求：
1. 先输出小说正文（不含章节标题、不含"第X章 完"等结束标记）
2. 正文结束后，另起一行输出"【章节概括】"，后面跟一句话概括本章核心情节（100字以内）"""
        )

        self.chain = LLMChain(
            llm=self.llm,
            prompt=self.prompt,
            verbose=True
        )

    async def generate(
        self,
        chapter_order: int,
        chapter_title: str,
        chapter_summary: Optional[str] = None,
        user_request: str = "按照大纲创作这一章节"
    ) -> str:
        """Generate a chapter with full context awareness."""
        outline = self.memory_manager.get_outline_context()
        chapter_context = self.memory_manager.get_chapter_context(chapter_order)

        chapter_info_parts = [f"章节序号：第 {chapter_order} 章", f"章节标题：{chapter_title}"]
        if chapter_summary:
            chapter_info_parts.append(f"章节概述：{chapter_summary}")

        chapter_info = "\n".join(chapter_info_parts)

        result = await self.chain.arun(
            outline=outline,
            chapter_context=chapter_context,
            chapter_info=chapter_info,
            user_request=user_request
        )

        return result

    async def continue_chapter(
        self,
        chapter_order: int,
        current_content: str,
        user_request: str = "继续写下去"
    ) -> str:
        """Continue writing an existing chapter."""
        outline = self.memory_manager.get_outline_context()
        chapter_context = self.memory_manager.get_chapter_context(chapter_order)

        # Modified prompt for continuation
        continuation_prompt = f"""你是一位专业的小说作家。请继续创作以下章节。

{outline}

{chapter_context}

当前章节已有内容：
{current_content[-1000:]}

用户要求：
{user_request}

直接衔接上文继续写作，保持风格和情节的连贯性。
输出格式要求：
1. 先输出续写的正文（不含"第X章 完"等结束标记）
2. 正文结束后，另起一行输出"【章节概括】"，后面用一句话概括本章到目前为止的完整情节（100字以内）"""

        result = await self.llm._acall(continuation_prompt)
        return result

    async def expand_section(
        self,
        chapter_order: int,
        section_description: str,
        user_request: str
    ) -> str:
        """Expand a specific section based on the outline."""
        outline = self.memory_manager.get_outline_context()
        chapter_context = self.memory_manager.get_chapter_context(chapter_order)

        expansion_prompt = f"""你是一位专业的小说作家。请根据大纲和前文，扩写指定的章节部分。

{outline}

{chapter_context}

需要扩写的部分：
{section_description}

用户要求：
{user_request}

请创作这一部分的详细内容，保持与整体的连贯性。"""

        result = await self.llm._acall(expansion_prompt)
        return result

    def clear_memory(self):
        """Clear conversation memory."""
        self.memory_manager.clear()
