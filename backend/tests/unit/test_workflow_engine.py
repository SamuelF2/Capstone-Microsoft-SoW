"""Unit tests for the Microsoft Default Workflow predicate evaluator + the
shared role-active filter. Pure-Python — no DB, no asyncpg. The async I/O
pieces of workflow_engine (fan-out, join, etc.) are covered by the existing
integration tests; what's tested here are the small synchronous pieces that
the new conditional-branch logic relies on.
"""

from services.workflow_engine import (
    _find_join_target_for_branch,
    _is_role_active,
    evaluate_skip_condition,
)

# ── evaluate_skip_condition ────────────────────────────────────────────────


class TestEvaluateSkipCondition:
    """Predicate evaluator. Returns True iff the condition matches and a
    branch should be skipped (or, for required_if, a role should be required)."""

    # eq operator

    def test_eq_matches_returns_true(self):
        condition = {"field": "has_sensitive_ai", "op": "eq", "value": False}
        meta = {"has_sensitive_ai": False}
        assert evaluate_skip_condition(condition, meta) is True

    def test_eq_does_not_match_returns_false(self):
        condition = {"field": "has_sensitive_ai", "op": "eq", "value": False}
        meta = {"has_sensitive_ai": True}
        assert evaluate_skip_condition(condition, meta) is False

    def test_eq_string_value(self):
        condition = {"field": "region", "op": "eq", "value": "EMEA"}
        assert evaluate_skip_condition(condition, {"region": "EMEA"}) is True
        assert evaluate_skip_condition(condition, {"region": "AMER"}) is False

    # is_empty operator

    def test_is_empty_on_missing_field_returns_true(self):
        condition = {"field": "shared_services_groups", "op": "is_empty"}
        assert evaluate_skip_condition(condition, {}) is True

    def test_is_empty_on_none_returns_true(self):
        condition = {"field": "shared_services_groups", "op": "is_empty"}
        assert evaluate_skip_condition(condition, {"shared_services_groups": None}) is True

    def test_is_empty_on_empty_list_returns_true(self):
        condition = {"field": "shared_services_groups", "op": "is_empty"}
        assert evaluate_skip_condition(condition, {"shared_services_groups": []}) is True

    def test_is_empty_on_empty_string_returns_true(self):
        condition = {"field": "notes", "op": "is_empty"}
        assert evaluate_skip_condition(condition, {"notes": ""}) is True

    def test_is_empty_on_non_empty_list_returns_false(self):
        condition = {"field": "shared_services_groups", "op": "is_empty"}
        assert evaluate_skip_condition(condition, {"shared_services_groups": ["UX"]}) is False

    # contains operator

    def test_contains_finds_member_in_list(self):
        condition = {"field": "shared_services_groups", "op": "contains", "value": "UX"}
        meta = {"shared_services_groups": ["UX", "ACM"]}
        assert evaluate_skip_condition(condition, meta) is True

    def test_contains_missing_member_returns_false(self):
        condition = {"field": "shared_services_groups", "op": "contains", "value": "UX"}
        meta = {"shared_services_groups": ["ACM"]}
        assert evaluate_skip_condition(condition, meta) is False

    def test_contains_on_empty_list_returns_false(self):
        condition = {"field": "shared_services_groups", "op": "contains", "value": "UX"}
        assert evaluate_skip_condition(condition, {"shared_services_groups": []}) is False

    def test_contains_does_not_match_other_prefix_entries(self):
        # 'Other:' free-text entries should NOT trigger named-group sub-roles.
        condition = {"field": "shared_services_groups", "op": "contains", "value": "Other"}
        meta = {"shared_services_groups": ["Other: SecureScore Analytics"]}
        # Strict equality on list members → "Other" != "Other: SecureScore..."
        assert evaluate_skip_condition(condition, meta) is False

    # Fail-open semantics

    def test_none_condition_returns_false(self):
        assert evaluate_skip_condition(None, {"anything": True}) is False

    def test_empty_dict_condition_returns_false(self):
        assert evaluate_skip_condition({}, {"anything": True}) is False

    def test_unknown_operator_returns_false(self):
        condition = {"field": "x", "op": "matches_regex", "value": ".*"}
        assert evaluate_skip_condition(condition, {"x": "anything"}) is False

    def test_missing_field_in_condition_returns_false(self):
        # Condition without 'field' key — fail-open.
        assert evaluate_skip_condition({"op": "eq", "value": True}, {}) is False

    def test_non_dict_meta_returns_false(self):
        condition = {"field": "x", "op": "eq", "value": True}
        assert evaluate_skip_condition(condition, None) is False


