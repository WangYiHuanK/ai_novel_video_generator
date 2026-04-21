"""Memory management for novel generation with LangChain."""
from pathlib import Path
from typing import List, Optional

from langchain.memory import ConversationBufferMemory
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from config import PROJECTS_BASE_DIR
from services.novel_service import get_chapter, get_outline, list_chapters
from utils.file_utils import safe_path


class NovelMemoryManager:
    """Manages memory for novel generation, including outline and chapter context."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.memory = ConversationBufferMemory(
            return_messages=True,
            memory_key="chat_history",
            input_key="input",
            output_key="output"
        )

    def get_outline_context(self) -> str:
        """Get the current outline as context."""
        outline = get_outline(self.project_id)
        if not outline:
            return "当前还没有大纲。"
        return f"当前小说大纲：\n\n{outline}"

    def get_chapter_context(self, current_order: int, context_window: int = 3) -> str:
        """Get context from previous chapters to maintain coherence.

        Args:
            current_order: The order of the chapter being generated
            context_window: Number of previous chapters to include
        """
        chapters = list_chapters(self.project_id)
        if not chapters:
            return "这是第一章，没有前文。"

        # Get previous chapters within the context window
        prev_chapters = [ch for ch in chapters if ch.order < current_order]
        prev_chapters = sorted(prev_chapters, key=lambda x: x.order, reverse=True)[:context_window]
        prev_chapters = list(reversed(prev_chapters))  # Back to chronological order

        if not prev_chapters:
            return "这是第一章，没有前文。"

        context_parts = ["前文回顾："]
        for ch in prev_chapters:
            is_prev = (ch.order == current_order - 1)
            if ch.summary:
                context_parts.append(f"第{ch.order}章 {ch.title}：{ch.summary}")
            else:
                full_ch = get_chapter(self.project_id, ch.id)
                if full_ch and full_ch.content:
                    preview = full_ch.content[:200].rsplit("。", 1)[0] + "。" if "。" in full_ch.content[:200] else full_ch.content[:150] + "…"
                    context_parts.append(f"第{ch.order}章 {ch.title}：{preview}")
                else:
                    context_parts.append(f"第{ch.order}章 {ch.title}")

            if is_prev:
                full_ch = get_chapter(self.project_id, ch.id)
                if full_ch and full_ch.content:
                    tail = full_ch.content[-500:]
                    context_parts.append(f"（上一章结尾）\n{tail}")

        return "\n".join(context_parts)

    def get_full_context(self, current_order: Optional[int] = None) -> str:
        """Get full context including outline and previous chapters."""
        parts = [self.get_outline_context()]

        if current_order is not None:
            parts.append("\n" + self.get_chapter_context(current_order))

        return "\n\n".join(parts)

    def add_user_message(self, content: str):
        """Add a user message to memory."""
        self.memory.chat_memory.add_user_message(content)

    def add_ai_message(self, content: str):
        """Add an AI message to memory."""
        self.memory.chat_memory.add_ai_message(content)

    def clear(self):
        """Clear the conversation memory."""
        self.memory.clear()

    def get_memory_variables(self) -> dict:
        """Get memory variables for use in chains."""
        return self.memory.load_memory_variables({})

    def save_context(self, inputs: dict, outputs: dict):
        """Save context to memory."""
        self.memory.save_context(inputs, outputs)


class OutlineMemoryManager:
    """Specialized memory manager for outline generation and editing."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.memory = ConversationBufferMemory(
            return_messages=True,
            memory_key="chat_history",
            input_key="input",
            output_key="output"
        )

    def get_current_outline(self) -> str:
        """Get the current outline."""
        outline = get_outline(self.project_id)
        if not outline:
            return "当前还没有大纲。"
        return outline

    def get_chapters_summary(self) -> str:
        """Get a summary of existing chapters."""
        chapters = list_chapters(self.project_id)
        if not chapters:
            return "还没有生成任何章节。"

        summary_parts = ["已生成的章节：\n"]
        for ch in chapters:
            summary_parts.append(f"- 第{ch.order}章：{ch.title} ({ch.word_count}字)")
            if ch.summary:
                summary_parts.append(f"  概述：{ch.summary}")

        return "\n".join(summary_parts)

    def get_full_context(self) -> str:
        """Get full context for outline generation."""
        parts = [
            "当前大纲：",
            self.get_current_outline(),
            "",
            self.get_chapters_summary()
        ]
        return "\n".join(parts)

    def add_user_message(self, content: str):
        """Add a user message to memory."""
        self.memory.chat_memory.add_user_message(content)

    def add_ai_message(self, content: str):
        """Add an AI message to memory."""
        self.memory.chat_memory.add_ai_message(content)

    def clear(self):
        """Clear the conversation memory."""
        self.memory.clear()

    def get_memory_variables(self) -> dict:
        """Get memory variables for use in chains."""
        return self.memory.load_memory_variables({})

    def save_context(self, inputs: dict, outputs: dict):
        """Save context to memory."""
        self.memory.save_context(inputs, outputs)
