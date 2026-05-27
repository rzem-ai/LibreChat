"""
Abstract adapter protocol for agent evaluation.

Implement this ABC for each agent framework (Agno, LangChain, CrewAI, etc.)
so that the eval runner remains framework-agnostic.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional


@dataclass
class ToolCallRecord:
    """Record of a single tool invocation made by the agent."""
    name: str
    input_parameters: dict = field(default_factory=dict)


@dataclass
class AgentResponse:
    """Standardised response from any agent adapter.

    Attributes:
        content: The text output from the agent (required — this is what metrics evaluate).
        tools_called: List of tool calls the agent made during execution.
        raw: Optional raw response object from the underlying framework (for debugging).
    """
    content: str
    tools_called: List[ToolCallRecord] = field(default_factory=list)
    raw: Optional[Any] = None


class AgentAdapter(ABC):
    """Abstract interface for agent interaction.

    Implement one subclass per framework. The eval runner calls the method
    specified by `invoke_method` in the YAML config.
    """

    @abstractmethod
    def invoke_text(self, query: str, context: str) -> AgentResponse:
        """Invoke the agent with a text query and pasted source material.

        This is the most common invocation mode — the source material is
        provided as inline text context alongside the user query.

        Args:
            query: The user's instruction/question.
            context: Source material text to be processed.

        Returns:
            AgentResponse with the agent's text output and any tool calls.
        """
        ...

    @abstractmethod
    def invoke_file(self, query: str, file_paths: List[Path]) -> AgentResponse:
        """Invoke the agent with a query and one or more file paths.

        Used for skills that expect file uploads (e.g., meeting transcripts,
        contracts, spreadsheets).

        Args:
            query: The user's instruction/question.
            file_paths: Resolved absolute paths to source files.

        Returns:
            AgentResponse with the agent's text output and any tool calls.
        """
        ...

    @abstractmethod
    def invoke_multi_turn(self, turns: List[dict]) -> AgentResponse:
        """Invoke the agent with a sequence of conversation turns.

        Used for skills that require multi-step interaction (e.g., selecting
        options before generating output).

        Each turn dict has:
            - role: "user" or "assistant"
            - content: the message text

        Args:
            turns: Ordered list of conversation messages.

        Returns:
            AgentResponse with the final agent output and cumulative tool calls.
        """
        ...

    @abstractmethod
    def invoke_sequential(
        self, turns: List[dict], source_text: Optional[str] = None,
    ) -> List[AgentResponse]:
        """Invoke the agent one turn at a time, collecting real responses.

        Unlike invoke_multi_turn (which sends a pre-scripted conversation),
        this method sends each user turn sequentially, waits for the real
        agent response, and feeds it back as history for the next turn.

        Args:
            turns: List of dicts with keys:
                - content: the user message text
                - attach_source (bool, optional): if True, append source_text
            source_text: Source material to attach when requested.

        Returns:
            List of AgentResponse objects, one per turn.
        """
        ...

    def get_agent_metadata(self) -> dict:
        """Return metadata about the agent being evaluated.

        Override in subclasses to fetch live agent config from the platform.
        The returned dict may include keys like:
            id, name, description, provider, model, version

        Returns an empty dict by default (no metadata available).
        """
        return {}

    def invoke(self, method: str, **kwargs) -> AgentResponse | List[AgentResponse]:
        """Dispatch to the appropriate invoke method by name.

        Args:
            method: One of 'invoke_text', 'invoke_file', 'invoke_multi_turn',
                    'invoke_sequential'.
            **kwargs: Arguments forwarded to the chosen method.

        Raises:
            ValueError: If the method name is not recognised.
        """
        dispatch = {
            "invoke_text": self.invoke_text,
            "invoke_file": self.invoke_file,
            "invoke_multi_turn": self.invoke_multi_turn,
            "invoke_sequential": self.invoke_sequential,
        }
        if method not in dispatch:
            raise ValueError(
                f"Unknown invoke method '{method}'. Valid: {sorted(dispatch.keys())}"
            )
        return dispatch[method](**kwargs)
