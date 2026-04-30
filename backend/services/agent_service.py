"""Agent engine using LangGraph ReAct Agent.

Uses LangGraph's create_react_agent for tool-calling orchestration,
replacing the previous hand-written agentic loop.
"""
from typing import AsyncGenerator

from sqlmodel import Session

from models.chat import SendMessageRequest
from services.langgraph_agent import stream_langgraph_agent


async def stream_agent(
    session: Session, project_id: str, request: SendMessageRequest
) -> AsyncGenerator[str, None]:
    """Stream agent responses as SSE events.

    Delegates to the LangGraph-based agent implementation.
    """
    async for chunk in stream_langgraph_agent(session, project_id, request):
        yield chunk
