"""Builds the manual testing session workbook from the (expanded) suites."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import xlsxwriter
from xlsxwriter.utility import xl_range_abs, xl_rowcol_to_cell

TESTER_COUNT = 20
TESTER_RESULTS = ["not started", "skipped", "minor bug", "major bug", "pass"]
OVERALL_RESULTS = ["insufficient testers", "minor bug", "major bug", "pass"]

COLOURS = {
    "white": "#FFFFFF",
    "grey": "#D9D9D9",
    "green": "#C6EFCE",
    "amber": "#FFEB9C",
    "red": "#FFC7CE",
}
TESTER_COLOURS = {
    "skipped": COLOURS["grey"],
    "not started": COLOURS["white"],
    "pass": COLOURS["green"],
    "minor bug": COLOURS["amber"],
    "major bug": COLOURS["red"],
}
OVERALL_COLOURS = {
    "insufficient testers": COLOURS["white"],
    "pass": COLOURS["green"],
    "minor bug": COLOURS["amber"],
    "major bug": COLOURS["red"],
}

COLUMNS = [
    ("Test Suite", 26),
    ("Test ID", 14),
    ("Goal", 40),
    ("Testing Steps", 60),
    ("Date Updated", 14),
    ("Author", 18),
    ("Last PR", 12),
    ("Comments", 40),
    ("Overall Result", 20),
]
STEPS_COLUMNS = 4
OVERALL_COLUMN = 8
FIRST_TESTER_COLUMN = len(COLUMNS)
LAST_TESTER_COLUMN = FIRST_TESTER_COLUMN + TESTER_COUNT - 1

Suite = Dict[str, Any]


def overall_formula(cell_range: str) -> str:
    """Excel formula giving a test's overall result from its tester cells."""
    return (
        f'IF(COUNTIF({cell_range},"major bug")>0,"major bug",'
        f'IF(COUNTIF({cell_range},"minor bug")>0,"minor bug",'
        f'IF(COUNTIF({cell_range},"pass")>=2,"pass","insufficient testers")))'
    )


def format_steps(steps: List[Dict[str, Any]]) -> str:
    def render(index: int, step: Dict[str, Any]) -> str:
        lines = [f"{index}. {step['action']}"] + [
            f"   ✔ {c}" for c in step["acceptanceCriteria"]
        ]
        return "\n".join(lines)

    return "\n".join(render(i, step) for i, step in enumerate(steps, 1))


def _list_validation(values: List[str]) -> Dict[str, Any]:
    return {
        "validate": "list",
        "source": values,
        "ignore_blank": False,
        "error_title": "Invalid value",
        "error_message": f"Choose one of: {', '.join(values)}",
    }


def _add_colour_rules(
    workbook: xlsxwriter.Workbook, sheet: Any, cell_range: str, colours: Dict[str, str]
) -> None:
    for value, colour in colours.items():
        sheet.conditional_format(
            cell_range,
            {
                "type": "cell",
                "criteria": "==",
                "value": f'"{value}"',
                "format": workbook.add_format({"bg_color": colour}),
            },
        )


def _write_link(sheet: Any, row: int, column: int, link: Any, cell_format: Any) -> None:
    if not link:
        sheet.write_blank(row, column, None, cell_format)
        return
    sheet.write_url(row, column, link["url"], cell_format, string=link["name"])


def _write_test(
    sheet: Any, formats: Dict[str, Any], row: int, suite: Suite, test: Dict[str, Any]
) -> None:
    tester_range = f"{xl_rowcol_to_cell(row, FIRST_TESTER_COLUMN)}:{xl_rowcol_to_cell(row, LAST_TESTER_COLUMN)}"
    cell = formats["cell"]
    sheet.write_string(row, 0, suite["suite"], cell)
    sheet.write_string(row, 1, test["id"], cell)
    sheet.write_string(row, 2, test["goal"], cell)
    sheet.write_string(row, 3, format_steps(test["steps"]), cell)
    sheet.write_string(row, 4, test["dateUpdated"], cell)
    _write_link(sheet, row, 5, test["author"], formats["link"])
    _write_link(sheet, row, 6, test["lastPr"], formats["link"])
    sheet.write_blank(row, 7, None, cell)
    sheet.write_formula(
        row,
        OVERALL_COLUMN,
        "=" + overall_formula(tester_range),
        cell,
        "insufficient testers",
    )
    for column in range(FIRST_TESTER_COLUMN, LAST_TESTER_COLUMN + 1):
        sheet.write_string(row, column, "not started", cell)


def build_workbook(suites: List[Suite], path: Path) -> int:
    """Write the workbook to `path` and return the number of test rows."""
    workbook = xlsxwriter.Workbook(str(path))
    sheet = workbook.add_worksheet("Manual Tests")
    formats = {
        "header": workbook.add_format(
            {
                "bold": True,
                "font_color": "#FFFFFF",
                "bg_color": "#26890D",
                "valign": "vcenter",
                "text_wrap": True,
            }
        ),
        "cell": workbook.add_format({"valign": "top", "text_wrap": True}),
        "link": workbook.add_format(
            {"valign": "top", "text_wrap": True, "font_color": "blue", "underline": 1}
        ),
    }
    headers = COLUMNS + [(f"Tester {i}", 14) for i in range(1, TESTER_COUNT + 1)]
    for column, (title, width) in enumerate(headers):
        sheet.write_string(0, column, title, formats["header"])
        sheet.set_column(column, column, width)
    sheet.freeze_panes(1, STEPS_COLUMNS)

    rows = [(suite, test) for suite in suites for test in suite["tests"]]
    for index, (suite, test) in enumerate(rows, 1):
        _write_test(sheet, formats, index, suite, test)

    last_row = len(rows)
    sheet.autofilter(0, 0, max(last_row, 1), LAST_TESTER_COLUMN)
    if rows:
        sheet.data_validation(
            1,
            OVERALL_COLUMN,
            last_row,
            OVERALL_COLUMN,
            _list_validation(OVERALL_RESULTS),
        )
        sheet.data_validation(
            1,
            FIRST_TESTER_COLUMN,
            last_row,
            LAST_TESTER_COLUMN,
            _list_validation(TESTER_RESULTS),
        )
        _add_colour_rules(
            workbook,
            sheet,
            xl_range_abs(1, OVERALL_COLUMN, last_row, OVERALL_COLUMN).replace("$", ""),
            OVERALL_COLOURS,
        )
        tester_range = xl_range_abs(
            1, FIRST_TESTER_COLUMN, last_row, LAST_TESTER_COLUMN
        ).replace("$", "")
        _add_colour_rules(workbook, sheet, tester_range, TESTER_COLOURS)
    workbook.close()
    return len(rows)
