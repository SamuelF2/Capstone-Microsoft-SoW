/**
 * Centralized AI client.
 *
 * Wraps every AI / GraphRAG endpoint behind a single helper so pages don't
 * have to re-implement error handling, status mapping, or 503 retry/skip
 * branching. Each method returns a uniform envelope:
 *
 *   { ok: true,  data }                                — success
 *   { ok: false, error: { message, retryable, status } } — failure
 *
 * Components can pattern-match on `error.retryable` to choose between a
 * "Try again" button and a "Skip AI Review" CTA.
 */

async function call(authFetch, url, { method = 'GET', body, signal } = {}) {
  const init = { method, signal };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await authFetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return {
      ok: false,
      error: { message: err?.message || 'Network error', retryable: true, status: 0 },
    };
  }
  if (!res.ok) {
    let detail = null;
    try {
      detail = await res.json();
    } catch {
      // body wasn't JSON
    }
    // FastAPI nests structured errors under `detail` — unwrap one level so
    // callers don't have to.
    const inner = detail?.detail ?? detail;
    const message =
      typeof inner === 'string' ? inner : inner?.message || `Request failed (${res.status})`;
    const retryable =
      typeof inner === 'object' && inner !== null && 'retryable' in inner
        ? Boolean(inner.retryable)
        : res.status >= 500;
    return { ok: false, error: { message, retryable, status: res.status } };
  }
  // 200 with possibly null body (cached endpoint)
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: true, data };
}

export const aiClient = {
  // ── Health & graph metadata ────────────────────────────────────────────
  health(authFetch, opts) {
    return call(authFetch, '/api/ai/health', opts);
  },
  graphSummary(authFetch, opts) {
    return call(authFetch, '/api/ai/graph/summary', opts);
  },

  // ── Per-SoW analysis (cached + run) ────────────────────────────────────
  cachedAnalysis(authFetch, sowId, opts) {
    return call(authFetch, `/api/sow/${sowId}/ai-analyze`, opts);
  },
  runAnalysis(authFetch, sowId, opts) {
    return call(authFetch, `/api/sow/${sowId}/ai-analyze`, { method: 'POST', ...opts });
  },
  skipReview(authFetch, sowId, reason, opts) {
    return call(authFetch, `/api/sow/${sowId}/skip-ai-review`, {
      method: 'POST',
      body: { reason, acknowledged_unavailable: true },
      ...opts,
    });
  },

  // ── Live draft surfaces ────────────────────────────────────────────────
  context(authFetch, query, sowId = null, { topK = 5, hopDepth = 2, signal } = {}) {
    const params = new URLSearchParams({ query, top_k: String(topK), hop_depth: String(hopDepth) });
    if (sowId != null) params.set('sow_id', String(sowId));
    return call(authFetch, `/api/ai/context?${params.toString()}`, { signal });
  },
  assist(authFetch, query, sowId = null, history = [], { sectionKey, ...opts } = {}) {
    const body = { query, sow_id: sowId, history };
    if (sectionKey) body.section_key = sectionKey;
    return call(authFetch, '/api/ai/assist', {
      method: 'POST',
      body,
      ...opts,
    });
  },
  assistStream(authFetch, query, sowId = null, history = [], opts) {
    return call(authFetch, '/api/ai/assist/stream', {
      method: 'POST',
      body: { query, sow_id: sowId, history },
      ...opts,
    });
  },

  // ── Per-SoW retrievers ─────────────────────────────────────────────────
  similar(authFetch, sowId, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/similar`, opts);
  },
  risks(authFetch, sowId, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/risks`, opts);
  },
  validate(authFetch, sowId, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/validate`, opts);
  },
  insights(authFetch, sowId, role, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/insights/${role}`, opts);
  },
  approval(authFetch, { value, margin } = {}, opts) {
    const params = new URLSearchParams();
    if (value != null) params.set('value', String(value));
    if (margin != null) params.set('margin', String(margin));
    const qs = params.toString();
    return call(authFetch, `/api/ai/approval${qs ? `?${qs}` : ''}`, opts);
  },

  // ── Document → SoW field extraction ────────────────────────────────────
  // Two-step pipeline: first extract proposes structured values (no DB
  // mutation), then apply writes the user-approved subset back. The
  // `expected_content_hash` echoed back into apply guards against the
  // draft auto-save changing content while the preview modal is open.
  extractFromDocument(
    authFetch,
    sowId,
    { attachmentId = null, targetSections = null, signal } = {}
  ) {
    const body = {};
    if (attachmentId != null) body.attachment_id = attachmentId;
    if (targetSections) body.target_sections = targetSections;
    return call(authFetch, `/api/sow/${sowId}/extract-from-document`, {
      method: 'POST',
      body,
      signal,
    });
  },
  applyExtraction(authFetch, sowId, { sections, expectedContentHash, signal } = {}) {
    return call(authFetch, `/api/sow/${sowId}/apply-extraction`, {
      method: 'POST',
      body: { sections, expected_content_hash: expectedContentHash },
      signal,
    });
  },

  // ── KG ingest + finalize prose ─────────────────────────────────────────
  syncSow(authFetch, sowId, body, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/sync`, {
      method: 'POST',
      body: body || {},
      ...opts,
    });
  },
  unsyncSow(authFetch, sowId, opts) {
    return call(authFetch, `/api/ai/sow/${sowId}/sync`, { method: 'DELETE', ...opts });
  },
  documentProse(authFetch, sowId, opts) {
    return call(authFetch, '/api/ai/document/prose', {
      method: 'POST',
      body: { sow_id: sowId },
      ...opts,
    });
  },

  // ── Schema proposals (admin-only) ──────────────────────────────────────
  // Backed by /api/ai/schema/proposals* — the dashboard at
  // /schema-proposals consumes these. `reviewed_by` is server-stamped from
  // the caller's identity so we never send it from here.
  schemaProposals(authFetch, { status, kind, sort, signal } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    return call(authFetch, `/api/ai/schema/proposals${qs ? `?${qs}` : ''}`, { signal });
  },
  approveProposal(authFetch, proposalId, { tags, note } = {}, opts) {
    const body = {};
    if (tags) body.tags = tags;
    if (note) body.note = note;
    return call(authFetch, `/api/ai/schema/proposals/${proposalId}/approve`, {
      method: 'POST',
      body,
      ...opts,
    });
  },
  rejectProposal(authFetch, proposalId, { tags, note } = {}, opts) {
    const body = {};
    if (tags) body.tags = tags;
    if (note) body.note = note;
    return call(authFetch, `/api/ai/schema/proposals/${proposalId}/reject`, {
      method: 'POST',
      body,
      ...opts,
    });
  },
  bulkReviewProposals(authFetch, { ids, action, tags, note }, opts) {
    const body = { ids, action };
    if (tags) body.tags = tags;
    if (note) body.note = note;
    return call(authFetch, '/api/ai/schema/proposals/bulk-review', {
      method: 'POST',
      body,
      ...opts,
    });
  },
};

export default aiClient;
