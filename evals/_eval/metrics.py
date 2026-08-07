"""
Metric definitions, registries, and builders for the eval suite.

Contains:
  - EvaluatorModel: framework-agnostic bridge to DeepEval's judge interface
  - Unified metric registry (gating + diagnostic)
  - Conversational metric builders for multi-turn evaluation
  - Turn assertion evaluator for per-turn checks
  - Builder functions for metrics and leading question probes
  - All threshold/constant definitions

This module has NO dependency on any specific agent framework.
"""

from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple

from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.test_case.conversational_test_case import MultiTurnParams
from deepeval.metrics import (
    HallucinationMetric,
    TaskCompletionMetric,
    ToolCorrectnessMetric,
    AnswerRelevancyMetric,
    SummarizationMetric,
    FaithfulnessMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    BiasMetric,
    ToxicityMetric,
    GEval,
    ConversationCompletenessMetric,
    ConversationalGEval,
)
from deepeval.models import DeepEvalBaseLLM


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_METRICS = {
    "hallucination",
    "task_completion",
    "tool_correctness",
    "role_consistency",
    "instruction_adherence",
    "answer_relevancy",
    "summarization",
    "faithfulness",
    "contextual_precision",
    "contextual_recall",
    "contextual_relevancy",
    "bias",
    "toxicity",
    "conversation_completeness",
    "conversational_role_consistency",
    "conversational_instruction_adherence",
}

# Metrics that require a ConversationalTestCase (multi-turn only)
CONVERSATIONAL_METRICS = {
    "conversation_completeness",
    "conversational_role_consistency",
    "conversational_instruction_adherence",
}

DEFAULT_THRESHOLDS = {
    "hallucination": 0.5,
    "task_completion": 0.5,
    "tool_correctness": None,
    "role_consistency": 0.5,
    "instruction_adherence": 0.5,
    "answer_relevancy": 0.5,
    "summarization": 0.5,
    "faithfulness": 0.5,
    "contextual_precision": 0.5,
    "contextual_recall": 0.5,
    "contextual_relevancy": 0.5,
    "bias": 0.5,
    "toxicity": 0.5,
    "conversation_completeness": 0.5,
    "conversational_role_consistency": 0.5,
    "conversational_instruction_adherence": 0.5,
}

VALID_PROBE_TYPES = {"gating", "diagnostic"}

# DeepEval metric display names (metric.name — what result tuples carry) whose
# success is `score <= threshold`: lower is better. Everything else is
# higher-is-better (`score >= threshold`). Used to orient both aggregate
# pass/fail and the composite eval_score, so a good result on these metrics (a
# low score) is never treated as a failure or averaged as if higher were better.
LOWER_IS_BETTER_METRICS = {"Hallucination", "Bias", "Toxicity"}


# ---------------------------------------------------------------------------
# Evaluator bridge (framework-agnostic)
# ---------------------------------------------------------------------------

class EvaluatorModel(DeepEvalBaseLLM):
    """Wraps any callable LLM as a DeepEval judge.

    Accepts a callable `generate_fn(prompt: str) -> str`.
    """

    def __init__(self, generate_fn: Callable[[str], str], model_name: str = "LLM-Judge"):
        self._generate_fn = generate_fn
        self._model_name = model_name

    def load_model(self):
        return None

    def generate(self, prompt: str) -> str:
        return self._generate_fn(prompt)

    async def a_generate(self, prompt: str) -> str:
        return self.generate(prompt)

    def get_model_name(self) -> str:
        return self._model_name


# ---------------------------------------------------------------------------
# Unified metric registry
# ---------------------------------------------------------------------------

