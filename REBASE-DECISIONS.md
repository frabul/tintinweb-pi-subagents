# Rebase decisions log

One per collision between dev_fb_2 and master (v0.19.0). Status: PENDING → DECIDED.
Full context in REBASE-NOTES.md.

| # | Topic | Branch commit | Master position | Decision |
|---|-------|---------------|-----------------|----------|
| 1 | Model precedence | 41d95f7 | Frontmatter wins + `overridden.model` reporting | DECIDED: keep param-wins; update docs (README authority ¶, schema wording); rework `overridden` reporting. → br tintinweb-pi-subagents-5ri |
| 2 | Token formula | 933f4f7 | Plain sum display total, cost separate | DECIDED: keep weighted `3·out+in+0.2·cr+cw` — condenses 4 stats into 1 correctly-weighted number; cost stays separate plain sum. → br tintinweb-pi-subagents-g5m |
| 3 | Tool-description overhaul | b3a1425, 28d4c03 | Evolved full/compact/custom + promptGuidelines kept | DECIDED: keep fork style (lean descriptions, agent_info on demand). Prep: remove foreground mode entirely (br -1r7), audit+fix outdated info, then port fixed texts (br -gxu, blocked by -1r7) |
| 4 | `wait` param removal | d819b9a | Kept + hardened (queued, abortable) | DECIDED: keep removal; purge all references (schema, abortable/queued-poll block, 'wait for it' wording, tests, docs). → br tintinweb-pi-subagents-5ee |
| 5 | `isolation` param removal | c2b53c1 | `"off"\|\`"worktree\`" union + project switch | DECIDED: keep removal — frontmatter-only worktree. Sub-Q at apply: drop `worktreeIsolation` setting too? (flagged in br -8lw). → br tintinweb-pi-subagents-8lw |
| 6 | Stats survive cleanup | 4600cac | Evict records, tombstones + persisted sessions | DECIDED: keep master workflow untouched; add permanent global stats store (accumulate on eviction, /agents menu all-time total). Sub-Q: in-memory vs file-backed. → br tintinweb-pi-subagents-7u2 |
| 7 | sessionPersistence setting | 4059d5c | `rememberAgents`/`persist_session`, default persisted | DECIDED: drop fork setting, keep master superset; default flips to persisted. → br tintinweb-pi-subagents-wlo |

Non-decision fork behaviours that must still be re-implemented (see
REBASE-NOTES.md → "Required fork behaviours — keep on rebase"): widget shows run
parameters (#2, #20), widget live tokens/cost/context (#7/#8/#9, weighted per Dec. 2),
and /agents menu total accumulated stats (#9, #16, all-time store per Dec. 6).
