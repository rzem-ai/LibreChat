"""Pydantic models for eval_cases.yaml validation."""

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .metrics import VALID_METRICS, VALID_PROBE_TYPES


class ToolSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    input_parameters: dict[str, Any] = Field(default_factory=dict)


class ExpectedToolsAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["expected_tools"]
    name: str
    tools: list[ToolSpec]


class ContainsAnyAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["contains_any"]
    name: str
    phrases: list[str]


class NotContainsAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["not_contains"]
    name: str
    phrases: list[str]


class LeadingQuestionAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["leading_question"]
    name: str
    question: str
    threshold: float | None = None


TurnAssertion = Annotated[
    Union[
        ExpectedToolsAssertion,
        ContainsAnyAssertion,
        NotContainsAssertion,
        LeadingQuestionAssertion,
    ],
    Field(discriminator="type"),
]


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    attach_source: bool = False
    turn_assertions: list[TurnAssertion] = Field(default_factory=list)


class LeadingQuestionProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    question: str
    type: Literal["gating", "diagnostic"] = "diagnostic"
    threshold: float | None = None

    @field_validator("type")
    @classmethod
    def validate_probe_type(cls, value: str) -> str:
        if value not in VALID_PROBE_TYPES:
            raise ValueError(f"Unknown probe type '{value}'")
        return value


class EvalCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    category: str
    chatbot_role: str
    expected_output: str
    invoke_method: Literal[
        "invoke_text",
        "invoke_file",
        "invoke_sequential",
    ] | None = None
    source_material: str | None = None
    source_files: list[str] = Field(default_factory=list)
    context_text: str | None = None
    user_query: str | None = None
    expected_tools: list[ToolSpec] = Field(default_factory=list)
    turns: list[Turn] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    thresholds: dict[str, float] = Field(default_factory=dict)
    diagnostic_metrics: list[str] = Field(default_factory=list)
    diagnostic_thresholds: dict[str, float] = Field(default_factory=dict)
    leading_questions: list[LeadingQuestionProbe] = Field(default_factory=list)

    @field_validator("metrics", "diagnostic_metrics")
    @classmethod
    def validate_metrics(cls, values: list[str]) -> list[str]:
        for value in values:
            if value not in VALID_METRICS:
                raise ValueError(f"Unknown metric '{value}'. Valid: {sorted(VALID_METRICS)}")
        return values

    @model_validator(mode="after")
    def validate_thresholds(self) -> "EvalCase":
        for metric_name in self.thresholds:
            if metric_name not in self.metrics:
                raise ValueError(
                    f"Threshold '{metric_name}' must also appear in metrics"
                )
        for metric_name in self.diagnostic_thresholds:
            if metric_name not in self.diagnostic_metrics:
                raise ValueError(
                    f"Diagnostic threshold '{metric_name}' must also appear in diagnostic_metrics"
                )
        return self


class EvalCasesFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter: str
    invoke_method: Literal[
        "invoke_text",
        "invoke_file",
        "invoke_sequential",
    ]
    num_runs: int = Field(gt=0)
    cases: dict[str, EvalCase]

    @field_validator("cases")
    @classmethod
    def validate_case_keys(cls, cases: dict[str, EvalCase]) -> dict[str, EvalCase]:
        for case_key in cases:
            if not case_key.startswith("case_"):
                raise ValueError(f"Invalid case key '{case_key}'. Expected format case_<n>")
            suffix = case_key.removeprefix("case_")
            if not suffix.isdigit():
                raise ValueError(f"Invalid case key '{case_key}'. Expected format case_<n>")
        return cases

    @model_validator(mode="after")
    def validate_case_requirements(self) -> "EvalCasesFile":
        for case_key, case in self.cases.items():
            effective_method = case.invoke_method or self.invoke_method

            if effective_method in {"invoke_text", "invoke_file"} and not case.user_query:
                raise ValueError(f"{case_key}: user_query is required for {effective_method}")

            if effective_method == "invoke_sequential" and not case.turns:
                raise ValueError(f"{case_key}: turns are required for {effective_method}")

            if effective_method == "invoke_file" and not (
                case.source_material or case.source_files or case.context_text
            ):
                raise ValueError(
                    f"{case_key}: source_material, source_files, or context_text is required for invoke_file"
                )

        return self
