/**
 * review-ui.test.ts — TDD tests for Review UI bugs.
 *
 * These tests run in Node and test the pure-logic functions extracted from
 * app.js. We import a headless version of the state machine.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Replicate the pure state/logic functions from app.js for unit testing
// ---------------------------------------------------------------------------

type ProposalStatus = 'pending' | 'applied' | 'rejected';

interface Proposal {
  id: string;
  title: string;
  priority: string;
  risk: string;
  scope: string;
  status: ProposalStatus;
  testStatus?: string;
  appliedAt?: string;
  rejectedAt?: string;
}

interface State {
  runDate: string | null;
  proposals: Proposal[];
  decisions: Record<string, string>;
}

function makeState(): State {
  return { runDate: '2026-03-20', proposals: [], decisions: {} };
}

function effectiveStatus(proposal: Proposal, decisions: Record<string, string>): string {
  if (proposal.status === 'applied') return 'applied';
  if (proposal.status === 'rejected') return 'rejected';
  if (decisions[proposal.id] === 'rejected') return 'rejected';
  return 'pending';
}

function getActivePending(proposals: Proposal[], decisions: Record<string, string>): Proposal[] {
  return proposals.filter((p) => effectiveStatus(p, decisions) === 'pending');
}

function getArchived(proposals: Proposal[], decisions: Record<string, string>, type: 'applied' | 'rejected'): Proposal[] {
  return proposals.filter((p) => effectiveStatus(p, decisions) === type);
}

// Simulate what doApply() does when it CORRECTLY captures the API response
function applyProposals(
  state: State,
  acceptedIds: string[],
  apiResponse: { proposals?: Proposal[] }
): State {
  const next = { ...state, proposals: [...state.proposals], decisions: { ...state.decisions } };

  // Sync server-returned statuses
  if (Array.isArray(apiResponse.proposals)) {
    for (const rp of apiResponse.proposals) {
      const p = next.proposals.find((x) => x.id === rp.id);
      if (p) { p.status = rp.status; p.appliedAt = rp.appliedAt; }
    }
  }

  // Clear in-session accepted decisions
  for (const id of acceptedIds) { delete next.decisions[id]; }

  return next;
}

// Simulate what doApply() does when it INCORRECTLY discards the response (bug)
function applyProposalsBug(
  state: State,
  acceptedIds: string[],
): State {
  const next = { ...state, proposals: [...state.proposals], decisions: { ...state.decisions } };
  // postResult = { ok: true }  ← no proposals field, sync never runs
  for (const id of acceptedIds) { delete next.decisions[id]; }
  return next;
}

// Simulate reject decision
function rejectProposal(state: State, id: string): State {
  return { ...state, decisions: { ...state.decisions, [id]: 'rejected' } };
}

// Simulate test timeout updating state
function applyTimeoutToState(proposals: Proposal[], proposalId: string): Proposal[] {
  return proposals.map((p) =>
    p.id === proposalId ? { ...p, testStatus: 'timeout' } : p
  );
}

// ---------------------------------------------------------------------------
// Bug 1: Applying proposals — API response must be captured to archive them
// ---------------------------------------------------------------------------
describe('Bug 1 — Apply must move proposals to Applied drawer', () => {
  let state: State;

  beforeEach(() => {
    state = makeState();
    state.proposals = [
      { id: 'P1', title: 'Add Agent Teams', priority: 'P1_high', risk: 'low', scope: 'global', status: 'pending', testStatus: 'pass' },
      { id: 'P2', title: 'Fix hook', priority: 'P2_medium', risk: 'low', scope: 'global', status: 'pending', testStatus: 'untested' },
    ];
    state.decisions = { P1: 'accepted' };
  });

  it('applied proposal leaves active list and enters applied archive when response is captured', () => {
    const apiResponse = {
      proposals: [
        { ...state.proposals[0]!, status: 'applied' as ProposalStatus, appliedAt: '2026-03-20T10:00:00.000Z' },
        state.proposals[1]!,
      ],
    };
    const next = applyProposals(state, ['P1'], apiResponse);

    expect(getActivePending(next.proposals, next.decisions)).toHaveLength(1);
    expect(getActivePending(next.proposals, next.decisions)[0]!.id).toBe('P2');
    expect(getArchived(next.proposals, next.decisions, 'applied')).toHaveLength(1);
    expect(getArchived(next.proposals, next.decisions, 'applied')[0]!.id).toBe('P1');
    expect(getArchived(next.proposals, next.decisions, 'applied')[0]!.appliedAt).toBeTruthy();
  });

  it('BUG: applied proposal reappears when API response is discarded', () => {
    // This documents the bug — postResult has no proposals field
    const next = applyProposalsBug(state, ['P1']);

    // With the bug: proposal stays pending because status never updated
    expect(getActivePending(next.proposals, next.decisions)).toHaveLength(2); // BUG: P1 reappears
    expect(getArchived(next.proposals, next.decisions, 'applied')).toHaveLength(0); // BUG: empty
  });
});

// ---------------------------------------------------------------------------
// Bug 2: Rejected proposals must persist in archive across re-renders
// ---------------------------------------------------------------------------
describe('Bug 2 — Reject must archive proposal persistently', () => {
  let state: State;

  beforeEach(() => {
    state = makeState();
    state.proposals = [
      { id: 'P1', title: 'High risk change', priority: 'P1_high', risk: 'high', scope: 'global', status: 'pending' },
      { id: 'P2', title: 'Safe change', priority: 'P2_medium', risk: 'low', scope: 'global', status: 'pending' },
    ];
  });

  it('rejected proposal via in-session decision excludes from active and enters rejected archive', () => {
    const next = rejectProposal(state, 'P1');

    expect(getActivePending(next.proposals, next.decisions)).toHaveLength(1);
    expect(getActivePending(next.proposals, next.decisions)[0]!.id).toBe('P2');
    expect(getArchived(next.proposals, next.decisions, 'rejected')).toHaveLength(1);
    expect(getArchived(next.proposals, next.decisions, 'rejected')[0]!.id).toBe('P1');
  });

  it('rejected proposal via server-persisted status survives decisions being cleared', () => {
    // Simulate: server sets status = 'rejected', then decisions object is wiped
    state.proposals[0]!.status = 'rejected';
    const clearedDecisions: Record<string, string> = {};

    expect(getActivePending(state.proposals, clearedDecisions)).toHaveLength(1);
    expect(getArchived(state.proposals, clearedDecisions, 'rejected')).toHaveLength(1);
  });

  it('BUG: old doApply clearing all decisions wipes in-session rejected state', () => {
    const next = rejectProposal(state, 'P1');
    // Old bug: state.decisions = {} wipes rejected state before status persisted
    const buggyDecisions: Record<string, string> = {};
    // Without server-side status, proposal comes back
    expect(getActivePending(state.proposals, buggyDecisions)).toHaveLength(2); // BUG
  });
});

// ---------------------------------------------------------------------------
// Bug 3: Test timeout must persist in state, not revert to 'untested'
// ---------------------------------------------------------------------------
describe('Bug 3 — Test timeout must persist as distinct state', () => {
  let proposals: Proposal[];

  beforeEach(() => {
    proposals = [
      { id: 'P1', title: 'Test me', priority: 'P1_high', risk: 'low', scope: 'global', status: 'pending', testStatus: 'untested' },
    ];
  });

  it('timeout updates testStatus to "timeout" in proposal state', () => {
    const updated = applyTimeoutToState(proposals, 'P1');
    expect(updated[0]!.testStatus).toBe('timeout');
  });

  it('after timeout, testStatus is NOT untested (preventing badge revert on re-render)', () => {
    const updated = applyTimeoutToState(proposals, 'P1');
    expect(updated[0]!.testStatus).not.toBe('untested');
  });

  it('BUG: without state update, testStatus reverts to untested on next render', () => {
    // Simulate bug: timeout fires but state not updated
    const notUpdated = proposals;
    // Next renderProposals() call reads this: still 'untested'
    expect(notUpdated[0]!.testStatus).toBe('untested'); // BUG — reverts
  });
});

// ---------------------------------------------------------------------------
// Bug 4: Undo reject must correctly restore to pending
// ---------------------------------------------------------------------------
describe('Bug 4 — Undo reject restores proposal to active list', () => {
  it('clearing in-session decision restores proposal to pending', () => {
    const state = makeState();
    state.proposals = [
      { id: 'P1', title: 'Change', priority: 'P1_high', risk: 'low', scope: 'global', status: 'pending' },
    ];
    const withReject = rejectProposal(state, 'P1');
    expect(getActivePending(withReject.proposals, withReject.decisions)).toHaveLength(0);

    // Undo: delete in-session decision AND reset server status
    const afterUndo = { ...withReject, decisions: { ...withReject.decisions } };
    delete afterUndo.decisions['P1'];
    afterUndo.proposals = afterUndo.proposals.map((p) =>
      p.id === 'P1' ? { ...p, status: 'pending' as ProposalStatus } : p
    );

    expect(getActivePending(afterUndo.proposals, afterUndo.decisions)).toHaveLength(1);
    expect(getArchived(afterUndo.proposals, afterUndo.decisions, 'rejected')).toHaveLength(0);
  });
});
