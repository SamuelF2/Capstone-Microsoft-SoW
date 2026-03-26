"""
Raw text and structure extraction per file type.

Handles: .md, .json, .docx, .pdf
Returns a normalised document dict that ingest.py consumes regardless of source format.

{
    "filename":   str,
    "title":      str,
    "raw_text":   str,
    "sections": [
        {
            "heading": str,
            "level":   int,
            "content": str,
            "char_count": int,
        }
    ],
    "tables":     list[list[list[str]]],   # raw tables for deliverable/risk extraction
    "metadata":   dict,                     # file-type-specific extras
}
"""

from __future__ import annotations

import re
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

def extract_document(path: Path) -> dict:
    """Route to the correct extractor by file extension."""
    suffix = path.suffix.lower()
    extractors = {
        ".md":   _extract_markdown,
        ".json": _extract_json,
        ".docx": _extract_docx,
        ".pdf":  _extract_pdf,
    }
    fn = extractors.get(suffix)
    if fn is None:
        raise ValueError(f"Unsupported file type: {suffix}. Supported: {list(extractors)}")
    return fn(path)

def _extract_markdown(path: Path) -> dict:
    content  = path.read_text(encoding="utf-8", errors="replace")
    sections = _split_markdown_sections(content)
    title    = path.stem.replace("_", " ").replace("-", " ")

    h1 = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if h1:
        title = h1.group(1).strip()

    tables = _extract_markdown_tables(content)

    return {
        "filename": path.name,
        "title":    title,
        "raw_text": content,
        "sections": sections,
        "tables":   tables,
        "metadata": {"format": "markdown"},
    }


def _split_markdown_sections(content: str) -> list[dict]:
    pattern = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(content))
    sections = []
    for i, match in enumerate(matches):
        heading = match.group(2).strip()
        level   = len(match.group(1))
        start   = match.end()
        end     = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body    = content[start:end].strip()
        if body:
            sections.append({
                "heading":    heading,
                "level":      level,
                "content":    body,
                "char_count": len(body),
            })
    return sections


def _extract_markdown_tables(content: str) -> list[list[list[str]]]:
    """Extract all pipe tables from markdown as list of rows."""
    tables = []
    current = []
    for line in content.splitlines():
        if re.match(r"^\|.+\|$", line.strip()):
            row = [c.strip() for c in line.strip().strip("|").split("|")]
            current.append(row)
        else:
            if len(current) > 2:
                tables.append(current)
            current = []
    if len(current) > 2:
        tables.append(current)
    return tables

def _extract_json(path: Path) -> dict:
    """
    JSON rules files — flatten to pseudo-sections for LLM processing.
    Each top-level key becomes a section.
    """
    raw = path.read_text(encoding="utf-8", errors="replace")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error in {path.name}: {e}")
        data = {}

    sections = []
    if isinstance(data, dict):
        for key, value in data.items():
            content = json.dumps(value, indent=2) if not isinstance(value, str) else value
            sections.append({
                "heading":    key,
                "level":      1,
                "content":    content[:3000],
                "char_count": len(content),
            })
    elif isinstance(data, list):
        for i, item in enumerate(data[:50]):
            content = json.dumps(item, indent=2) if not isinstance(item, str) else item
            sections.append({
                "heading":    f"item_{i}",
                "level":      1,
                "content":    content[:1000],
                "char_count": len(content),
            })

    return {
        "filename": path.name,
        "title":    path.stem.replace("_", " ").replace("-", " "),
        "raw_text": raw,
        "sections": sections,
        "tables":   [],
        "metadata": {"format": "json", "parsed": data},
    }

