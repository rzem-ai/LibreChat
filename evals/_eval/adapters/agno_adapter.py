"""
Agno framework adapter for the eval runner.

This is the only file that imports Agno-specific modules. To swap to a
different framework, implement AgentAdapter in a new module and update
the `adapter:` key in your eval_cases.yaml.
"""

import os
from pathlib import Path
from typing import List, Optional

from agno.agent import Agent
from agno.models.azure import AzureOpenAI
from agno.tools.python import PythonTools
from agno.skills import Skills, LocalSkills
from agno.tools.shell import ShellTools
from agno.tools.local_file_system import LocalFileSystemTools
from dotenv import load_dotenv

from .base import AgentAdapter, AgentResponse, ToolCallRecord

load_dotenv()

# Skills directory: configurable via SKILLS_DIR env var, defaults to .github/skills/
_SKILLS_DIR = Path(os.environ.get("SKILLS_DIR", ".github/skills")).resolve()


def _build_agent() -> Agent:
    """Construct a fresh Agno agent instance for evaluation."""
    return Agent(
        name="General Business Assistant",
        model=AzureOpenAI(id="gpt-5.2"),
        instructions=[
            "You are a general purpose assistant designed to help with a wide range of tasks, including research, writing, data analysis, and more.",
            "Where relevant, you should use the skills at your disposal to accomplish tasks more effectively. Always check if there is a relevant skill available before attempting to complete a task without one.",
            "You take the user input and break it down into manageable steps to accomplish the task effectively.",
            "You have access to specialized skills.",
            "Use get_skill_instructions to load full guidance when needed.",
            "You can use the tools at your disposal to accomplish your tasks. If you encounter an error, print the error message and continue with the next steps.",
            "Any documents you make should follow the brand and style guidelines outlined in the branding skill instructions. Always use today's date in the document title.",
            "Always use code execution to produce documents. Refer to the relevant documentation skill for guidance on how to structure your code to produce the desired output.",
            "For any given task, YOU MUST START BY breaking it down into smaller steps and produce the output iteratively.",
            "Your users are not technical, so you should never respond with code snippets or technical jargon.",
            "If any information has not been provided to you in the user input, you should flag this with the user before proceeding.",
        ],
        skills=Skills(loaders=[LocalSkills(_SKILLS_DIR, validate=False)]),
        tools=[
            PythonTools(),
            LocalFileSystemTools(),
            ShellTools(),
        ],
        markdown=True,
    )


class AgnoAdapter(AgentAdapter):
    """Adapter that wraps an Agno agent (self-contained, no external imports)."""

    def __init__(self):
        """Initialise adapter with a freshly constructed Agno agent."""
        self._agent = _build_agent()

    def invoke_text(self, query: str, context: str) -> AgentResponse:
        """Send a text query with inline context to the agent and return the response."""
        full_request = f"{query}\n\n---\nSource material:\n{context}"
        response = self._agent.run(full_request)

        tools_called = self._extract_tools(response)
        content = response.content if hasattr(response, "content") else str(response)

        return AgentResponse(content=content, tools_called=tools_called, raw=response)

    def invoke_file(self, query: str, file_paths: List[Path]) -> AgentResponse:
        """Read source files, concatenate their contents as context, and query the agent."""
        file_contents = []
        for fp in file_paths:
            with open(fp, "r") as f:
                file_contents.append(f"--- File: {fp.name} ---\n{f.read()}")

        context = "\n\n".join(file_contents)
        full_request = f"{query}\n\n---\nSource material:\n{context}"
        response = self._agent.run(full_request)

        tools_called = self._extract_tools(response)
        content = response.content if hasattr(response, "content") else str(response)

        return AgentResponse(content=content, tools_called=tools_called, raw=response)

    def invoke_multi_turn(self, turns: List[dict]) -> AgentResponse:
        """Execute a multi-turn conversation sequentially, returning the final response."""
        response = None
        all_tools = []

        for turn in turns:
            if turn.get("role") == "user":
                response = self._agent.run(turn["content"])
                all_tools.extend(self._extract_tools(response))

        if response is None:
            return AgentResponse(content="", tools_called=[])

        content = response.content if hasattr(response, "content") else str(response)
        return AgentResponse(content=content, tools_called=all_tools, raw=response)

    def invoke_sequential(
        self, turns: List[dict], source_text: Optional[str] = None,
    ) -> List[AgentResponse]:
        responses: List[AgentResponse] = []
        for turn in turns:
            content = turn["content"]
            if turn.get("attach_source") and source_text:
                content = f"{content}\n\n---\nSource material:\n{source_text}"
            response = self._agent.run(content)
            tools_called = self._extract_tools(response)
            resp_content = response.content if hasattr(response, "content") else str(response)
            responses.append(AgentResponse(
                content=resp_content, tools_called=tools_called, raw=response,
            ))
        return responses

    @staticmethod
    def _extract_tools(response) -> List[ToolCallRecord]:
        """Extract tool call records from an Agno response object."""
        tools = []
        if hasattr(response, "tools") and response.tools:
            for tool in response.tools:
                tool_name = getattr(tool, "tool_name", getattr(tool, "name", str(tool)))
                tool_args = getattr(tool, "tool_args", getattr(tool, "arguments", {}))
                tools.append(ToolCallRecord(name=tool_name, input_parameters=tool_args))
        return tools
