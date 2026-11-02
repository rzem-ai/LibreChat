"""Tests for the manual test suite validator, per-model expansion and Excel collation."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Dict, List

import pytest
from openpyxl import load_workbook

from excel import (
    OVERALL_RESULTS,
    TESTER_COUNT,
    TESTER_RESULTS,
    build_workbook,
    format_steps,
    overall_formula,
)
from specs import expand_per_model, load_model_specs, matches_where, unmatched_per_model
from suites import load_suites, validate_suites


def link(name: str, url: str) -> Dict[str, str]:
    return {"name": name, "url": url}


SAMPLE: List[Dict[str, Any]] = [
    {
        "file": "a.json",
        "suite": "Alpha",
        "idPrefix": "ALP",
        "tests": [
            {
                "id": "ALP-001",
                "goal": "First",
                "dateUpdated": "02 Nov 2026",
                "author": link("someone", "https://github.com/someone"),
                "lastPr": link("#1", "https://github.com/o/r/pull/1"),
                "steps": [{"action": "Do a thing", "acceptanceCriteria": ["It works"]}],
            },
            {
                "id": "ALP-002",
                "goal": "Second",
                "dateUpdated": "03 Nov 2026",
                "author": None,
                "lastPr": None,
                "steps": [
                    {"action": "Do another", "acceptanceCriteria": ["It also works"]}
                ],
            },
        ],
    }
]

SPECS = [
    {
        "name": "a-one",
        "label": "One",
        "group": "Alpha",
        "endpoint": "x",
        "webSearch": True,
    },
    {
        "name": "a-two",
        "label": "Two",
        "group": "Alpha",
        "endpoint": "x",
        "webSearch": False,
    },
    {
        "name": "b-three",
        "label": "Three",
        "group": "Beta",
        "endpoint": "y",
        "webSearch": True,
    },
]


def repeated(
    key: str,
    config: Any,
    goal: str = "Confirm that {{MODEL_NAME}} ({{PROVIDER_NAME}}) works",
):
    suite = copy.deepcopy(SAMPLE)
    suite[0]["tests"] = [
        {
            **suite[0]["tests"][0],
            "goal": goal,
            key: config,
            "steps": [
                {
                    "action": "Select {{MODEL_NAME}}",
                    "acceptanceCriteria": ["{{PROVIDER_NAME}} replies"],
                }
            ],
        }
    ]
    return suite


def sheet_of(suites: List[Dict[str, Any]], tmp_path: Path):
    path = tmp_path / "out.xlsx"
    build_workbook(suites, path)
    return load_workbook(path)["Manual Tests"]


def test_committed_suites_are_valid():
    assert validate_suites(load_suites()) == []


def test_validation_rejects_bad_ids_dates_duplicates_and_missing_criteria():
    bad = copy.deepcopy(SAMPLE)
    bad[0]["tests"][0]["dateUpdated"] = "2026-11-02"
    bad[0]["tests"][1]["id"] = "ALP-001"
    bad[0]["tests"][1]["steps"][0]["acceptanceCriteria"] = []
    errors = "\n".join(validate_suites(bad))
    assert "DD Mon YYYY" in errors
    assert "duplicate id" in errors
    assert "at least one acceptance criterion" in errors


@pytest.mark.parametrize("tests", [{}, None, "nope"])
def test_malformed_suites_return_diagnostics_instead_of_raising(tests):
    suite = [{"file": "bad.json", "suite": "Bad", "idPrefix": "BAD", "tests": tests}]
    assert "bad.json: needs at least one test" in "\n".join(validate_suites(suite))


def test_missing_tests_key_returns_a_diagnostic():
    suite = [{"file": "bad.json", "suite": "Bad", "idPrefix": "BAD"}]
    assert "bad.json: needs at least one test" in "\n".join(validate_suites(suite))


def test_sheet_has_the_required_columns_in_order(tmp_path):
    sheet = sheet_of(SAMPLE, tmp_path)
    headers = [c.value for c in sheet[1]]
    assert headers[:9] == [
        "Test Suite",
        "Test ID",
        "Goal",
        "Testing Steps",
        "Date Updated",
        "Author",
        "Last PR",
        "Comments",
        "Overall Result",
    ]
    assert len(headers) == 9 + TESTER_COUNT
    assert sheet.max_row == 3
    assert sheet["D2"].value == format_steps(SAMPLE[0]["tests"][0]["steps"])
    assert sheet["E2"].value == "02 Nov 2026"
    assert sheet["H2"].value is None
    assert (
        sheet["F2"].value == "someone"
        and sheet["F2"].hyperlink.target == "https://github.com/someone"
    )
    assert sheet["F3"].value is None


def test_header_row_and_first_four_columns_are_frozen(tmp_path):
    assert sheet_of(SAMPLE, tmp_path).freeze_panes == "E2"


def test_tester_cells_start_as_not_started(tmp_path):
    sheet = sheet_of(SAMPLE, tmp_path)
    assert {
        sheet.cell(row=2, column=c).value for c in range(10, 10 + TESTER_COUNT)
    } == {"not started"}


def validations(sheet) -> Dict[str, str]:
    return {str(v.sqref): v.formula1 for v in sheet.data_validations.dataValidation}


def test_overall_result_and_tester_cells_carry_list_validation(tmp_path):
    found = validations(sheet_of(SAMPLE, tmp_path))
    assert found["I2:I3"] == '"' + ",".join(OVERALL_RESULTS) + '"'
    assert found["J2:AC3"] == '"' + ",".join(TESTER_RESULTS) + '"'


def colour_rules(sheet) -> Dict[str, List[str]]:
    return {
        str(cf.sqref): sorted(rule.formula[0] for rule in cf.rules)
        for cf in sheet.conditional_formatting
    }


def test_conditional_formatting_covers_the_overall_and_tester_columns(tmp_path):
    rules = colour_rules(sheet_of(SAMPLE, tmp_path))
    assert rules["I2:I3"] == sorted(f'"{v}"' for v in OVERALL_RESULTS)
    assert rules["J2:AC3"] == sorted(f'"{v}"' for v in TESTER_RESULTS)


def test_overall_result_formula_references_the_row_tester_range(tmp_path):
    sheet = sheet_of(SAMPLE, tmp_path)
    assert sheet["I2"].value == "=" + overall_formula("J2:AC2")
    assert sheet["I3"].value == "=" + overall_formula("J3:AC3")


def test_per_model_true_expands_one_test_per_model_with_placeholders_filled():
    [suite] = expand_per_model(repeated("perModel", True), SPECS)
    assert [t["id"] for t in suite["tests"]] == [
        "ALP-001 / a-one",
        "ALP-001 / a-two",
        "ALP-001 / b-three",
    ]
    assert suite["tests"][2]["goal"] == "Confirm that Three (Beta) works"
    assert suite["tests"][2]["steps"][0]["action"] == "Select Three"
    assert suite["tests"][2]["steps"][0]["acceptanceCriteria"] == ["Beta replies"]
    assert "perModel" not in suite["tests"][0]


@pytest.mark.parametrize(
    "where, expected",
    [
        ({"group": "Beta"}, ["ALP-001 / b-three"]),
        ({"name": ["a-one", "b-three"]}, ["ALP-001 / a-one", "ALP-001 / b-three"]),
        ({"webSearch": True}, ["ALP-001 / a-one", "ALP-001 / b-three"]),
        ({"webSearch": False}, ["ALP-001 / a-two"]),
    ],
)
def test_per_model_where_filters_by_spec_fields(where, expected):
    [suite] = expand_per_model(repeated("perModel", {"where": where}), SPECS)
    assert [t["id"] for t in suite["tests"]] == expected
    assert matches_where(SPECS[0], {})


def test_validation_enforces_placeholders_and_per_model_together():
    assert validate_suites(repeated("perModel", True)) == []
    unflagged = copy.deepcopy(repeated("perModel", True))
    del unflagged[0]["tests"][0]["perModel"]
    assert 'placeholders require "perModel"' in "\n".join(validate_suites(unflagged))
    plain = repeated("perModel", True, "Confirm that it works")
    plain[0]["tests"][0]["steps"] = [
        {"action": "Do it", "acceptanceCriteria": ["It works"]}
    ]
    assert "must use {{MODEL_NAME}}" in "\n".join(validate_suites(plain))
    assert 'perModel.where key "colour"' in "\n".join(
        validate_suites(repeated("perModel", {"where": {"colour": "red"}}))
    )
    assert "unknown placeholder" in "\n".join(
        validate_suites(repeated("perModel", True, "Confirm {{NOPE}}"))
    )


def test_per_provider_expands_once_per_provider_group_and_rejects_model_name():
    suite = repeated("perProvider", True, "Confirm that {{PROVIDER_NAME}} works")
    suite[0]["tests"][0]["steps"] = [
        {
            "action": "Select any {{PROVIDER_NAME}} model",
            "acceptanceCriteria": ["It works"],
        }
    ]
    assert validate_suites(suite) == []
    [expanded] = expand_per_model(suite, SPECS)
    assert [t["id"] for t in expanded["tests"]] == ["ALP-001 / alpha", "ALP-001 / beta"]
    assert expanded["tests"][1]["steps"][0]["action"] == "Select any Beta model"
    assert unmatched_per_model(suite, SPECS) == []

    with_model = copy.deepcopy(suite)
    with_model[0]["tests"][0]["goal"] = "Confirm that {{MODEL_NAME}} works"
    assert "perProvider tests cannot use {{MODEL_NAME}}" in "\n".join(
        validate_suites(with_model)
    )

    both = copy.deepcopy(suite)
    both[0]["tests"][0]["perModel"] = True
    assert 'either "perModel" or "perProvider"' in "\n".join(validate_suites(both))


def test_model_specs_load_from_librechat_yaml_with_the_fields_filters_use():
    loaded = load_model_specs()
    assert loaded
    assert all(
        s["name"] and s["label"] and s["group"] and isinstance(s["webSearch"], bool)
        for s in loaded
    )


def test_unmatched_per_model_reports_tests_whose_filter_matches_no_model():
    assert unmatched_per_model(repeated("perModel", True), SPECS) == []
    assert unmatched_per_model(
        repeated("perModel", {"where": {"group": "Nope"}}), SPECS
    ) == ["ALP-001"]
