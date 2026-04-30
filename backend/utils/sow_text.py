"""
Plain-text flattening for SoW structured content.

Mirrors the JS ``flattenSectionText`` helper used by the SoW viewer
(``frontend/components/sow/SoWDocumentReader.js``). Both implementations
must produce identical output so that comment offsets computed in the
browser remain valid when re-checked server-side for staleness, and so
that AI checklist generation sees the same flattened body the reviewer
reads.

The flattening rules walk the recursive ``DocValue`` shape:

* ``str``         → the string itself (newline appended when not the last child)
* ``int / float`` → ``str(x)`` with newline
* ``bool``        → ``"Yes"`` / ``"No"`` with newline
* ``None``        → empty string
* ``list``        → each element flattened, newline-separated
* ``dict``        → each ``key: value`` pair as ``"<Title-cased key>\\n<value>\\n"``
* anything else   → ``str(x)`` with newline

The output is always a plain string — no Markdown, no HTML.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

# Convert camelCase keys ("executiveSummary") to "Executive Summary"
_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _humanise_key(key: str) -> str:
    if not isinstance(key, str):
        return str(key)
    spaced = _CAMEL_RE.sub(" ", key).replace("_", " ").replace("-", " ")
    return spaced.strip().title()


def flatten_section_text(value: Any) -> str:
    """Flatten a SoW section's structured value to deterministic plain text.

    Trailing whitespace is trimmed from the final result so identical
    inputs produce identical hashes regardless of trailing newlines.
    """
    text = _flatten(value).rstrip("\n").rstrip()
    return text


def flatten_sow_content(content: dict[str, Any] | None) -> str:
    """Flatten an entire ``sow.content`` dict into one body of plain text.

    Sections appear in dict-iteration order — the JS side preserves this
    by iterating its source object the same way. Section headings use
    title-cased keys to keep output human-readable.
    """
    if not isinstance(content, dict):
        return ""
    parts: list[str] = []
    for key, val in content.items():
        body = flatten_section_text(val)
        if not body:
            continue
        parts.append(f"{_humanise_key(key)}\n{body}")
    return "\n\n".join(parts)


def hash_sow_content(content: dict[str, Any] | None) -> str:
    """Stable hash of ``sow.content`` — used to detect SoW edits between
    cache writes and reads. Sorted keys + utf-8 encoding so two equivalent
    content dicts always hash the same."""
    payload = json.dumps(content or {}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ── Suggestion application ──────────────────────────────────────────────────


class SuggestionApplyError(ValueError):
    """Raised when a suggested edit cannot be applied to the SoW content.

    Used by the comments router to surface a precise reason in the 409
    response body. ``code`` is a short tag the frontend can pattern-match
    on; ``message`` is human-readable.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _walk_string_leaves(node: Any, path: list):
    """Yield ``(path, string_value)`` for every string leaf in the tree."""
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from _walk_string_leaves(item, path + [i])
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from _walk_string_leaves(v, path + [k])


def _set_at_path(root: Any, path: list, new_value: str) -> None:
    """Mutate ``root`` so that following ``path`` lands on ``new_value``.

    Caller is responsible for cloning ``root`` first if they want
    immutability — we mutate in place to keep the helper simple.
    """
    if not path:
        # Caller passed an empty path; the only sensible interpretation is
        # to replace the root itself, but Python can't reassign through
        # this function. Raise so the caller can handle it.
        raise SuggestionApplyError(
            "invalid_path", "Cannot apply replacement at the root of a section"
        )
    target = root
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = new_value


def apply_suggestion_to_content(
    content: dict[str, Any],
    *,
    section_key: str,
    anchor_text: str,
    replacement_text: str,
) -> dict[str, Any]:
    """Return a new ``content`` dict with the suggestion applied.

    Strategy: walk the named section's subtree, find a single string leaf
    that contains ``anchor_text`` exactly once, replace that occurrence
    with ``replacement_text``. Refuses ambiguous matches (multiple leaves
    or multiple occurrences within one leaf) so suggestions never silently
    edit the wrong spot.

    Raises :class:`SuggestionApplyError` when the edit can't be applied.
    """
    import copy

    if not isinstance(content, dict) or section_key not in content:
        raise SuggestionApplyError(
            "section_missing",
            f"Section '{section_key}' is no longer present in the SoW",
        )

    new_content = copy.deepcopy(content)
    section = new_content[section_key]

    if isinstance(section, str):
        # Section is itself a single string — handle inline.
        occurrences = section.count(anchor_text)
        if occurrences == 0:
            raise SuggestionApplyError(
                "anchor_missing",
                "The highlighted text is no longer in the section",
            )
        if occurrences > 1:
            raise SuggestionApplyError(
                "anchor_ambiguous",
                "The highlighted text appears multiple times — cannot determine where to apply",
            )
        new_content[section_key] = section.replace(anchor_text, replacement_text, 1)
        return new_content

    # Walk for leaves containing anchor_text.
    matches: list[tuple[list, str, int]] = []  # (path, value, occurrences)
    for path, value in _walk_string_leaves(section, []):
        n = value.count(anchor_text)
        if n > 0:
            matches.append((path, value, n))

    if not matches:
        raise SuggestionApplyError(
            "anchor_missing",
            "The highlighted text is no longer in the section",
        )
    if len(matches) > 1:
        raise SuggestionApplyError(
            "anchor_ambiguous",
            "The highlighted text appears in multiple places — apply the edit manually",
        )
    path, value, occurrences = matches[0]
    if occurrences > 1:
        raise SuggestionApplyError(
            "anchor_ambiguous",
            "The highlighted text appears multiple times — cannot determine where to apply",
        )

    new_value = value.replace(anchor_text, replacement_text, 1)
    _set_at_path(section, path, new_value)
    return new_content


# ── internal ────────────────────────────────────────────────────────────────


def _flatten(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return ("Yes" if value else "No") + "\n"
    if isinstance(value, int | float):
        return f"{value}\n"
    if isinstance(value, str):
        return value + "\n" if value else ""
    if isinstance(value, list):
        return "".join(_flatten(item) for item in value)
    if isinstance(value, dict):
        out: list[str] = []
        for k, v in value.items():
            sub = _flatten(v).rstrip("\n")
            if not sub:
                continue
            out.append(f"{_humanise_key(k)}\n{sub}\n")
        return "".join(out)
    return f"{value}\n"
