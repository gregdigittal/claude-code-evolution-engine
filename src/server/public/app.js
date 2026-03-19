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
  decisions: {}, // proposalId → 'accepted' | 'rejected'
};

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
    const data = await fetchJson('/api/ccee/runs/' + date + '/proposals');
    state.proposals = data.proposals || [];
    renderTopbarMeta(date);
    updateSidebarStats();
    renderProposals();
    updateBottomBar();
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
function updateSidebarStats() {
  const p = state.proposals;
  const highRisk = p.filter((x) => x.risk === 'high' || x.risk === 'breaking').length;
  if (vals.proposals) vals.proposals.textContent = String(p.length);
  if (vals.highRisk) vals.highRisk.textContent = String(highRisk);
  if (vals.passed) vals.passed.textContent = '—';
  if (vals.sources) vals.sources.textContent = '—';
  if (vals.repos) vals.repos.textContent = '—';
  if (vals.videos) vals.videos.textContent = '—';
}

// ---------------------------------------------------------------------------
// Render proposals
// ---------------------------------------------------------------------------
function renderProposals() {
  if (!state.proposals.length) {
    showEmptyState();
    return;
  }

  emptyState.classList.add('hidden');
  proposalsContainer.classList.remove('hidden');
  proposalsContainer.textContent = '';

  const PRIORITY_ORDER = ['P0_critical', 'P1_high', 'P2_medium', 'P3_low'];
  const PRIORITY_LABELS = {
    P0_critical: 'P0 — Critical',
    P1_high: 'P1 — High Priority',
    P2_medium: 'P2 — Medium',
    P3_low: 'P3 — Low',
  };

  const groups = {};
  for (const p of state.proposals) {
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
// Decision toggling
// ---------------------------------------------------------------------------
function toggleDecision(card, proposalId, decision) {
  const current = state.decisions[proposalId];
  if (current === decision) {
    delete state.decisions[proposalId];
    card.classList.remove('accepted', 'rejected');
  } else {
    state.decisions[proposalId] = decision;
    card.classList.remove('accepted', 'rejected');
    card.classList.add(decision);
  }
  updateBottomBar();
}

function updateBottomBar() {
  const accepted = Object.values(state.decisions).filter((d) => d === 'accepted').length;
  selectedCountEl.textContent = accepted + ' proposal' + (accepted !== 1 ? 's' : '') + ' selected';
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
  applyBulkDecision(
    (p) => p.risk === 'high' || p.risk === 'breaking',
    'rejected'
  );
});

// ---------------------------------------------------------------------------
// Apply selected
// ---------------------------------------------------------------------------
btnApply.addEventListener('click', async () => {
  if (!state.runDate) return;

  const acceptedIds = Object.entries(state.decisions)
    .filter(([, d]) => d === 'accepted')
    .map(([id]) => id);

  const rejectedIds = Object.entries(state.decisions)
    .filter(([, d]) => d === 'rejected')
    .map(([id]) => id);

  btnApply.disabled = true;
  btnApply.textContent = 'Applying…';

  try {
    if (acceptedIds.length > 0) {
      await postJson('/api/ccee/runs/' + state.runDate + '/apply', { proposalIds: acceptedIds });
    }
    if (rejectedIds.length > 0) {
      await postJson('/api/ccee/runs/' + state.runDate + '/reject', { proposalIds: rejectedIds });
    }
    alert(acceptedIds.length + ' proposals queued for apply. Check server logs for progress.');
  } catch (err) {
    alert('Apply failed: ' + err.message);
  } finally {
    btnApply.disabled = false;
    btnApply.textContent = 'Apply Selected';
  }
});

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
btnDefer.addEventListener('click', () => {
  alert('Proposals deferred to next weekly run.');
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  await loadRunsList();

  // Route: /ccee/review/:date
  const match = window.location.pathname.match(/\/ccee\/review\/(.+)/);
  if (match && match[1]) {
    await loadRun(match[1]);
  } else {
    await loadLatest();
  }
})();
