# `adapters` — Agent Framework Adapters

This package defines the abstract interface between the eval runner and any agent framework. The runner is framework-agnostic — it only knows about `AgentAdapter`, `AgentResponse`, and `ToolCallRecord`.

## Contents

- [`base.py`](base.py) — Abstract base class and shared dataclasses
- [`librechat_adapter.py`](librechat_adapter.py) — LibreChat OpenAI-compatible API adapter

---

## Core Types (`base.py`)

### `ToolCallRecord`

A single tool invocation captured during an agent run.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Tool name (e.g. `"skill"`) |
| `input_parameters` | `dict` | Arguments passed to the tool |

### `AgentResponse`

The standardised return value from every adapter invoke. The runner and metrics layer only interact with this type.

| Field | Type | Description |
|-------|------|-------------|
| `content` | `str` | Agent's text output — what metrics evaluate |
| `tools_called` | `List[ToolCallRecord]` | Tools the agent invoked during execution |
| `retrieval_context` | `List[str]` | RAG chunks surfaced by the agent (empty if not a RAG agent) |
| `raw` | `Any` | Raw response object from the framework (for debugging) |

When `retrieval_context` is empty, the runner falls back to `source_material` for DeepEval context.

### `AgentAdapter` (ABC)

Implement this for each agent framework. The `invoke_method` key in `eval_cases.yaml` selects which method the runner calls.

| Method | When to use |
|--------|------------|
| `invoke_text(query, context)` | Single-turn with inline source material |
| `invoke_file(query, file_paths)` | Skills that expect file uploads |
| `invoke_sequential(turns, source_text)` | Multi-turn conversation (history maintained across turns) |
| `get_agent_metadata()` | Optional — fetch live agent name/model/version from the platform |
| `invoke(method, **kwargs)` | Dispatch helper used by the runner; dispatches to the above |

---

## `LibreChatAdapter`

Calls the LibreChat OpenAI-compatible agent endpoint (`/api/agents/v1/chat/completions`) using raw `httpx` so the full response body (including `retrieval.sources`) is accessible.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIBRECHAT_BASE_URL` | Yes | LibreChat server URL (e.g. `http://localhost:3080`) |
| `LIBRECHAT_API_KEY` | Yes | Agent API key from LibreChat Settings → Data |
| `LIBRECHAT_AGENT_ID` | Yes* | Agent ID to invoke. Can also be set per-case via `agent_id:` in the YAML |
| `EVAL_JUDGE_ENDPOINT` | No | Custom endpoint name in `librechat.yaml` to use as the LLM judge |
| `EVAL_JUDGE_MODEL` | No | Override the judge model from the endpoint config |
| `EVAL_JUDGE_DISABLE_TLS_VERIFY` | No | Set to `1` to skip TLS verification for the judge client |

\* Required unless `agent_id:` is set in `eval_cases.yaml`. Supports `${VAR_NAME}` expansion — never commit literal agent IDs.

### Judge LLM

By default, metric evaluation uses the same LibreChat agent as the judge. Set `EVAL_JUDGE_ENDPOINT` to a custom endpoint name from `librechat.yaml` (e.g. `"Azure AU"`) to route judge prompts directly through a gateway endpoint instead. This avoids contaminating Langfuse traces with judge calls.

---

## Adding a New Adapter

1. Create a new file (e.g. `adapters/my_adapter.py`) and subclass `AgentAdapter`:

```python
from _eval.adapters.base import AgentAdapter, AgentResponse, ToolCallRecord

class MyAdapter(AgentAdapter):
    def invoke_text(self, query, context) -> AgentResponse: ...
    def invoke_file(self, query, file_paths) -> AgentResponse: ...
    def invoke_sequential(self, turns, source_text=None) -> List[AgentResponse]: ...
```

2. Reference it in `eval_cases.yaml`:

```yaml
adapter: _eval.adapters.my_adapter.MyAdapter
```

The runner imports the adapter class by dotted path and instantiates it (passing `agent_id` when present in the YAML top-level config).
