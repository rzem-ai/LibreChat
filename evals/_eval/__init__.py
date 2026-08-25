"""
Centralised evaluation framework for agent skills.

This package provides a wrapper-agnostic test runner that evaluates
agent outputs against configurable gating and diagnostic metrics.
"""

from .runner import run_eval  # noqa: F401
