from pathlib import Path

import pytest
import yaml

from evals._eval.loader import load_config
from evals._eval.schema import EvalCasesFile


ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize("config_path", sorted((ROOT / "evals" / "skills").glob("*/eval_cases.yaml")))
def test_eval_cases_validate(config_path: Path) -> None:
    with open(config_path, "r") as f:
        data = yaml.safe_load(f)

    validated = EvalCasesFile.model_validate(data)

    assert validated.adapter
    assert validated.cases


def test_eval_cases_reject_unknown_metric() -> None:
    data = {
        "adapter": "_eval.adapters.librechat_adapter.LibreChatAdapter",
        "invoke_method": "invoke_text",
        "num_runs": 1,
        "cases": {
            "case_1": {
                "name": "Bad metric",
                "category": "Test",
                "chatbot_role": "Tester",
                "user_query": "Hello",
                "expected_output": "Hi",
                "metrics": ["task_completion", "not_a_metric"],
            }
        },
    }

    with pytest.raises(Exception, match="Unknown metric"):
        EvalCasesFile.model_validate(data)


def test_eval_cases_reject_bad_assertion_type() -> None:
    data = {
        "adapter": "_eval.adapters.librechat_adapter.LibreChatAdapter",
        "invoke_method": "invoke_text",
        "num_runs": 1,
        "cases": {
            "case_1": {
                "name": "Bad assertion",
                "category": "Test",
                "chatbot_role": "Tester",
                "user_query": "Hello",
                "expected_output": "Hi",
                "metrics": ["task_completion"],
                "turns": [
                    {
                        "content": "Hello",
                        "turn_assertions": [
                            {
                                "type": "definitely_not_valid",
                                "name": "Broken",
                            }
                        ],
                    }
                ],
            }
        },
    }

    with pytest.raises(Exception, match="Input tag 'definitely_not_valid'"):
        EvalCasesFile.model_validate(data)


def test_eval_cases_reject_threshold_without_metric() -> None:
    data = {
        "adapter": "_eval.adapters.librechat_adapter.LibreChatAdapter",
        "invoke_method": "invoke_text",
        "num_runs": 1,
        "cases": {
            "case_1": {
                "name": "Bad threshold",
                "category": "Test",
                "chatbot_role": "Tester",
                "user_query": "Hello",
                "expected_output": "Hi",
                "metrics": ["task_completion"],
                "thresholds": {"hallucination": 0.5},
            }
        },
    }

    with pytest.raises(Exception, match="Threshold 'hallucination'"):
        EvalCasesFile.model_validate(data)


def test_load_config_wraps_validation_error(tmp_path: Path) -> None:
    config_path = tmp_path / "eval_cases.yaml"
    config_path.write_text(
        """
adapter: _eval.adapters.librechat_adapter.LibreChatAdapter
invoke_method: invoke_text
num_runs: 1
cases:
  case_1:
    name: Broken
    category: Test
    chatbot_role: Tester
    user_query: Hello
    expected_output: Hi
    metrics:
      - not_a_metric
""".strip()
    )

    with pytest.raises(ValueError, match=str(config_path)):
        load_config(config_path)
