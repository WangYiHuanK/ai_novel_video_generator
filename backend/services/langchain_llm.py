"""Custom LangChain LLM wrapper that reuses existing aiohttp logic."""
import json
from typing import Any, List, Optional

import aiohttp
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.llms import BaseLLM
from langchain_core.outputs import Generation, LLMResult

from services.model_service import get_default_model_raw, get_model_raw
from utils.encryption import decrypt

_DEFAULT_BASE_URL = "https://api.openai.com/v1"


class CustomLLM(BaseLLM):
    """Custom LLM that wraps existing aiohttp API calls."""

    model_id: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 4096

    @property
    def _llm_type(self) -> str:
        return "custom_openai_compatible"

    def _generate(
        self,
        prompts: List[str],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> LLMResult:
        """Sync generate - not implemented, use async version."""
        raise NotImplementedError("Use async version (agenerate) instead")

    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        """Sync call - not implemented, use async version."""
        raise NotImplementedError("Use async version (acall) instead")

    async def _acall(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        """Async call to the API."""
        # Resolve model
        raw = None
        if self.model_id:
            raw = get_model_raw(self.model_id)
        if raw is None:
            raw = get_default_model_raw()
        if raw is None:
            raise ValueError("No model configured")

        # Prepare API call
        api_key = decrypt(raw["api_key"])
        base_url = (raw.get("base_url") or _DEFAULT_BASE_URL).rstrip("/")
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        messages = [{"role": "user", "content": prompt}]
        payload = {
            "model": raw["model_name"],
            "messages": messages,
            "temperature": kwargs.get("temperature", self.temperature),
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "stream": False,
        }

        # Make API call
        async with aiohttp.ClientSession() as http:
            async with http.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"HTTP {resp.status}: {body}")

                data = await resp.json()
                content = data["choices"][0]["message"]["content"]
                return content

    async def _agenerate(
        self,
        prompts: List[str],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> LLMResult:
        """Generate responses for multiple prompts."""
        generations = []
        for prompt in prompts:
            text = await self._acall(prompt, stop=stop, run_manager=run_manager, **kwargs)
            generations.append([Generation(text=text)])
        return LLMResult(generations=generations)
