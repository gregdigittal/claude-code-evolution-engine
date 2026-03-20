/**
 * CCEE Mission Control — Review UI SPA
 *
 * Fetches proposals from /api/ccee/latest and renders the review interface.
 * Accept/reject decisions are posted to /api/ccee/runs/:date/apply and /reject.
 *
 * Security: All content set via textContent or safe DOM construction.
 * No innerHTML used with untrusted data.
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  runDate: null,
  proposals: [],
  decisions: {}, // proposalId → 'accepted' | 'rejected' | 'deferred' (in-session, pre-persist)
};

// ---------------------------------------------------------------------------
// Effective status — combines server-persisted status with in-session decisions
// ---------------------------------------------------------------------------
function effectiveStatus(proposal) {
  // Server-persisted terminal states take precedence
  if (proposal.status === 'applied') return 'applied';
  if (proposal.status === 'rejected') return 'rejected';
  // In-session reject decision (optimistic, before API persist)
  if (state.decisions[proposal.id] === 'rejected') return 'rejected';
  // Everything else (pending, accepted-pending, deferred) stays active
  return 'pending';
}

// ---------------------------------------------------------------------------
// localStorage helpers for deferred proposals
// ---------------------------------------------------------------------------
function getDeferredIds(runDate) {
  try {
    const raw = localStorage.getItem('ccee-deferred-' + runDate);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDeferredIds(runDate, ids) {
  try {
    localStorage.setItem('ccee-deferred-' + runDate, JSON.stringify(ids));
  } catch {}
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const runMeta = $('run-meta');
const proposalsContainer = $('proposals-container');
const emptyState = $('empty-state');
const selectedCountEl = $('selected-count');
const btnApply = $('btn-apply-selected');
const btnTrigger = $('btn-trigger');
const btnTriggerEmpty = $('btn-trigger-empty');
const btnExport = $('btn-export');
const btnDefer = $('btn-defer');
const runList = $('run-list');
const vals = {
  sources: $('val-sources'),
  repos: $('val-repos'),
  videos: $('val-videos'),
  proposals: $('val-proposals'),
  passed: $('val-passed'),
  highRisk: $('val-high-risk'),
};

// ---------------------------------------------------------------------------
// Fetch helpers (trusted internal API only)
// ---------------------------------------------------------------------------
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return res.json();
}

// ---------------------------------------------------------------------------
// Safe DOM helpers
// ---------------------------------------------------------------------------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(cls, text) {
  return el('span', 'badge badge--' + cls, text);
}

// ---------------------------------------------------------------------------
// Load runs list
// ---------------------------------------------------------------------------
async function loadRunsList() {
  try {
    const data = await fetchJson('/api/ccee/runs');
    const runs = data.runs || [];
    runList.textContent = '';

    if (runs.length === 0) {
      runList.appendChild(el('span', 'text-muted', 'No runs yet'));
      return;
    }

    for (const runDate of runs) {
      const item = el('div', 'run-item' + (runDate === state.runDate ? ' active' : ''), runDate);
      item.dataset.runDate = runDate;
      item.addEventListener('click', () => loadRun(runDate));
      runList.appendChild(item);
    }
  } catch (err) {
    runList.textContent = '';
    runList.appendChild(el('span', 'text-muted', 'Error: ' + err.message));
  }
}

// ---------------------------------------------------------------------------
// Load a specific run
// ---------------------------------------------------------------------------
async function loadRun(date) {
  state.runDate = date;
  state.decisions = {};

  // Update active state
  document.querySelectorAll('.run-item').forEach((node) => {
    node.classList.toggle('active', node.dataset.runDate === date);
  });

  try {
    const [proposalData, runData] = await Promise.all([
      fetchJson('/api/ccee/runs/' + date + '/proposals'),
      fetchJson('/api/ccee/runs/' + date),
    ]);
    state.proposals = proposalData.proposals || [];

    // Restore deferred state from localStorage
    const deferredIds = getDeferredIds(date);
    for (const id of deferredIds) {
      state.decisions[id] = 'deferred';
    }

    renderTopbarMeta(date);
    updateSidebarStats(runData);
    renderProposals();
    updateBottomBar();
    updateDeferredSidebar();
  } catch (err) {
    showError('Failed to load run ' + date + ': ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Load latest run
// ---------------------------------------------------------------------------
async function loadLatest() {
  try {
    const latest = await fetchJson('/api/ccee/latest');
    if (latest && latest.runDate) {
      await loadRun(latest.runDate);
    } else {
      showEmptyState();
    }
  } catch {
    showEmptyState();
  }
}

// ---------------------------------------------------------------------------
// Render topbar meta (using safe DOM)
// ---------------------------------------------------------------------------
function renderTopbarMeta(date) {
  runMeta.textContent = '';
  runMeta.appendChild(badge('cyan', 'Run: ' + date));
  const count = state.proposals.length;
  runMeta.appendChild(badge('neutral', count + ' proposal' + (count !== 1 ? 's' : '')));
}

// ---------------------------------------------------------------------------
// Sidebar stats
// ---------------------------------------------------------------------------
function updateSidebarStats(runData) {
  const p = state.proposals;
  const highRisk = p.filter((x) => x.risk === 'medium' || x.risk === 'high' || x.risk === 'breaking').length;
  if (vals.proposals) vals.proposals.textContent = String(p.length);
  if (vals.highRisk) vals.highRisk.textContent = String(highRisk);

  if (vals.passed) {
    const passed = runData?.testsPassed;
    const total = runData?.testsTotal;
    if (passed != null && total != null) {
      vals.passed.textContent = passed + '/' + total;
    } else if (runData?.proposalsPassed != null) {
      vals.passed.textContent = String(runData.proposalsPassed);
    } else {
      vals.passed.textContent = '—';
    }
  }

  if (vals.sources) vals.sources.textContent = runData?.sourcesScanned != null ? String(runData.sourcesScanned) : '—';
  if (vals.repos) vals.repos.textContent = runData?.reposTracked != null ? String(runData.reposTracked) : '—';
  if (vals.videos) vals.videos.textContent = runData?.videosAnalysed != null ? String(runData.videosAnalysed) : '—';
}

// ---------------------------------------------------------------------------
// Render proposals (active) — excludes applied/rejected which go to archives
// ---------------------------------------------------------------------------
function renderProposals() {
  if (!state.proposals.length) {
    showEmptyState();
    return;
  }

  emptyState.classList.add('hidden');
  proposalsContainer.classList.remove('hidden');
  proposalsContainer.textContent = '';

  // Only render proposals not yet archived
  const active = state.proposals.filter((p) => effectiveStatus(p) === 'pending');

  if (active.length > 0) {
    const PRIORITY_ORDER = ['P0_critical', 'P1_high', 'P2_medium', 'P3_low'];
    const PRIORITY_LABELS = {
      P0_critical: 'P0 — Critical',
      P1_high: 'P1 — High Priority',
      P2_medium: 'P2 — Medium',
      P3_low: 'P3 — Low',
    };

    const groups = {};
    for (const p of active) {
      const key = p.priority || 'P3_low';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    for (const priority of PRIORITY_ORDER) {
      const group = groups[priority];
      if (!group || group.length === 0) continue;

      const section = el('section', 'priority-group');
      section.dataset.priority = priority;

      const header = el('div', 'priority-group__header');
      header.appendChild(el('span', 'priority-group__label', PRIORITY_LABELS[priority]));
      header.appendChild(el('span', 'priority-group__count', group.length + ' proposal' + (group.length !== 1 ? 's' : '')));
      section.appendChild(header);

      for (const proposal of group) {
        section.appendChild(buildProposalCard(proposal));
      }

      proposalsContainer.appendChild(section);
    }

    // Deferred group at the bottom of the active list
    const deferredProposals = active.filter((p) => state.decisions[p.id] === 'deferred');
    if (deferredProposals.length > 0) {
      const deferredSection = document.createElement('details');
      deferredSection.className = 'deferred-group';
      const deferredSummary = document.createElement('summary');
      deferredSummary.className = 'deferred-group__header';
      deferredSummary.textContent = 'Deferred (' + deferredProposals.length + ')';
      deferredSection.appendChild(deferredSummary);

      for (const proposal of deferredProposals) {
        const card = buildProposalCard(proposal);
        card.classList.add('deferred');
        const badgesEl = card.querySelector('.proposal-card__badges');
        badgesEl.appendChild(badge('deferred', 'Deferred'));
        deferredSection.appendChild(card);
      }

      proposalsContainer.appendChild(deferredSection);
    }
  } else {
    // All proposals decided — show a note above the archives
    proposalsContainer.appendChild(
      el('div', 'all-decided-note', 'All proposals have been accepted or rejected.')
    );
  }

  // Archive sections always rendered below active proposals
  renderArchiveSections();
}

// ---------------------------------------------------------------------------
// Archive sections — Applied Updates + Rejected Proposals
// ---------------------------------------------------------------------------
function renderArchiveSections() {
  // Remove any existing archive sections first (safe to call repeatedly)
  proposalsContainer.querySelectorAll('.archive-section').forEach((node) => node.remove());

  const applied = state.proposals.filter((p) => effectiveStatus(p) === 'applied');
  const rejected = state.proposals.filter((p) => effectiveStatus(p) === 'rejected');

  proposalsContainer.appendChild(buildArchiveSection(applied, 'applied'));
  proposalsContainer.appendChild(buildArchiveSection(rejected, 'rejected'));
}

function buildArchiveSection(proposals, type) {
  const isApplied = type === 'applied';
  const title = isApplied ? 'Applied Updates' : 'Rejected Proposals';
  const hasEntries = proposals.length > 0;

  const section = document.createElement('details');
  section.className = 'archive-section archive-section--' + type;
  section.id = 'archive-' + type;
  // Collapsed when it has entries, expanded when empty
  if (!hasEntries) section.open = true;

  const summary = document.createElement('summary');
  summary.className = 'archive-section__header';

  const chevron = el('span', 'archive-section__chevron', '');
  summary.appendChild(chevron);
  summary.appendChild(el('span', 'archive-section__title', title));
  summary.appendChild(el('span', 'archive-section__count', '(' + proposals.length + ')'));
  section.appendChild(summary);

  const cardsDiv = el('div', 'archive-section__cards');

  if (!hasEntries) {
    cardsDiv.appendChild(el('p', 'archive-section__placeholder',
      isApplied ? 'No changes applied yet.' : 'No proposals rejected yet.'));
  } else {
    for (const proposal of proposals) {
      cardsDiv.appendChild(buildArchiveCard(proposal, type));
    }
  }

  section.appendChild(cardsDiv);
  return section;
}

function buildArchiveCard(proposal, type) {
  const isApplied = type === 'applied';
  const card = el('article', 'proposal-card proposal-card--archive proposal-card--' + type);
  card.dataset.proposalId = proposal.id;

  const header = el('div', 'proposal-card__header');

  const badgesEl = el('div', 'proposal-card__badges');
  badgesEl.appendChild(badge(proposal.priority || 'P3_low',
    (proposal.priority || 'P3_low').replace('_', ' ')));
  badgesEl.appendChild(badge('neutral', proposal.scope || 'global'));

  const stamp = el('span', 'archive-stamp archive-stamp--' + type,
    isApplied ? '✓ Applied' : '✗ Rejected');
  if (isApplied && proposal.appliedAt) {
    stamp.title = new Date(proposal.appliedAt).toLocaleString();
  }
  badgesEl.appendChild(stamp);

  header.appendChild(badgesEl);

  // Rejected cards get an Undo button
  if (!isApplied) {
    const controls = el('div', 'proposal-card__controls');
    const undoBtn = el('button', 'btn btn--ghost btn--sm', 'Undo');
    undoBtn.title = 'Move back to active proposals';
    undoBtn.addEventListener('click', () => {
      delete state.decisions[proposal.id];
      // Also clear server-side rejected status in local state
      const p = state.proposals.find((x) => x.id === proposal.id);
      if (p) p.status = 'pending';
      renderProposals();
      updateBottomBar();
    });
    controls.appendChild(undoBtn);
    header.appendChild(controls);
  }

  card.appendChild(header);
  card.appendChild(el('h3', 'proposal-card__title', proposal.title || ''));

  if (isApplied && proposal.appliedAt) {
    card.appendChild(el('p', 'proposal-card__impact',
      'Applied ' + new Date(proposal.appliedAt).toLocaleString()));
  } else if (!isApplied && proposal.estimatedImpact) {
    card.appendChild(el('p', 'proposal-card__impact', proposal.estimatedImpact));
  }

  return card;
}

// ---------------------------------------------------------------------------
// Build a proposal card (safe DOM only)
// ---------------------------------------------------------------------------
function buildProposalCard(proposal) {
  const template = document.getElementById('proposal-card-template');
  const card = template.content.cloneNode(true).querySelector('.proposal-card');

  card.dataset.proposalId = proposal.id;
  card.dataset.category = proposal.category || '';

  const decision = state.decisions[proposal.id];
  if (decision) card.classList.add(decision);

  // Title
  card.querySelector('.proposal-card__title').textContent = proposal.title || '';
  card.querySelector('.proposal-card__impact').textContent = proposal.estimatedImpact || '';

  // Badges — safe construction
  const badgesEl = card.querySelector('.proposal-card__badges');
  badgesEl.textContent = '';
  badgesEl.appendChild(badge(proposal.priority, (proposal.priority || '').replace('_', ' ')));
  badgesEl.appendChild(badge('risk-' + (proposal.risk || 'low'), (proposal.risk || 'low') + ' risk'));
  badgesEl.appendChild(badge('violet', (proposal.category || '').replace(/_/g, ' ')));
  badgesEl.appendChild(badge('neutral', proposal.scope || 'global'));
  if (proposal.breakingChanges) {
    badgesEl.appendChild(badge('red', 'breaking'));
  }

  // Test status badge (clickable to expand test details)
  const testStatus = proposal.testStatus || 'untested';
  const risk = proposal.risk || 'low';
  let testBadgeClass, testBadgeText;

  if (testStatus === 'pass') {
    if (risk === 'low') {
      testBadgeClass = 'test-tier1';
      testBadgeText = 'Tier 1 Only';
    } else {
      testBadgeClass = 'test-pass';
      testBadgeText = 'Tested ✓';
    }
  } else if (testStatus === 'fail') {
    testBadgeClass = 'test-fail';
    testBadgeText = 'Test Failed';
  } else if (testStatus === 'timeout') {
    testBadgeClass = 'test-timeout';
    testBadgeText = 'Timed Out';
  } else {
    testBadgeClass = 'test-untested';
    testBadgeText = 'Untested';
  }

  const testBadge = badge(testBadgeClass, testBadgeText);
  testBadge.addEventListener('click', () => {
    const details = card.querySelector('.proposal-card__test-details');
    if (details) details.open = !details.open;
  });
  badgesEl.appendChild(testBadge);

  // Populate test details panel
  const testDetailsEl = card.querySelector('.proposal-card__test-details');
  const testBodyEl = card.querySelector('.proposal-card__test-body');
  if (testBodyEl && (proposal.testTier1 || proposal.testTier2 || proposal.testTier3)) {
    testDetailsEl.classList.remove('hidden');
    testBodyEl.textContent = '';

    const tiers = [
      { name: 'Tier 1 — Static Analysis', data: proposal.testTier1 },
      { name: 'Tier 2 — Dry Run', data: proposal.testTier2 },
      { name: 'Tier 3 — Smoke Test', data: proposal.testTier3 },
    ];

    for (const tier of tiers) {
      if (!tier.data) continue;

      const tierDiv = el('div', 'test-tier');
      const header = el('div', 'test-tier__header');
      const statusCls = tier.data.status === 'pass' ? 'test-tier__pass'
        : tier.data.status === 'fail' ? 'test-tier__fail' : 'test-tier__skip';
      const statusMark = tier.data.status === 'pass' ? '✓' : tier.data.status === 'fail' ? '✗' : '—';
      header.textContent = statusMark + ' ' + tier.name;
      header.classList.add(statusCls);
      tierDiv.appendChild(header);

      if (tier.data.checks && tier.data.checks.length > 0) {
        const checks = el('div', 'test-tier__checks', 'Passed: ' + tier.data.checks.join(', '));
        tierDiv.appendChild(checks);
      }

      if (tier.data.failures && tier.data.failures.length > 0) {
        for (const failure of tier.data.failures) {
          const errEl = el('div', 'test-tier__error', failure);
          tierDiv.appendChild(errEl);
        }
      }

      if (tier.data.error) {
        const errEl = el('div', 'test-tier__error', tier.data.error);
        tierDiv.appendChild(errEl);
      }

      testBodyEl.appendChild(tierDiv);
    }
  }

  // Details
  const diffEl = card.querySelector('.proposal-card__diff');
  if (proposal.proposedChanges && proposal.proposedChanges.length > 0) {
    diffEl.textContent = 'Changes:\n' +
      proposal.proposedChanges.map((c) => '  ' + c.action + ': ' + c.path).join('\n');
  }

  const testingEl = card.querySelector('.proposal-card__testing');
  if (proposal.testing) {
    testingEl.textContent =
      'Validation: ' + (proposal.testing.validationCommand || '') +
      '\nExpected: ' + (proposal.testing.expectedOutcome || '');
  }

  const rollbackEl = card.querySelector('.proposal-card__rollback');
  if (proposal.rollbackProcedure) {
    const cmds = proposal.rollbackProcedure.restoreCommands || [];
    rollbackEl.textContent = 'Rollback:\n' + cmds.join('\n');
  }

  // Test button (prepended to controls before accept/reject)
  const btnTest = el('button', 'btn-icon btn-icon--test', '▶');
  btnTest.title = 'Run Test';
  btnTest.dataset.proposalId = proposal.id;
  if (proposal.testStatus === 'blocked') {
    btnTest.disabled = true;
  } else {
    btnTest.addEventListener('click', () => testProposal(card, proposal));
  }
  card.querySelector('.proposal-card__controls').prepend(btnTest);

  // Heal panel (populated by testProposal when results arrive)
  const healPanel = el('div', 'proposal-card__heal-panel hidden');
  const testDetails = card.querySelector('.proposal-card__test-details');
  testDetails.parentNode.insertBefore(healPanel, testDetails.nextSibling);

  // Controls
  card.querySelector('.btn-icon--accept').addEventListener('click', () => {
    toggleDecision(card, proposal.id, 'accepted');
  });
  card.querySelector('.btn-icon--reject').addEventListener('click', () => {
    toggleDecision(card, proposal.id, 'rejected');
  });

  return card;
}

// ---------------------------------------------------------------------------
// Test & Heal
// ---------------------------------------------------------------------------
async function testProposal(card, proposal) {
  if (!state.runDate) return;

  const btnTest = card.querySelector('.btn-icon--test');
  if (btnTest) {
    btnTest.disabled = true;
    btnTest.textContent = '…';
    btnTest.title = 'Testing…';
  }

  const badgesEl = card.querySelector('.proposal-card__badges');
  const oldTestBadge = badgesEl.querySelector('[class*="badge--test"]');
  if (oldTestBadge) oldTestBadge.remove();
  const spinnerBadge = badge('test-running', 'Testing…');
  badgesEl.appendChild(spinnerBadge);

  try {
    const { jobId } = await postJson(
      '/api/ccee/runs/' + state.runDate + '/proposals/' + proposal.id + '/test',
      {}
    );

    let attempts = 0;
    const MAX_ATTEMPTS = 60;
    while (attempts < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;

      const job = await fetchJson(
        '/api/ccee/runs/' + state.runDate + '/jobs/' + jobId
      );

      if (job.status === 'complete' || job.status === 'error') {
        const idx = state.proposals.findIndex((p) => p.id === proposal.id);
        if (idx !== -1) {
          state.proposals[idx] = {
            ...state.proposals[idx],
            testStatus: job.testResult?.overall ?? 'fail',
            testTier1: job.testResult?.tier1 ?? null,
            testTier2: job.testResult?.tier2 ?? null,
            testTier3: job.testResult?.tier3 ?? null,
            testRisk: job.testResult?.risk ?? proposal.risk,
          };
        }

        spinnerBadge.remove();
        const newStatus = job.testResult?.overall ?? 'error';
        const newBadgeClass = newStatus === 'pass' ? 'test-pass'
          : newStatus === 'fail' ? 'test-fail' : 'test-untested';
        const newBadgeText = newStatus === 'pass' ? 'Tested ✓'
          : newStatus === 'fail' ? 'Test Failed' : 'Error';
        const newBadge = badge(newBadgeClass, newBadgeText);
        newBadge.addEventListener('click', () => {
          const details = card.querySelector('.proposal-card__test-details');
          if (details) details.open = !details.open;
        });
        badgesEl.appendChild(newBadge);

        if (job.testResult) {
          updateTestDetailsPanel(card, job.testResult);
        }

        if (job.healResult) {
          renderHealPanel(card, proposal, job.healResult, jobId);
        }

        if (btnTest) {
          btnTest.disabled = false;
          btnTest.textContent = '▶';
          btnTest.title = 'Re-run Test';
        }

        return;
      }
    }

    // Timeout — persist in state so badge survives re-renders in this session
    const tidx = state.proposals.findIndex((p) => p.id === proposal.id);
    if (tidx !== -1) { state.proposals[tidx] = { ...state.proposals[tidx], testStatus: 'timeout' }; }
    spinnerBadge.remove();
    badgesEl.appendChild(badge('test-timeout', 'Timed Out'));
    if (btnTest) {
      btnTest.disabled = false;
      btnTest.textContent = '▶';
      btnTest.title = 'Run Test';
    }
  } catch (err) {
    spinnerBadge.remove();
    badgesEl.appendChild(badge('test-fail', 'Error'));
    if (btnTest) {
      btnTest.disabled = false;
      btnTest.textContent = '▶';
      btnTest.title = 'Run Test';
    }
    console.error('testProposal failed:', err.message);
  }
}

function updateTestDetailsPanel(card, testResult) {
  const testDetailsEl = card.querySelector('.proposal-card__test-details');
  const testBodyEl = card.querySelector('.proposal-card__test-body');
  if (!testBodyEl) return;

  testDetailsEl.classList.remove('hidden');
  testBodyEl.textContent = '';

  const tiers = [
    { name: 'Tier 1 — Static Analysis', data: testResult.tier1 },
    { name: 'Tier 2 — Dry Run', data: testResult.tier2 },
    { name: 'Tier 3 — Smoke Test', data: testResult.tier3 },
  ];

  for (const tier of tiers) {
    if (!tier.data) continue;

    const tierDiv = el('div', 'test-tier');
    const header = el('div', 'test-tier__header');
    const statusCls = tier.data.status === 'pass' ? 'test-tier__pass'
      : tier.data.status === 'fail' ? 'test-tier__fail' : 'test-tier__skip';
    const statusMark = tier.data.status === 'pass' ? '✓' : tier.data.status === 'fail' ? '✗' : '—';
    header.textContent = statusMark + ' ' + tier.name;
    header.classList.add(statusCls);
    tierDiv.appendChild(header);

    if (tier.data.checks && tier.data.checks.length > 0) {
      tierDiv.appendChild(el('div', 'test-tier__checks', 'Passed: ' + tier.data.checks.join(', ')));
    }
    if (tier.data.failures && tier.data.failures.length > 0) {
      for (const failure of tier.data.failures) {
        tierDiv.appendChild(el('div', 'test-tier__error', failure));
      }
    }
    testBodyEl.appendChild(tierDiv);
  }

  testDetailsEl.open = true;
}

function renderHealPanel(card, proposal, healResult, jobId) {
  const healPanel = card.querySelector('.proposal-card__heal-panel');
  if (!healPanel) return;

  healPanel.textContent = '';
  healPanel.classList.remove('hidden', 'heal-panel--fix', 'heal-panel--blocked', 'heal-panel--replacement');

  if (healResult.verdict === 'blocked') {
    healPanel.classList.add('heal-panel--blocked');

    const header = el('div', 'heal-panel__header');
    header.appendChild(el('span', 'heal-panel__icon', '✗'));
    header.appendChild(el('span', 'heal-panel__title', 'Blocked'));
    healPanel.appendChild(header);

    const body = el('div', 'heal-panel__body');
    body.appendChild(el('p', 'heal-panel__reason', healResult.blockReason || 'This proposal cannot be applied to this system.'));
    healPanel.appendChild(body);

    const btnAccept = card.querySelector('.btn-icon--accept');
    if (btnAccept) {
      btnAccept.disabled = true;
      btnAccept.title = 'Blocked — cannot accept';
      btnAccept.classList.add('btn-icon--blocked');
    }

  } else if (healResult.verdict === 'fixed') {
    healPanel.classList.add('heal-panel--fix');

    const header = el('div', 'heal-panel__header');
    header.appendChild(el('span', 'heal-panel__icon', '✎'));
    header.appendChild(el('span', 'heal-panel__title', 'Fix Available'));
    healPanel.appendChild(header);

    const body = el('div', 'heal-panel__body');
    body.appendChild(el('p', 'heal-panel__reason',
      'A corrected version has been generated: [' + (healResult.fixedProposal?.id || '') + ']'));
    if (healResult.fixReason) {
      body.appendChild(el('p', 'heal-panel__detail', 'Fix: ' + healResult.fixReason));
    }
    healPanel.appendChild(body);

    if (healResult.fixedProposal?.proposedChanges?.length > 0) {
      const details = document.createElement('details');
      details.className = 'heal-panel__changes';
      const summary = document.createElement('summary');
      summary.textContent = 'View corrected changes ▾';
      details.appendChild(summary);
      const pre = el('pre', 'heal-panel__diff',
        healResult.fixedProposal.proposedChanges
          .map((c) => c.action + ': ' + c.path)
          .join('\n')
      );
      details.appendChild(pre);
      healPanel.appendChild(details);
    }

    const actions = el('div', 'heal-panel__actions');

    const btnAcceptFix = el('button', 'btn btn--primary btn--sm', 'Accept Fix');
    btnAcceptFix.addEventListener('click', () => {
      if (healResult.fixedProposal) {
        const existing = state.proposals.find((p) => p.id === healResult.fixedProposal.id);
        if (!existing) {
          state.proposals.push(healResult.fixedProposal);
        }
        state.decisions[healResult.fixedProposal.id] = 'accepted';
        state.decisions[proposal.id] = 'rejected';
        renderProposals();
        updateBottomBar();
      }
    });

    const btnDismiss = el('button', 'btn btn--ghost btn--sm', 'Dismiss');
    btnDismiss.addEventListener('click', () => {
      healPanel.classList.add('hidden');
    });

    actions.appendChild(btnAcceptFix);
    actions.appendChild(btnDismiss);
    healPanel.appendChild(actions);

  } else if (healResult.verdict === 'replacement') {
    healPanel.classList.add('heal-panel--replacement');

    const header = el('div', 'heal-panel__header');
    header.appendChild(el('span', 'heal-panel__icon', '↑'));
    header.appendChild(el('span', 'heal-panel__title', 'Replacement Option'));
    healPanel.appendChild(header);

    const body = el('div', 'heal-panel__body');
    if (healResult.existingFeatureName) {
      body.appendChild(el('p', 'heal-panel__reason',
        'This proposal conflicts with: ' + healResult.existingFeatureName));
    }
    if (healResult.superiorityReason) {
      body.appendChild(el('p', 'heal-panel__detail',
        'The new feature is superior because: ' + healResult.superiorityReason));
    }
    if (healResult.capabilityDelta) {
      body.appendChild(el('p', 'heal-panel__detail',
        'Capability gained: ' + healResult.capabilityDelta));
    }
    healPanel.appendChild(body);

    if (healResult.replacementProposal?.proposedChanges?.length > 0) {
      const details = document.createElement('details');
      details.className = 'heal-panel__changes';
      const summary = document.createElement('summary');
      summary.textContent = 'View replacement changes ▾';
      details.appendChild(summary);
      const pre = el('pre', 'heal-panel__diff',
        healResult.replacementProposal.proposedChanges
          .map((c) => c.action + ': ' + c.path)
          .join('\n')
      );
      details.appendChild(pre);
      healPanel.appendChild(details);
    }

    const actions = el('div', 'heal-panel__actions');

    const btnAcceptReplacement = el('button', 'btn btn--primary btn--sm', 'Accept Replacement');
    btnAcceptReplacement.addEventListener('click', () => {
      if (healResult.replacementProposal) {
        const existing = state.proposals.find((p) => p.id === healResult.replacementProposal.id);
        if (!existing) {
          state.proposals.push(healResult.replacementProposal);
        }
        state.decisions[healResult.replacementProposal.id] = 'accepted';
        state.decisions[proposal.id] = 'rejected';
        renderProposals();
        updateBottomBar();
      }
    });

    const btnKeepExisting = el('button', 'btn btn--ghost btn--sm', 'Keep Existing');
    btnKeepExisting.addEventListener('click', () => {
      state.decisions[proposal.id] = 'rejected';
      const cardEl = document.querySelector('[data-proposal-id="' + proposal.id + '"]');
      if (cardEl) {
        cardEl.classList.remove('accepted');
        cardEl.classList.add('rejected');
      }
      updateBottomBar();
      healPanel.classList.add('hidden');
    });

    const btnDismissR = el('button', 'btn btn--ghost btn--sm', 'Dismiss');
    btnDismissR.addEventListener('click', () => {
      healPanel.classList.add('hidden');
    });

    actions.appendChild(btnAcceptReplacement);
    actions.appendChild(btnKeepExisting);
    actions.appendChild(btnDismissR);
    healPanel.appendChild(actions);
  }

  healPanel.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Decision toggling
// ---------------------------------------------------------------------------
function updateRejectedToggle(card) {
  const group = card.closest('.priority-group');
  if (!group) return;

  const allCards = Array.from(group.querySelectorAll('.proposal-card'));
  const hiddenCount = allCards.filter((c) => c.classList.contains('hidden')).length;
  const groupHeader = group.querySelector('.priority-group__header');

  // Get or create toggle element
  let toggle = group.querySelector('.rejected-toggle');
  if (!toggle) {
    toggle = el('div', 'rejected-toggle');
    groupHeader.insertAdjacentElement('afterend', toggle);
  }

  if (hiddenCount === 0) {
    toggle.classList.add('hidden');
  } else {
    toggle.classList.remove('hidden');
    toggle.textContent = '';
    const link = el('span', 'rejected-toggle__link', '(' + hiddenCount + ' rejected \u2014 show)');
    let showing = false;
    link.addEventListener('click', () => {
      showing = !showing;
      allCards.forEach((c) => {
        if (c.classList.contains('hidden') || c.classList.contains('proposal-card--exiting')) {
          if (showing) {
            c.classList.remove('hidden', 'proposal-card--exiting');
          }
        }
      });
      link.textContent = showing
        ? '(' + hiddenCount + ' rejected \u2014 hide)'
        : '(' + hiddenCount + ' rejected \u2014 show)';
    });
    toggle.appendChild(link);
  }

  // Hide group header if all cards are hidden
  const allHidden = allCards.every((c) => c.classList.contains('hidden'));
  groupHeader.classList.toggle('hidden', allHidden);
  toggle.classList.toggle('hidden', hiddenCount === 0);
}

function toggleDecision(card, proposalId, decision) {
  const current = state.decisions[proposalId];

  if (decision === 'accepted') {
    // Toggle accept on/off
    if (current === 'accepted') {
      delete state.decisions[proposalId];
      card.classList.remove('accepted');
    } else {
      state.decisions[proposalId] = 'accepted';
      card.classList.remove('rejected');
      card.classList.add('accepted');
    }
    updateBottomBar();
    return;
  }

  if (decision === 'rejected') {
    // Animate card out of active list, then move to rejected archive
    state.decisions[proposalId] = 'rejected';
    card.classList.remove('accepted');
    card.classList.add('rejected', 'proposal-card--exiting');

    // Optimistically POST to server (fire-and-forget)
    if (state.runDate) {
      postJson('/api/ccee/runs/' + state.runDate + '/reject', { proposalIds: [proposalId] })
        .then((result) => {
          // Sync server-returned status into state
          if (Array.isArray(result.proposals)) {
            for (const rp of result.proposals) {
              const p = state.proposals.find((x) => x.id === rp.id);
              if (p) { p.status = rp.status; p.rejectedAt = rp.rejectedAt; }
            }
          }
        })
        .catch((err) => console.error('Failed to persist reject:', err.message));
    }

    setTimeout(() => {
      card.classList.add('hidden');
      updateRejectedToggle(card);
      renderArchiveSections();
    }, 300);
    updateBottomBar();
  }
}

function updateBottomBar() {
  const accepted = Object.values(state.decisions).filter((d) => d === 'accepted').length;
  const deferred = Object.values(state.decisions).filter((d) => d === 'deferred').length;
  let label = accepted + ' proposal' + (accepted !== 1 ? 's' : '') + ' selected';
  if (deferred > 0) {
    label += ', ' + deferred + ' deferred';
  }
  selectedCountEl.textContent = label;
  btnApply.disabled = accepted === 0;
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------
function showEmptyState() {
  emptyState.classList.remove('hidden');
  proposalsContainer.classList.add('hidden');
  runMeta.textContent = '';
  runMeta.appendChild(badge('neutral', 'No run loaded'));
}

function showError(message) {
  proposalsContainer.textContent = '';
  const wrapper = el('div', 'empty-state');
  const msg = el('p', null, message);
  msg.style.color = 'var(--red)';
  wrapper.appendChild(msg);
  proposalsContainer.appendChild(wrapper);
  proposalsContainer.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------
function applyBulkDecision(filter, decision) {
  for (const proposal of state.proposals) {
    if (filter(proposal)) {
      state.decisions[proposal.id] = decision;
    }
  }
  renderProposals();
  updateBottomBar();
}

$('btn-accept-p0p1').addEventListener('click', () => {
  applyBulkDecision(
    (p) => p.priority === 'P0_critical' || p.priority === 'P1_high',
    'accepted'
  );
});

$('btn-accept-tested').addEventListener('click', () => {
  applyBulkDecision(
    (p) => p.risk !== 'breaking' && p.risk !== 'high',
    'accepted'
  );
});

$('btn-reject-removals').addEventListener('click', () => {
  applyBulkDecision(
    (p) => p.category === 'legacy_removal' ||
           p.category === 'skill_remove' ||
           p.category === 'hook_remove',
    'rejected'
  );
});

$('btn-reject-high-risk').addEventListener('click', () => {
  const targets = state.proposals.filter(
    (p) => (p.risk === 'high' || p.risk === 'breaking') && effectiveStatus(p) === 'pending'
  );
  if (targets.length === 0) return;

  for (const p of targets) {
    state.decisions[p.id] = 'rejected';
  }

  // Optimistically POST to server then sync returned statuses
  if (state.runDate) {
    const ids = targets.map((p) => p.id);
    postJson('/api/ccee/runs/' + state.runDate + '/reject', { proposalIds: ids })
      .then((result) => {
        if (Array.isArray(result.proposals)) {
          for (const rp of result.proposals) {
            const p = state.proposals.find((x) => x.id === rp.id);
            if (p) { p.status = rp.status; p.rejectedAt = rp.rejectedAt; }
          }
        }
      })
      .catch((err) => console.error('Bulk reject persist failed:', err.message));
  }

  renderProposals();
  updateBottomBar();
});

$('btn-test-all').addEventListener('click', async () => {
  const untested = state.proposals.filter((p) => p.testStatus === 'untested' || !p.testStatus);
  if (untested.length === 0) {
    alert('No untested proposals.');
    return;
  }

  const btn = $('btn-test-all');
  btn.disabled = true;

  for (let i = 0; i < untested.length; i++) {
    btn.textContent = 'Testing ' + (i + 1) + ' of ' + untested.length + '…';
    const proposal = untested[i];
    const card = document.querySelector('[data-proposal-id="' + proposal.id + '"]');
    if (card) {
      await testProposal(card, proposal);
    }
  }

  btn.disabled = false;
  btn.textContent = 'Test All Untested';
});

// ---------------------------------------------------------------------------
// Apply selected — with confirmation modal
// ---------------------------------------------------------------------------
function escText(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

btnApply.addEventListener('click', () => {
  if (!state.runDate) return;

  const acceptedEntries = Object.entries(state.decisions).filter(([, d]) => d === 'accepted');
  if (acceptedEntries.length === 0) return;

  const acceptedIds = acceptedEntries.map(([id]) => id);
  const acceptedProposals = state.proposals.filter((p) => acceptedIds.includes(p.id));

  const failedTests = acceptedProposals.filter((p) => p.testStatus === 'fail');
  const untestedProposals = acceptedProposals.filter((p) => p.testStatus === 'untested');

  const modal = $('apply-modal');
  const modalHeader = $('modal-header');
  const modalTitle = $('modal-title');
  const modalIcon = $('modal-icon');
  const modalBody = $('modal-body');
  const modalConfirm = $('modal-confirm');

  modal.classList.remove('modal--red', 'modal--amber', 'modal--green');

  if (failedTests.length > 0) {
    modal.classList.add('modal--red');
    modalIcon.textContent = '✗';
    modalTitle.textContent = 'Warning: Test Failures';
    modalBody.textContent = '';
    const intro = el('p', null, failedTests.length + ' accepted proposal(s) failed testing:');
    modalBody.appendChild(intro);
    const ul = el('ul', null);
    for (const p of failedTests) {
      const reason = (p.testTier1?.failures?.[0]) ?? (p.testTier2?.failures?.[0]) ?? 'Unknown failure';
      const li = el('li', null);
      const strong = el('strong', null, p.title || '');
      li.appendChild(strong);
      li.appendChild(document.createTextNode(': ' + reason));
      ul.appendChild(li);
    }
    modalBody.appendChild(ul);
    modalConfirm.textContent = 'Apply Anyway';
    modalConfirm.className = 'btn btn--danger';
  } else if (untestedProposals.length > 0) {
    modal.classList.add('modal--amber');
    modalIcon.textContent = '⚠';
    modalTitle.textContent = 'Untested Proposals';
    modalBody.textContent = untestedProposals.length + ' proposal(s) were not tested. Apply with caution?';
    modalConfirm.textContent = 'Apply with Caution';
    modalConfirm.className = 'btn btn--primary';
  } else {
    modal.classList.add('modal--green');
    modalIcon.textContent = '✓';
    modalTitle.textContent = 'Apply ' + acceptedIds.length + ' Changes?';
    modalBody.textContent = 'All selected proposals passed testing.';
    modalConfirm.textContent = 'Apply ' + acceptedIds.length + ' Changes';
    modalConfirm.className = 'btn btn--primary';
  }

  modal.classList.remove('hidden');
});

$('modal-cancel').addEventListener('click', () => {
  $('apply-modal').classList.add('hidden');
});

$('modal-confirm').addEventListener('click', async () => {
  await doApply();
});

async function doApply() {
  const acceptedIds = Object.entries(state.decisions)
    .filter(([, d]) => d === 'accepted')
    .map(([id]) => id);
  const rejectedIds = Object.entries(state.decisions)
    .filter(([, d]) => d === 'rejected')
    .map(([id]) => id);

  // Switch modal to progress mode
  const modalEl = $('apply-modal').querySelector('.modal');
  const modalActions = modalEl.querySelector('.modal__actions');
  modalActions.classList.add('hidden');

  const progressWrap = el('div', 'modal__progress');
  const progressBar = el('div', 'modal__progress-bar');
  progressWrap.appendChild(progressBar);
  const progressLabel = el('p', 'modal__progress-label',
    'Applying ' + acceptedIds.length + ' change' + (acceptedIds.length !== 1 ? 's' : '') + '…');

  modalEl.appendChild(progressWrap);
  modalEl.appendChild(progressLabel);

  btnApply.disabled = true;

  // Start POST immediately, track result
  let postResult = null;

  const postPromise = (async () => {
    try {
      let applyResponse = null;
      if (acceptedIds.length > 0) {
        applyResponse = await postJson('/api/ccee/runs/' + state.runDate + '/apply', { proposalIds: acceptedIds });
      }
      if (rejectedIds.length > 0) {
        await postJson('/api/ccee/runs/' + state.runDate + '/reject', { proposalIds: rejectedIds });
      }
      postResult = { ok: true, proposals: applyResponse?.proposals };
    } catch (err) {
      postResult = { ok: false, message: err.message };
    }
  })();

  function showResult() {
    progressWrap.remove();
    progressLabel.remove();
    modalActions.classList.remove('hidden');
    modalActions.textContent = '';

    if (postResult.ok) {
      const msg = el('p', 'modal__progress-label',
        '\u2713 ' + acceptedIds.length + ' change' + (acceptedIds.length !== 1 ? 's' : '') + ' queued for apply.');
      msg.style.color = 'var(--green)';
      const doneBtn = el('button', 'btn btn--primary', 'Done');
      doneBtn.addEventListener('click', () => {
        $('apply-modal').classList.add('hidden');
        // Restore modal actions for next time
        modalActions.textContent = '';
        const cancelBtn = $('modal-cancel');
        const confirmBtn = $('modal-confirm');
        modalActions.appendChild(cancelBtn);
        modalActions.appendChild(confirmBtn);
        modalActions.classList.remove('hidden');
      });
      modalActions.appendChild(msg);
      modalActions.appendChild(doneBtn);
      // Sync server-returned statuses (applied) into local state
      if (Array.isArray(postResult.proposals)) {
        for (const rp of postResult.proposals) {
          const p = state.proposals.find((x) => x.id === rp.id);
          if (p) { p.status = rp.status; p.appliedAt = rp.appliedAt; }
        }
      }
      // Clear in-session accepted decisions (now persisted as applied)
      for (const id of acceptedIds) { delete state.decisions[id]; }
      renderProposals();
      updateBottomBar();
    } else {
      const msg = el('p', 'modal__progress-label',
        '\u2717 Apply failed: ' + (postResult.message || 'unknown error'));
      msg.style.color = 'var(--red)';
      const dismissBtn = el('button', 'btn btn--ghost', 'Dismiss');
      dismissBtn.addEventListener('click', () => {
        $('apply-modal').classList.add('hidden');
        // Restore modal actions for next time
        modalActions.textContent = '';
        const cancelBtn = $('modal-cancel');
        const confirmBtn = $('modal-confirm');
        modalActions.appendChild(cancelBtn);
        modalActions.appendChild(confirmBtn);
        modalActions.classList.remove('hidden');
      });
      modalActions.appendChild(msg);
      modalActions.appendChild(dismissBtn);
    }
    btnApply.disabled = false;
    btnApply.textContent = 'Apply Selected';
  }

  // Trigger animation after two rAFs so browser paints 0% state first
  requestAnimationFrame(() => requestAnimationFrame(() => {
    progressBar.style.width = '100%';
  }));

  progressBar.addEventListener('transitionend', async () => {
    await postPromise; // wait for POST if still running
    showResult();
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Export report
// ---------------------------------------------------------------------------
btnExport.addEventListener('click', () => {
  const report = {
    runDate: state.runDate,
    exportedAt: new Date().toISOString(),
    decisions: state.decisions,
    totalProposals: state.proposals.length,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ccee-review-' + (state.runDate || 'export') + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------
async function triggerRun() {
  try {
    await postJson('/api/ccee/trigger', {});
    alert('Pipeline run triggered. Check server logs for progress.');
  } catch (err) {
    alert('Trigger failed: ' + err.message);
  }
}

btnTrigger.addEventListener('click', triggerRun);
if (btnTriggerEmpty) btnTriggerEmpty.addEventListener('click', triggerRun);

// ---------------------------------------------------------------------------
// Defer
// ---------------------------------------------------------------------------
function updateDeferredSidebar() {
  const deferredList = $('deferred-list');
  if (!deferredList) return;

  // Scan localStorage for any run dates with deferred proposals
  const deferredRuns = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ccee-deferred-')) {
        const runDate = key.replace('ccee-deferred-', '');
        const ids = getDeferredIds(runDate);
        if (ids.length > 0) {
          deferredRuns.push({ runDate, count: ids.length });
        }
      }
    }
  } catch {}

  deferredList.textContent = '';
  if (deferredRuns.length === 0) {
    deferredList.appendChild(el('span', 'text-muted', 'None'));
    return;
  }

  deferredRuns.sort((a, b) => b.runDate.localeCompare(a.runDate));
  for (const { runDate, count } of deferredRuns) {
    const item = el('div', 'run-item deferred-run-item', runDate + ' (' + count + ')');
    item.dataset.runDate = runDate;
    item.addEventListener('click', () => loadRun(runDate));
    deferredList.appendChild(item);
  }
}

btnDefer.addEventListener('click', () => {
  if (!state.runDate) return;

  const toDefer = Object.entries(state.decisions)
    .filter(([, d]) => d === 'accepted')
    .map(([id]) => id);

  if (toDefer.length === 0) {
    alert('Select proposals to defer first.');
    return;
  }

  // Mark as deferred in state
  for (const id of toDefer) {
    state.decisions[id] = 'deferred';
  }

  // Persist to localStorage
  const existing = getDeferredIds(state.runDate);
  const merged = Array.from(new Set([...existing, ...toDefer]));
  saveDeferredIds(state.runDate, merged);

  renderProposals();
  updateBottomBar();
  updateDeferredSidebar();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  await loadRunsList();
  updateDeferredSidebar();

  // Route: /ccee/review/:date
  const match = window.location.pathname.match(/\/ccee\/review\/(.+)/);
  if (match && match[1]) {
    await loadRun(match[1]);
  } else {
    await loadLatest();
  }
})();
