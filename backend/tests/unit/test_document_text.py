"""Unit tests for utils.document_text — file-type-agnostic text extraction.

These tests build their input files programmatically (CSV / XLSX / DOCX
constructed with stdlib + openpyxl) so the test suite has no binary
fixtures to maintain. PDF extraction is exercised via a monkeypatched
``pypdf.PdfReader`` so the test stays fast and doesn't need a real PDF
to feed PyPDF/pypdf.
"""

from __future__ import annotations

import csv
import sys
import zipfile
from pathlib import Path

import pytest

# Make backend modules importable when pytest runs from the repo root.
_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from utils.document_text import (  # noqa: E402
    EXTRACTABLE_EXTENSIONS,
    UnsupportedFileTypeError,
    extract_text_csv,
    extract_text_docx,
    extract_text_from_file,
    extract_text_xlsx,
)

# ── CSV ──────────────────────────────────────────────────────────────────────


class TestExtractTextCsv:
    def test_returns_markdown_table(self, tmp_path):
        path = tmp_path / "plan.csv"
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["Role", "Person", "Onshore"])
            w.writerow(["PM", "Ada", "20"])
            w.writerow(["Dev", "Bob", "40"])

        out = extract_text_csv(str(path))
        # Header + separator + 2 body rows
        assert out.split("\n")[0] == "Role | Person | Onshore"
        assert out.split("\n")[1] == "--- | --- | ---"
        assert "PM | Ada | 20" in out
        assert "Dev | Bob | 40" in out

    def test_empty_file_returns_empty_string(self, tmp_path):
        path = tmp_path / "empty.csv"
        path.write_text("", encoding="utf-8")
        assert extract_text_csv(str(path)) == ""

    def test_pads_ragged_rows_to_header_width(self, tmp_path):
        path = tmp_path / "ragged.csv"
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["a", "b", "c"])
            w.writerow(["x"])  # ragged row — only one cell
        out = extract_text_csv(str(path))
        # The body row should still have three pipe-separated cells.
        body = out.split("\n")[2]
        assert body.count("|") == 2
        assert body.startswith("x")


# ── XLSX ─────────────────────────────────────────────────────────────────────


class TestExtractTextXlsx:
    def test_returns_per_sheet_markdown_tables(self, tmp_path):
        openpyxl = pytest.importorskip("openpyxl")
        wb = openpyxl.Workbook()
        ws1 = wb.active
        ws1.title = "Plan"
        ws1.append(["Role", "Person"])
        ws1.append(["PM", "Ada"])
        ws2 = wb.create_sheet("Risks")
        ws2.append(["Description", "Severity"])
        ws2.append(["Vendor late", "High"])
        path = tmp_path / "wb.xlsx"
        wb.save(str(path))

        out = extract_text_xlsx(str(path))
        assert "## Sheet: Plan" in out
        assert "## Sheet: Risks" in out
        assert "Role | Person" in out
        assert "PM | Ada" in out
        assert "Vendor late | High" in out

    def test_skips_empty_sheets(self, tmp_path):
        openpyxl = pytest.importorskip("openpyxl")
        wb = openpyxl.Workbook()
        wb.active.title = "Empty"
        wb.create_sheet("HasData").append(["x"])
        path = tmp_path / "wb.xlsx"
        wb.save(str(path))

        out = extract_text_xlsx(str(path))
        # Empty sheet's heading must not appear.
        assert "## Sheet: Empty" not in out
        assert "## Sheet: HasData" in out


# ── DOCX ─────────────────────────────────────────────────────────────────────


def _build_minimal_docx(path: Path, paragraphs: list[str]) -> None:
    """Write a minimal valid .docx with the given paragraph text.

    A docx is just a ZIP with a couple of canonical XML parts. We hand-roll
    the bare minimum so the test doesn't depend on python-docx for input.
    """
    body_xml = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body_xml}</w:body></w:document>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", document_xml)


class TestExtractTextDocx:
    def test_extracts_paragraphs(self, tmp_path):
        path = tmp_path / "doc.docx"
        _build_minimal_docx(path, ["Hello world", "Second line"])
        out = extract_text_docx(str(path))
        lines = out.split("\n")
        assert "Hello world" in lines
        assert "Second line" in lines

    def test_corrupt_zip_returns_empty(self, tmp_path):
        path = tmp_path / "junk.docx"
        path.write_bytes(b"not a zip")
        assert extract_text_docx(str(path)) == ""


# ── PDF (mocked) ─────────────────────────────────────────────────────────────


class TestExtractTextPdf:
    def test_joins_page_text(self, tmp_path, monkeypatch):
        # We don't need a real PDF — just assert our wrapper concatenates
        # what pypdf returns. Mock a minimal PdfReader.
        class _FakePage:
            def __init__(self, txt):
                self._t = txt

            def extract_text(self):
                return self._t

        class _FakeReader:
            def __init__(self, _path):
                self.pages = [_FakePage("Page one"), _FakePage("Page two")]

        # The import is lazy inside extract_text_pdf, so monkeypatch the
        # pypdf module before calling.
        import pypdf

        monkeypatch.setattr(pypdf, "PdfReader", _FakeReader)
        from utils.document_text import extract_text_pdf

        out = extract_text_pdf("ignored.pdf")
        assert "Page one" in out
        assert "Page two" in out
        # Pages are newline-joined.
        assert out.split("\n") == ["Page one", "Page two"]


# ── Dispatcher ───────────────────────────────────────────────────────────────


class TestExtractTextFromFile:
    @pytest.mark.parametrize("ext", sorted(EXTRACTABLE_EXTENSIONS))
    def test_extension_in_extractable_set(self, ext):
        # Sanity: every extension we claim to support has an entry in the
        # dispatcher (covered indirectly by the tests above, but this guards
        # against accidental list/dict drift).
        assert ext in {".pdf", ".docx", ".csv", ".xlsx"}

    def test_unsupported_extension_raises(self, tmp_path):
        path = tmp_path / "foo.pptx"
        path.write_bytes(b"nope")
        with pytest.raises(UnsupportedFileTypeError):
            extract_text_from_file(str(path))

    def test_routes_csv(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("a,b\n1,2\n", encoding="utf-8")
        out = extract_text_from_file(str(path))
        assert "a | b" in out
        assert "1 | 2" in out
