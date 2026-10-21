#!/usr/bin/env python3
"""Convert any document to plain text for eval scaffolding.

Supports .md and .txt natively; uses markitdown for PDF, DOCX, PPTX, and XLSX.

Run from the project root:
    uv run python .github/skills/eval-scaffolder/scripts/read_document.py <path>
"""

import sys
from pathlib import Path

_PLAINTEXT = {".md", ".txt"}
_MARKITDOWN = {".pdf", ".docx", ".pptx", ".xlsx"}


def read(path: str) -> str:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Document not found: {p}")
    ext = p.suffix.lower()
    if ext in _PLAINTEXT:
        return p.read_text(encoding="utf-8")
    if ext not in _MARKITDOWN:
        supported = sorted(_PLAINTEXT | _MARKITDOWN)
        raise ValueError(f"Unsupported file type '{ext}'. Supported: {supported}")
    from markitdown import MarkItDown

    return MarkItDown().convert(str(p)).text_content


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: read_document.py <file_path>", file=sys.stderr)
        sys.exit(1)
    print(read(sys.argv[1]))