def _metric_registry(evaluator: EvaluatorModel) -> dict:
    """Map metric key strings to factory functions: factory(threshold) -> metric instance."""
    return {
        "hallucination": lambda t: HallucinationMetric(
            threshold=t, model=evaluator, strict_mode=False
        ),
        "task_completion": lambda t: TaskCompletionMetric(
            threshold=t, model=evaluator
        ),
        "tool_correctness": lambda _: ToolCorrectnessMetric(model=evaluator),
        "role_consistency": lambda t: GEval(
            name="Role Consistency",
            evaluation_steps=[
                "Assess whether the output consistently maintains the expected persona throughout.",
                "Check that the tone is professional and appropriate for the target audience.",
                "Verify the output does not shift to an unrelated persona mid-response.",
                "Ensure the output frames content appropriately for its stated purpose.",
                "Penalize any shifts in persona or inconsistent voice.",
            ],
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
            model=evaluator,
            threshold=t,
        ),
        "instruction_adherence": lambda t: GEval(
            name="Instruction Adherence",
            evaluation_steps=[
                "Check whether the output follows all explicit instructions given in the prompt.",
                "Verify that format requirements (headings, sections, lists) are met.",
                "Confirm that any constraints (word count, audience, exclusions) are respected.",
                "Penalize deviations from or omissions of stated requirements.",
                "Score 1.0 for full adherence, proportionally less for partial.",
            ],
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
            model=evaluator,
            threshold=t,
        ),
        "answer_relevancy": lambda t: AnswerRelevancyMetric(
            threshold=t, model=evaluator, strict_mode=False
        ),
        "summarization": lambda t: SummarizationMetric(
            threshold=t, model=evaluator, strict_mode=False
        ),
        "faithfulness": lambda t: FaithfulnessMetric(
            threshold=t, model=evaluator, strict_mode=False
        ),
        "contextual_precision": lambda t: ContextualPrecisionMetric(
            threshold=t, model=evaluator
        ),
        "contextual_recall": lambda t: ContextualRecallMetric(
            threshold=t, model=evaluator
        ),
        "contextual_relevancy": lambda t: ContextualRelevancyMetric(
            threshold=t, model=evaluator
        ),
        "bias": lambda t: BiasMetric(
            threshold=t, model=evaluator
        ),
        "toxicity": lambda t: ToxicityMetric(
            threshold=t, model=evaluator
        ),
    }


# ---------------------------------------------------------------------------
# Leading question probe builder
# ---------------------------------------------------------------------------

def build_leading_question_probes(
    questions: List[dict],
    evaluator: EvaluatorModel,
    default_threshold: float = 0.5,
) -> List[Tuple[GEval, str]]:
    """Dynamically create one GEval probe per leading question from YAML config.

    Each question dict must have 'name' and 'question' keys.
    Optional keys:
        type:      'gating' or 'diagnostic' (default: 'diagnostic')
        threshold:  per-probe score threshold (default: default_threshold)

    Returns a list of (GEval, type_str) tuples.
    """
    probes = []
    for q in questions:
        name = q["name"]
        question_text = q["question"]
        probe_type = q.get("type", "diagnostic").lower()
        if probe_type not in VALID_PROBE_TYPES:
            raise ValueError(
                f"Invalid type '{probe_type}' for leading question '{name}'. "
                f"Valid: {sorted(VALID_PROBE_TYPES)}"
            )
        threshold = q.get("threshold", default_threshold)
        probe = GEval(
            name=f"Leading Q: {name}",
            evaluation_steps=[
                f"Evaluate the following question against the agent's output: {question_text}",
                "Score 1.0 if the answer is clearly yes, 0.0 if clearly no, and proportionally for partial compliance.",
                "Provide a concise reason explaining the score.",
            ],
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
            ],
            model=evaluator,
            threshold=threshold,
        )
        probes.append((probe, probe_type))
    return probes


# ---------------------------------------------------------------------------
# Metric builders
# ---------------------------------------------------------------------------

