"""
Pytest configuration and fixtures
Owner: Zhan Su (QA Engineer)
"""

import pytest


@pytest.fixture
def sample_sow():
    """Load a sample SOW for testing"""
    with open("tests/fixtures/sample_sow.md") as f:
        return f.read()
