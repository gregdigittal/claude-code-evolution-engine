---
updated: {{date}}
---

# CCEE Dashboard

## Latest Run

> Auto-updated by CCEE each week.

## Weekly Reviews

```dataview
TABLE run_date, proposals_accepted, proposals_rejected, test_pass_rate
FROM "CCEE/Weekly-Reviews"
WHERE file.name = "review-summary"
SORT run_date DESC
LIMIT 12
```

## Architecture

![[Architecture/current-setup.svg]]

## Tracked Repositories

```dataview
LIST
FROM "CCEE/Repo-Intelligence"
WHERE file.name != "_index"
SORT file.name ASC
```

## YouTube Intelligence

```dataview
TABLE channel, relevance_score
FROM "CCEE/YouTube-Intelligence"
SORT file.mtime DESC
LIMIT 10
```
