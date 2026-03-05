"""Unit tests for status_utils.py — pure aggregation logic, zero mocking."""

from status_utils import aggregate_service_results, compute_overall_status, truncate_error

# ── aggregate_service_results ────────────────────────────


class TestAggregateServiceResults:
    def test_all_dicts_passed_through(self):
        results = [
            {"name": "A", "status": "up", "port": 8000, "detail": "ok"},
            {"name": "B", "status": "down", "port": 5432, "detail": "err"},
        ]
        assert aggregate_service_results(results) == results

    def test_exception_converted_to_down(self):
        results = [RuntimeError("boom")]
        services = aggregate_service_results(results)
        assert len(services) == 1
        assert services[0]["status"] == "down"
        assert services[0]["name"] == "Unknown"
        assert "boom" in services[0]["detail"]

    def test_mixed_dicts_and_exceptions(self):
        results = [
            {"name": "OK", "status": "up", "port": 80, "detail": "fine"},
            ValueError("bad"),
        ]
        services = aggregate_service_results(results)
        assert len(services) == 2
        assert services[0]["status"] == "up"
        assert services[1]["status"] == "down"

    def test_empty_list(self):
        assert aggregate_service_results([]) == []

    def test_exception_detail_truncated_to_80(self):
        long_msg = "x" * 200
        services = aggregate_service_results([RuntimeError(long_msg)])
        assert len(services[0]["detail"]) <= 80


# ── compute_overall_status ───────────────────────────────


class TestComputeOverallStatus:
    def test_all_up(self):
        services = [{"status": "up"}, {"status": "up"}]
        assert compute_overall_status(services) == "healthy"

    def test_one_down(self):
        services = [{"status": "up"}, {"status": "down"}]
        assert compute_overall_status(services) == "degraded"

    def test_all_down(self):
        services = [{"status": "down"}, {"status": "down"}]
        assert compute_overall_status(services) == "degraded"

    def test_empty_is_healthy(self):
        assert compute_overall_status([]) == "healthy"


# ── truncate_error ───────────────────────────────────────


class TestTruncateError:
    def test_short_string_unchanged(self):
        assert truncate_error("short") == "short"

    def test_multiline_takes_first_line(self):
        assert truncate_error("first\nsecond\nthird") == "first"

    def test_long_line_capped_at_80(self):
        long = "x" * 200
        result = truncate_error(long)
        assert len(result) == 80

    def test_custom_max_length(self):
        assert truncate_error("abcdefghij", max_length=5) == "abcde"

    def test_empty_string(self):
        assert truncate_error("") == ""

    def test_single_newline(self):
        assert truncate_error("\nsecond") == ""
