"""
Unit tests for ml/sow_kg/ingest_async.py pure functions and utilities.
These tests require no Neo4j connection.
"""

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

# Add ml/ to path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from sow_kg.ingest_async import (
    IngestCache,
    IngestReport,
    TaskResult,
    _is_sow,
)

# ─── IngestReport & TaskResult ───────────────────────────────────────────────


class TestIngestReport:
    def test_initial_state(self):
        report = IngestReport()
        assert report.total == 0
        assert report.succeeded == 0
        assert report.skipped == 0
        assert report.failed == 0

    def test_add_successful_task(self):
        report = IngestReport()
        report.add(TaskResult(name="task_1", success=True, elapsed=1.5))
        assert report.total == 1
        assert report.succeeded == 1
        assert report.skipped == 0
        assert report.failed == 0

    def test_add_skipped_task(self):
        report = IngestReport()
        # A skipped task usually has success=True but skipped=True
        report.add(TaskResult(name="task_2", success=True, elapsed=0.0, skipped=True))
        assert report.total == 1
        assert report.skipped == 1
        assert report.succeeded == 0  # Skipped takes precedence in counting

    def test_add_failed_task(self):
        report = IngestReport()
        report.add(
            TaskResult(name="task_3", success=False, elapsed=2.1, error="Connection timeout")
        )
        assert report.total == 1
        assert report.failed == 1
        assert report.succeeded == 0

    def test_mixed_results(self):
        report = IngestReport()
        report.add(TaskResult(name="t1", success=True, elapsed=1.0))
        report.add(TaskResult(name="t2", success=False, elapsed=1.0))
        report.add(TaskResult(name="t3", success=True, elapsed=0.0, skipped=True))

        assert report.total == 3
        assert report.succeeded == 1
        assert report.failed == 1
        assert report.skipped == 1


# ─── IngestCache ─────────────────────────────────────────────────────────────


class TestIngestCache:
    def test_disabled_cache(self, tmp_path):
        file_path = tmp_path / "test.txt"
        file_path.write_text("hello world")

        cache = IngestCache(tmp_path, enabled=False)
        assert cache.is_stale(file_path) is True

    def test_cache_lifecycle(self, tmp_path):
        file_path = tmp_path / "data.csv"
        file_path.write_text("id,name\n1,test")

        cache = IngestCache(tmp_path, enabled=True)

        # 1. Initially, it's a new file, so it should be stale
        assert cache.is_stale(file_path) is True

        # 2. Mark it as done
        asyncio.run(cache.mark_done(file_path))

        # 3. Now it should not be stale
        assert cache.is_stale(file_path) is False

        # 4. Modify the file
        file_path.write_text("id,name\n1,test\n2,new")

        # 5. It should be stale again
        assert cache.is_stale(file_path) is True

    def test_existing_cache_loaded_on_init(self, tmp_path):
        cache_file = tmp_path / ".ingest_cache.json"
        target_file = tmp_path / "budget.csv"
        content = b"budget_data"
        target_file.write_bytes(content)

        # Manually create the cache file state
        file_hash = hashlib.sha256(content).hexdigest()
        cache_file.write_text(json.dumps({str(target_file): file_hash}))

        # Initialize cache; it should load the existing file
        cache = IngestCache(tmp_path, enabled=True)
        assert cache.is_stale(target_file) is False

    def test_corrupt_cache_file_handled_gracefully(self, tmp_path):
        cache_file = tmp_path / ".ingest_cache.json"
        cache_file.write_text("this is not valid json")

        target_file = tmp_path / "doc.md"
        target_file.write_text("content")

        # Should not crash during init
        cache = IngestCache(tmp_path, enabled=True)

        # Fails to load cache, falls back to empty, so the file is stale
        assert cache.is_stale(target_file) is True


# ─── _is_sow ─────────────────────────────────────────────────────────────────


class TestIsSow:
    @patch("sow_kg.ingest_async.extract_document")
    def test_is_sow_true_with_enough_signals(self, mock_extract):
        # Provide at least 3 matching SOW signals from the list
        # signals: "statement of work", "deliverable", "out of scope"
        mock_extract.return_value = {
            "raw_text": "This Statement of Work defines the final deliverable and items out of scope."
        }
        assert _is_sow(Path("dummy_doc.docx")) is True

    @patch("sow_kg.ingest_async.extract_document")
    def test_is_sow_false_with_few_signals(self, mock_extract):
        # Only 1 matching signal ("deliverable")
        mock_extract.return_value = {"raw_text": "Here is the deliverable for this week."}
        assert _is_sow(Path("dummy_status.docx")) is False

    @patch("sow_kg.ingest_async.extract_document")
    def test_is_sow_case_insensitive(self, mock_extract):
        # "STATEMENT OF WORK", "DELIVERABLE", "ACCEPTANCE CRITERIA"
        mock_extract.return_value = {
            "raw_text": "STATEMENT OF WORK: Each DELIVERABLE requires strict ACCEPTANCE CRITERIA."
        }
        assert _is_sow(Path("dummy_doc.pdf")) is True

    @patch("sow_kg.ingest_async.extract_document")
    def test_is_sow_returns_false_on_extraction_error(self, mock_extract):
        # Ensure it suppresses errors and safely skips
        mock_extract.side_effect = Exception("Failed to parse PDF binary")
        assert _is_sow(Path("corrupt_doc.pdf")) is False
