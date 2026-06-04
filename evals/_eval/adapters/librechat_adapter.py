"""
LibreChat adapter for the eval runner.

Calls LibreChat's OpenAI-compatible API (/api/agents/v1/chat/completions)
so eval runs generate real Langfuse traces via LibreChat's built-in
tracing integration.

Env vars:
    LIBRECHAT_BASE_URL  — e.g. http://localhost:3080
    LIBRECHAT_API_KEY   — Agent API key from LibreChat Settings → Data
    LIBRECHAT_AGENT_ID  — Agent ID to invoke

Optional (for LLM judge — avoids routing judge prompts through the agent):
    EVAL_JUDGE_ENDPOINT — Name of a custom endpoint in librechat.yaml to
                          use as the judge (e.g. "Azure AU"). Reads baseURL,
                          apiKey, headers, and first model from the config.
    EVAL_JUDGE_MODEL    — Override model from the endpoint config.
"""

import json
import os
from pathlib import Path
from typing import List, Optional

import httpx
import yaml
from openai import OpenAI
from dotenv import load_dotenv

from .base import AgentAdapter, AgentResponse, ToolCallRecord

load_dotenv(override=True)

_BASE_URL = os.environ.get("LIBRECHAT_BASE_URL", "http://localhost:3080")
_API_KEY = os.environ.get("LIBRECHAT_API_KEY", "")
_AGENT_ID = os.environ.get("LIBRECHAT_AGENT_ID", "")

_JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "")
_JUDGE_ENDPOINT_NAME = os.environ.get("EVAL_JUDGE_ENDPOINT", "")

_LIBRECHAT_YAML = Path(__file__).resolve().parents[3] / "librechat.yaml"


def _expand_vars(value: str) -> str:
    """Expand ${VAR} references in a string using os.environ."""
    return os.path.expandvars(value)


def _load_endpoint_from_yaml(name: str) -> Optional[dict]:
    """Load a custom endpoint config by name from librechat.yaml."""
    if not _LIBRECHAT_YAML.exists():
        return None
    with open(_LIBRECHAT_YAML, "r") as f:
        config = yaml.safe_load(f)
    endpoints = config.get("endpoints", {})
    custom = endpoints.get("custom", [])
    for ep in custom:
        if ep.get("name") == name:
            return ep
    return None


def _resolve_judge_config() -> Optional[dict]:
    """Resolve judge LLM config from EVAL_JUDGE_ENDPOINT in librechat.yaml."""
    if not _JUDGE_ENDPOINT_NAME:
        return None

    ep = _load_endpoint_from_yaml(_JUDGE_ENDPOINT_NAME)
    if ep is None:
        raise ValueError(
            f"EVAL_JUDGE_ENDPOINT='{_JUDGE_ENDPOINT_NAME}' not found in {_LIBRECHAT_YAML}"
        )
    models = ep.get("models", {}).get("default", [])
    raw_headers = ep.get("headers", {})
    headers = {k: _expand_vars(v) if isinstance(v, str) else v for k, v in raw_headers.items()}
    return {
        "base_url": _expand_vars(ep["baseURL"]),
        "api_key": _expand_vars(ep.get("apiKey", "dummy")),
        "model": _JUDGE_MODEL or (models[0] if models else "gpt-4o"),
        "headers": headers,
    }


class LibreChatAdapter(AgentAdapter):
    """Adapter that calls a LibreChat agent via its OpenAI-compatible API."""

    def __init__(self):
        if not _API_KEY:
            raise ValueError("LIBRECHAT_API_KEY env var is required for LibreChatAdapter")
        if not _AGENT_ID:
            raise ValueError("LIBRECHAT_AGENT_ID env var is required for LibreChatAdapter")

        self._client = OpenAI(
            base_url=f"{_BASE_URL.rstrip('/')}/api/agents/v1",
            api_key=_API_KEY,
        )
        self._model = _AGENT_ID

    def get_agent_metadata(self) -> dict:
        """Fetch agent metadata from LibreChat's remote models endpoint."""
        try:
            import httpx as _httpx
            url = f"{_BASE_URL.rstrip('/')}/api/agents/v1/models/{self._model}"
            resp = _httpx.get(
                url,
                headers={"Authorization": f"Bearer {_API_KEY}"},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "id": data.get("id", self._model),
                    "name": data.get("name"),
                    "description": data.get("description"),
                    "provider": data.get("provider"),
                    "model": data.get("model"),
                    "version": data.get("version"),
                }
        except Exception:
            pass
        return {"id": self._model}

    def invoke_text(self, query: str, context: str) -> AgentResponse:
        if context:
            content = f"{query}\n\n---\nSource material:\n{context}"
        else:
            content = query
        return self._call([{"role": "user", "content": content}])

    def invoke_file(self, query: str, file_paths: List[Path]) -> AgentResponse:
        file_contents = []
        for fp in file_paths:
            with open(fp, "r") as f:
                file_contents.append(f"--- File: {fp.name} ---\n{f.read()}")
        context = "\n\n".join(file_contents)
        content = f"{query}\n\n---\nSource material:\n{context}"
        return self._call([{"role": "user", "content": content}])

    def invoke_multi_turn(self, turns: List[dict]) -> AgentResponse:
        messages = [{"role": t["role"], "content": t["content"]} for t in turns]
        return self._call(messages)

    def invoke_sequential(
        self, turns: List[dict], source_text: Optional[str] = None,
    ) -> List[AgentResponse]:
        history: list = []
        responses: List[AgentResponse] = []

        for turn in turns:
            content = turn["content"]
            if turn.get("attach_source") and source_text:
                content = f"{content}\n\n---\nSource material:\n{source_text}"
            history.append({"role": "user", "content": content})

            response = self._call(list(history))
            responses.append(response)
            history.append({"role": "assistant", "content": response.content})

        return responses

    def get_evaluator(self) -> Optional["EvaluatorModel"]:
        """Return an EvaluatorModel backed by a direct LLM gateway call.

        Resolves config from EVAL_JUDGE_ENDPOINT (reads librechat.yaml).
        Returns None if not configured, causing the runner to fall back
        to adapter-as-judge.
        """
        judge_cfg = _resolve_judge_config()
        if judge_cfg is None:
            return None

        from ..metrics import EvaluatorModel

        judge_client = OpenAI(
            base_url=judge_cfg["base_url"],
            api_key=judge_cfg["api_key"],
            default_headers=judge_cfg["headers"] or None,
            http_client=httpx.Client(verify=False),
        )
        model = judge_cfg["model"]

        def generate_fn(prompt: str) -> str:
            response = judge_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            return response.choices[0].message.content or ""

        return EvaluatorModel(generate_fn, model_name=f"Direct-Judge-{model}")

    def _call(self, messages: list) -> AgentResponse:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            stream=False,
        )
        choice = response.choices[0]
        content = choice.message.content or ""

        tools_called = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                args = tc.function.arguments
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        args = {}
                tools_called.append(ToolCallRecord(
                    name=tc.function.name,
                    input_parameters=args if isinstance(args, dict) else {},
                ))

        return AgentResponse(content=content, tools_called=tools_called, raw=response)