def build_metrics(
    metric_keys: List[str],
    thresholds: dict,
    evaluator: EvaluatorModel,
    has_expected_tools: bool = True,
) -> list:
    """Instantiate standard (non-conversational) metrics from the unified registry.

    Skips conversational metrics — those require a ConversationalTestCase and
    are handled separately via build_conversational_from_keys().
    """
    registry = _metric_registry(evaluator)
    metrics = []
    for key in metric_keys:
        if key in CONVERSATIONAL_METRICS:
            continue  # handled by build_conversational_from_keys
        if key not in registry:
            raise ValueError(f"Unknown metric '{key}'. Valid: {sorted(VALID_METRICS)}")
        if key == "tool_correctness" and not has_expected_tools:
            print(f"[SKIP] tool_correctness — no expected_tools defined for this case")
            continue
        threshold = thresholds.get(key, DEFAULT_THRESHOLDS.get(key))
        metrics.append(registry[key](threshold))
    return metrics


def build_conversational_from_keys(
    metric_keys: List[str],
    thresholds: dict,
    evaluator: EvaluatorModel,
) -> list:
    """Extract conversational metrics from a metric key list and instantiate them.

    Only keys in CONVERSATIONAL_METRICS are processed; others are skipped.
    """
    registry = _conversational_metric_registry(evaluator)
    metrics = []
    for key in metric_keys:
        if key not in CONVERSATIONAL_METRICS:
            continue
        threshold = thresholds.get(key, DEFAULT_THRESHOLDS.get(key))
        metrics.append(registry[key](threshold))
    return metrics


# ---------------------------------------------------------------------------
# Conversational metric constants and builders
# ---------------------------------------------------------------------------

VALID_CONVERSATIONAL_METRICS = {
    "conversation_completeness",
    "conversational_role_consistency",
    "conversational_instruction_adherence",
}

DEFAULT_CONVERSATIONAL_THRESHOLDS = {
    "conversation_completeness": 0.5,
    "conversational_role_consistency": 0.7,
    "conversational_instruction_adherence": 0.7,
}


def _conversational_metric_registry(evaluator: EvaluatorModel) -> dict:
    """Map conversational metric keys to factories: factory(threshold) -> metric."""
    return {
        "conversation_completeness": lambda t: ConversationCompletenessMetric(
            threshold=t, model=evaluator,
        ),
        "conversational_role_consistency": lambda t: ConversationalGEval(
            name="Conversational Role Consistency",
            evaluation_steps=[
                "Across the entire conversation, does the assistant maintain a consistent persona?",
                "Is the tone professional and appropriate throughout all turns?",
                "Penalize any mid-conversation persona shifts.",
            ],
            evaluation_params=[MultiTurnParams.CONTENT, MultiTurnParams.ROLE],
            model=evaluator,
            threshold=t,
        ),
        "conversational_instruction_adherence": lambda t: ConversationalGEval(
            name="Conversational Instruction Adherence",
            evaluation_steps=[
                "Does the conversation flow follow the expected interaction pattern?",
                "Does the final output satisfy the original user request?",
                "Are intermediate assistant responses helpful and on-topic?",
            ],
            evaluation_params=[MultiTurnParams.CONTENT, MultiTurnParams.ROLE],
            model=evaluator,
            threshold=t,
        ),
    }


def build_conversational_metrics(
    metric_keys: List[str],
    thresholds: dict,
    evaluator: EvaluatorModel,
) -> list:
    """Instantiate conversational metrics for session-level evaluation."""
    registry = _conversational_metric_registry(evaluator)
    metrics = []
    for key in metric_keys:
        if key not in registry:
            raise ValueError(
                f"Unknown conversational metric '{key}'. "
                f"Valid: {sorted(VALID_CONVERSATIONAL_METRICS)}"
            )
        threshold = thresholds.get(key, DEFAULT_CONVERSATIONAL_THRESHOLDS.get(key))
        metrics.append(registry[key](threshold))
    return metrics


# ---------------------------------------------------------------------------
# Turn assertion evaluator
# ---------------------------------------------------------------------------

