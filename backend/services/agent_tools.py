"""LangChain tool definitions for the novel writing agent.

Factory function `make_novel_tools(project_id)` returns 8 tools that close over
the project_id, matching the original _execute_tool dispatch in agent_service.
"""
import re

from langchain_core.tools import tool

from models.novel import ChapterCreate
from services import novel_service


def make_novel_tools(project_id: str) -> list:
    """Create a list of LangChain tools bound to a specific project."""

    @tool
    def read_outline() -> str:
        """读取当前项目的故事大纲"""
        content = novel_service.get_outline(project_id)
        return content if content else "（大纲为空）"

    @tool
    def save_outline(content: str) -> str:
        """保存/更新故事大纲内容。content: 大纲的完整 Markdown 内容"""
        novel_service.save_outline(project_id, content)
        return (
            "大纲已保存。请将完整大纲以 Markdown 表格格式展示给用户"
            "（表头：| 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |）。"
        )

    @tool
    def list_chapters() -> str:
        """列出当前项目的所有章节（编号、标题、字数）"""
        chapters = novel_service.list_chapters(project_id)
        if not chapters:
            return "（暂无章节）"
        lines = [f"- {ch.id}: {ch.title}（{ch.word_count} 字）" for ch in chapters]
        return "\n".join(lines)

    @tool
    def read_chapter(chapter_id: str) -> str:
        """读取指定章节的完整内容。chapter_id: 如 chapter_1"""
        ch = novel_service.get_chapter(project_id, chapter_id)
        if ch is None:
            return f"章节 {chapter_id} 不存在"
        return f"# {ch.title}\n\n{ch.content}"

    @tool
    def update_chapter(
        chapter_id: str, title: str = "", content: str = ""
    ) -> str:
        """更新指定章节的标题和/或内容。chapter_id: 如 chapter_1"""
        existing = novel_service.get_chapter(project_id, chapter_id)
        if existing is None:
            return f"章节 {chapter_id} 不存在"
        new_title = title if title else existing.title
        new_content = content if content else existing.content
        novel_service.save_chapter(project_id, chapter_id, new_title, new_content)
        return f"章节 {chapter_id} 已更新"

    @tool
    def create_chapter(
        order: int, title: str, content: str, summary: str = ""
    ) -> str:
        """创建新章节。order: 章节序号, title: 标题, content: 正文内容"""
        data = ChapterCreate(
            order=order,
            title=title,
            content=content,
            summary=summary or None,
        )
        ch = novel_service.create_chapter(project_id, data)
        return f"章节 {ch.id} 已创建：{ch.title}"

    @tool
    def delete_chapter(chapter_id: str) -> str:
        """删除指定章节。chapter_id: 如 chapter_1"""
        ok = novel_service.delete_chapter(project_id, chapter_id)
        return "已删除" if ok else f"章节 {chapter_id} 不存在"

    @tool
    def expand_outline(
        from_chapter: int = 0,
        from_part: str = "",
        count: int = 5,
        instruction: str = "",
    ) -> str:
        """扩充大纲，在现有内容基础上续写新章节。count: 新增章节数, instruction: 额外要求"""
        content = novel_service.get_outline(project_id)
        if not content:
            return "（大纲为空，请先创建大纲）"
        nums = [int(m) for m in re.findall(r"第(\d+)章", content)]
        max_chapter = max(nums) if nums else 0

        hint = f"当前大纲内容如下：\n\n{content}\n\n---\n"
        hint += f"当前最大章节号：第{max_chapter}章。\n"
        if from_chapter:
            hint += f"用户要求从第{from_chapter}章开始扩充。\n"
        elif from_part:
            hint += f"用户要求从「{from_part}」开始扩充。\n"
        else:
            hint += f"请从第{max_chapter + 1}章开始续写。\n"
        hint += f"新增约{count}章。\n"
        if instruction:
            hint += f"用户额外要求：{instruction}\n"
        hint += (
            "完成后必须调用 save_outline 保存完整大纲"
            "（原有全部内容 + 新增章节），不得省略任何已有内容。\n"
        )
        hint += (
            "输出格式必须严格使用 Markdown 表格："
            "| 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |，"
            "分隔行只用英文字符 | :--- |。"
        )
        return hint

    return [
        read_outline,
        save_outline,
        list_chapters,
        read_chapter,
        update_chapter,
        create_chapter,
        delete_chapter,
        expand_outline,
    ]