# ── _is_role_active ────────────────────────────────────────────────────────


class TestIsRoleActive:
    """Combines is_required + esap_levels + required_if into a single check."""

    def test_simple_required_role_is_active(self):
        role = {"role_key": "cpl", "is_required": True}
        assert _is_role_active(role, "type-1", {}) is True

    def test_non_required_role_inactive(self):
        role = {"role_key": "cpl", "is_required": False}
        assert _is_role_active(role, "type-1", {}) is False

    def test_default_is_required_when_missing(self):
        # is_required defaults to True
        role = {"role_key": "cpl"}
        assert _is_role_active(role, "type-1", {}) is True

    def test_esap_levels_filter_excludes_role(self):
        role = {"role_key": "delivery-manager", "is_required": True, "esap_levels": ["type-1"]}
        assert _is_role_active(role, "type-2", {}) is False
        assert _is_role_active(role, "type-1", {}) is True

    def test_esap_levels_none_means_all_levels(self):
        role = {"role_key": "cpl", "is_required": True, "esap_levels": None}
        assert _is_role_active(role, "type-3", {}) is True

    def test_required_if_true_keeps_role_active(self):
        role = {
            "role_key": "ux-services-lead",
            "is_required": True,
            "required_if": {
                "field": "shared_services_groups",
                "op": "contains",
                "value": "UX",
            },
        }
        meta = {"shared_services_groups": ["UX"]}
        assert _is_role_active(role, "type-1", meta) is True

    def test_required_if_false_excludes_role(self):
        role = {
            "role_key": "ux-services-lead",
            "is_required": True,
            "required_if": {
                "field": "shared_services_groups",
                "op": "contains",
                "value": "UX",
            },
        }
        meta = {"shared_services_groups": ["ACM"]}
        assert _is_role_active(role, "type-1", meta) is False

    def test_required_if_with_missing_metadata_excludes_role(self):
        # No SoW metadata at all → contains predicate fails-open to False
        # → required_if is False → role is NOT required.
        role = {
            "role_key": "ux-services-lead",
            "is_required": True,
            "required_if": {
                "field": "shared_services_groups",
                "op": "contains",
                "value": "UX",
            },
        }
        assert _is_role_active(role, "type-1", {}) is False

    def test_combined_esap_and_required_if_both_must_match(self):
        role = {
            "role_key": "ux-services-lead",
            "is_required": True,
            "esap_levels": ["type-1", "type-2"],
            "required_if": {
                "field": "shared_services_groups",
                "op": "contains",
                "value": "UX",
            },
        }
        meta = {"shared_services_groups": ["UX"]}
        # Type-1 + UX selected → active
        assert _is_role_active(role, "type-1", meta) is True
        # Type-3 (excluded by esap_levels) + UX → inactive
        assert _is_role_active(role, "type-3", meta) is False
        # Type-1 + UX missing → inactive
        assert _is_role_active(role, "type-1", {"shared_services_groups": []}) is False


# ── _find_join_target_for_branch ───────────────────────────────────────────


class TestFindJoinTargetForBranch:
    """Walks on_approve / default outgoing transitions from a branch."""

    def test_returns_on_approve_target(self):
        wd = {
            "transitions": [
                {
                    "from_stage": "responsible_ai_review",
                    "to_stage": "deal_review",
                    "condition": "on_approve",
                },
            ]
        }
        assert _find_join_target_for_branch(wd, "responsible_ai_review") == "deal_review"

    def test_returns_default_target(self):
        wd = {
            "transitions": [
                {
                    "from_stage": "responsible_ai_review",
                    "to_stage": "deal_review",
                    "condition": "default",
                },
            ]
        }
        assert _find_join_target_for_branch(wd, "responsible_ai_review") == "deal_review"

    def test_ignores_non_forward_edges(self):
        # Only on_send_back / on_reject — no forward edge → returns None.
        wd = {
            "transitions": [
                {
                    "from_stage": "global_dev_review",
                    "to_stage": "solution_review",
                    "condition": "on_send_back",
                },
                {
                    "from_stage": "global_dev_review",
                    "to_stage": "rejected",
                    "condition": "on_reject",
                },
            ]
        }
        assert _find_join_target_for_branch(wd, "global_dev_review") is None

    def test_returns_none_for_unknown_branch(self):
        wd = {"transitions": []}
        assert _find_join_target_for_branch(wd, "no_such_stage") is None