VALID_ASSERTION_TYPES = {"contains_any", "not_contains", "leading_question", "expected_tools"}


@dataclass
class TurnAssertionResult:
    """Result of evaluating a single turn assertion."""
    turn_index: int
    assertion_type: str
    name: str
    passed: bool
    reason: str
    score: Optional[float] = None


def evaluate_turn_assertions(
    turn_index: int,
    assertions: List[dict],
    response_content: str,
    tools_called: list,
    evaluator: Optional[DeepEvalBaseLLM] = None,
    turn_input: str = "",
) -> List[TurnAssertionResult]:
    """Evaluate assertions for a single turn's response.

    Supported assertion types:
        contains_any:   pass if response contains any of the given phrases
        not_contains:   pass if response contains none of the given phrases
        expected_tools: pass if all expected tool names appear in tools_called
        leading_question: LLM-judged — uses GEval to assess the response
    """
    results = []
    output_lower = response_content.lower()

    for assertion in assertions:
        atype = assertion["type"]
        name = assertion.get("name", atype)

        if atype not in VALID_ASSERTION_TYPES:
            results.append(TurnAssertionResult(
                turn_index=turn_index, assertion_type=atype, name=name,
                passed=False, reason=f"Unknown assertion type: {atype}",
            ))
            continue

        if atype == "contains_any":
            phrases = [p.lower() for p in assertion["phrases"]]
            matched = [p for p in phrases if p in output_lower]
            passed = len(matched) > 0
            reason = f"Matched: {matched}" if passed else f"None of {phrases} found"
            results.append(TurnAssertionResult(
                turn_index=turn_index, assertion_type=atype, name=name,
                passed=passed, reason=reason, score=1.0 if passed else 0.0,
            ))

        elif atype == "not_contains":
            phrases = [p.lower() for p in assertion["phrases"]]
            found = [p for p in phrases if p in output_lower]
            passed = len(found) == 0
            reason = "None found" if passed else f"Unwanted phrases found: {found}"
            results.append(TurnAssertionResult(
                turn_index=turn_index, assertion_type=atype, name=name,
                passed=passed, reason=reason, score=1.0 if passed else 0.0,
            ))

        elif atype == "expected_tools":
            expected_names = {t["name"] for t in assertion.get("tools", [])}
            actual_names = {t.name for t in tools_called}
            missing = expected_names - actual_names
            passed = len(missing) == 0
            reason = "All expected tools called" if passed else f"Missing tools: {missing}"
            results.append(TurnAssertionResult(
                turn_index=turn_index, assertion_type=atype, name=name,
                passed=passed, reason=reason, score=1.0 if passed else 0.0,
            ))

        elif atype == "leading_question":
            if evaluator is None:
                results.append(TurnAssertionResult(
                    turn_index=turn_index, assertion_type=atype, name=name,
                    passed=True, reason="Deferred — no evaluator provided",
                ))
                continue
            threshold = assertion.get("threshold", 0.7)
            question_text = assertion["question"]
            probe = GEval(
                name=name,
                evaluation_steps=[
                    f"Evaluate the following question against the agent's output: {question_text}",
                    "Score 1.0 if the answer is clearly yes, 0.0 if clearly no, "
                    "and proportionally for partial compliance.",
                ],
                evaluation_params=[
                    LLMTestCaseParams.INPUT,
                    LLMTestCaseParams.ACTUAL_OUTPUT,
                ],
                model=evaluator,
                threshold=threshold,
            )
            tc = LLMTestCase(input=turn_input, actual_output=response_content)
            try:
                probe.measure(tc)
                score = probe.score
                passed = probe.is_successful()
                reason = getattr(probe, "reason", "N/A")
            except Exception as exc:
                score = 0.0
                passed = False
                reason = f"LLM judge error: {exc}"
            results.append(TurnAssertionResult(
                turn_index=turn_index, assertion_type=atype, name=name,
                passed=passed, reason=reason, score=score,
            ))

    return results
