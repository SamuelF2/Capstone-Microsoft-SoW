"""
Unit tests for ml/sow_kg/enrich.py pure functions.
No Neo4j or model loading required.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

from sow_kg.enrich import _batched, _content_hash


class TestContentHash:
    def test_deterministic(self):
        assert _content_hash("hello world") == _content_hash("hello world")

    def test_different_input_different_hash(self):
        assert _content_hash("hello") != _content_hash("world")

    def test_empty_string(self):
        result = _content_hash("")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_returns_md5_hex(self):
        result = _content_hash("test")
        assert len(result) == 32  # full md5 hex digest
        assert all(c in "0123456789abcdef" for c in result)


class TestBatched:
    def test_even_split(self):
        items = list(range(10))
        batches = list(_batched(items, 5))
        assert len(batches) == 2
        assert batches[0] == [0, 1, 2, 3, 4]
        assert batches[1] == [5, 6, 7, 8, 9]

    def test_uneven_split(self):
        items = list(range(7))
        batches = list(_batched(items, 3))
        assert len(batches) == 3
        assert batches[0] == [0, 1, 2]
        assert batches[1] == [3, 4, 5]
        assert batches[2] == [6]

    def test_batch_larger_than_items(self):
        items = [1, 2, 3]
        batches = list(_batched(items, 100))
        assert len(batches) == 1
        assert batches[0] == [1, 2, 3]

    def test_empty_list(self):
        batches = list(_batched([], 5))
        assert batches == []

    def test_batch_size_one(self):
        items = [1, 2, 3]
        batches = list(_batched(items, 1))
        assert len(batches) == 3
        assert all(len(b) == 1 for b in batches)