def _extract_docx(path: Path) -> dict:
    """
    Extract structure from Word documents using python-docx.
    Uses heading styles directly — no regex needed.
    """
    try:
        from docx import Document
        from docx.oxml.ns import qn
    except ImportError:
        raise ImportError("python-docx not installed. Run: uv add python-docx")

    doc   = Document(str(path))
    title = path.stem.replace("_", " ")

    sections  = []
    tables_raw = []
    current_heading  = None
    current_level    = 0
    current_content  = []

    def flush():
        if current_heading and current_content:
            body = "\n".join(current_content).strip()
            if body:
                sections.append({
                    "heading":    current_heading,
                    "level":      current_level,
                    "content":    body,
                    "char_count": len(body),
                })

    for block in doc.element.body:
        tag = block.tag.split("}")[-1] if "}" in block.tag else block.tag

        if tag == "p":
            # Get paragraph style
            style_name = ""
            pPr = block.find(qn("w:pPr"))
            if pPr is not None:
                pStyle = pPr.find(qn("w:pStyle"))
                if pStyle is not None:
                    style_name = pStyle.get(qn("w:val"), "")

            # Get text
            text = "".join(
                node.text or ""
                for node in block.iter()
                if node.tag == qn("w:t")
            ).strip()

            if not text:
                continue

            # Detect headings by style name
            heading_match = re.match(r"[Hh]eading\s*(\d)", style_name)
            if heading_match:
                flush()
                current_heading = text
                current_level   = int(heading_match.group(1))
                current_content = []
                # Use first Heading 1 as document title
                if current_level == 1 and title == path.stem.replace("_", " "):
                    title = text
            elif style_name == "Title":
                title = text
            else:
                current_content.append(text)

        elif tag == "tbl":
            # Extract table rows
            tbl_rows = []
            for row in block.findall(".//" + qn("w:tr")):
                cells = []
                for cell in row.findall(".//" + qn("w:tc")):
                    cell_text = "".join(
                        n.text or "" for n in cell.iter() if n.tag == qn("w:t")
                    ).strip()
                    cells.append(cell_text)
                if cells:
                    tbl_rows.append(cells)
                    current_content.append(" | ".join(cells))
            if tbl_rows:
                tables_raw.append(tbl_rows)

    flush()

    # Also extract raw text for fallback
    raw_text = "\n".join(
        "".join(n.text or "" for n in p.iter() if n.tag == qn("w:t"))
        for p in doc.element.body.iter()
        if p.tag == qn("w:p")
    )

    return {
        "filename": path.name,
        "title":    title,
        "raw_text": raw_text,
        "sections": sections,
        "tables":   tables_raw,
        "metadata": {
            "format":        "docx",
            "section_count": len(sections),
            "table_count":   len(tables_raw),
        },
    }

def _extract_pdf(path: Path) -> dict:
    """
    Extract structure from PDF using pymupdf (fitz).
    Uses font size heuristics to detect headings.
    """
    try:
        import fitz  # pymupdf
    except ImportError:
        raise ImportError("pymupdf not installed. Run: uv add pymupdf")

    doc   = fitz.open(str(path))
    title = path.stem.replace("_", " ")

    # First pass: collect all text blocks with font info
    blocks = []
    for page_num, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:  # skip images
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not text:
                        continue
                    blocks.append({
                        "text":      text,
                        "size":      span["size"],
                        "bold":      "Bold" in span.get("font", "") or span["flags"] & 2**4,
                        "page":      page_num + 1,
                    })

    if not blocks:
        doc.close()
        return {
            "filename": path.name,
            "title":    title,
            "raw_text": "",
            "sections": [],
            "tables":   [],
            "metadata": {"format": "pdf", "pages": len(doc)},
        }

    # Determine heading threshold — top 15% of font sizes are headings
    sizes  = sorted(set(b["size"] for b in blocks), reverse=True)
    body_size   = sorted([b["size"] for b in blocks])[len(blocks) // 2]  # median
    heading_threshold = body_size * 1.15

    # Second pass: group into sections
    sections = []
    current_heading = None
    current_level   = 1
    current_content = []

    def flush():
        if current_heading and current_content:
            body = " ".join(current_content).strip()
            if body:
                sections.append({
                    "heading":    current_heading,
                    "level":      current_level,
                    "content":    body,
                    "char_count": len(body),
                })

    for block in blocks:
        is_heading = (
            block["size"] >= heading_threshold or
            (block["bold"] and block["size"] >= body_size and len(block["text"]) < 120)
        )
        if is_heading and len(block["text"]) > 3:
            flush()
            current_heading = block["text"]
            current_level   = 1 if block["size"] >= heading_threshold * 1.1 else 2
            current_content = []
            if not title or title == path.stem.replace("_", " "):
                if block["page"] == 1:
                    title = block["text"]
        else:
            current_content.append(block["text"])

    flush()

    raw_text = " ".join(b["text"] for b in blocks)
    doc.close()

    return {
        "filename": path.name,
        "title":    title,
        "raw_text": raw_text,
        "sections": sections,
        "tables":   [],  # PDF table extraction requires camelot/pdfplumber, left as future enhancement
        "metadata": {
            "format":        "pdf",
            "section_count": len(sections),
        },
    }
