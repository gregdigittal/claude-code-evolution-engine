# Mission Control Integration

CCEE is the implementation of **CSIE (Continuous Skill Intelligence Engine)** from the
Mission Control platform architecture, specialised for Claude Code configurations.

## Integration Points

### Review UI

The CCEE Review UI runs on port 9898 (configurable via `REVIEW_UI_PORT`).
Mission Control opens `/ccee/review/{date}` in a browser tab.

**Endpoints:**
- `GET /api/ccee/latest` — Latest run summary
- `GET /api/ccee/runs/:date/proposals` — Proposals for a run
- `POST /api/ccee/runs/:date/apply` — Apply accepted proposals
- `POST /api/ccee/trigger` — Trigger on-demand run

### API Authentication

The API currently requires no authentication — it is protected by Tailscale network access
(only accessible on the Tailscale network at `100.88.238.20:9898`).

### Audit Trail

When proposals are applied via the API, log entries are written to `~/.ccee/runs/{date}/pipeline.log`.
Mission Control can read these to record actions in its own audit trail.

## Architecture Layer

CCEE operates at Layer 1 (Claude Code adapter level). It does not touch Mission Control's
Skill IR layer — proposals are about Claude Code configuration, not Mission Control tasks.

## Deployment

CCEE runs as `ccee-review.service` (systemd). See `scripts/ccee-review.service`.

```bash
# Check status
systemctl status ccee-review.service

# View logs
journalctl -u ccee-review.service -f
```

## Tailscale IP

The VPS is accessible at `100.88.238.20` (Hetzner VPS, `hetzner-agents` SSH alias).
The review UI is available at `http://100.88.238.20:9898` from any Tailscale device.
