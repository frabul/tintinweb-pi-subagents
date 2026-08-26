# Orchestrator hand-off — subagents rebase orchestration

Last updated: after `g5m` worker terminated (paused per user instruction).
Resume point: `g5m` is in `review` but the Review Flow has NOT been run for it.

## Project frame

- Repo: `/home/fbuldo/.pi/agent/packages/tintinweb-pi-subagents`, working branch `dev_fb_3`
  (= upstream master v0.19.0 + prep commit). Fork branch `dev_fb` is the source of the ported
  behaviors (27 commits above diverge `94b25c8` v0.10.2; the rebase notes call it `dev_fb_2`).
- Read-only reference worktree: `/tmp/pi-subagents-dev_fb-reference` (branch `dev_fb`) —
  pass to every worker; never modify.
- Ground truth files: `REBASE-DECISIONS.md` (7 decisions, all DECIDED) and
  `REBASE-NOTES.md` (per-commit inventory #1-#25, hard decision points, required fork
  behaviours, clean adds). Both tracked on `dev_fb_3`. Every worker must read them first.
- br skill: `/home/fbuldo/.pi/agent/skills/beads_rust/SKILL.md`. All br issue-mutating
  commands MUST carry `--actor "<name>"`. Workers commit themselves (user-approved flow);
  commits must contain the issue id, on `dev_fb_3`, no push/tag/branch.

## Loop conventions (user standing instructions)

- Review frequency: **1** — review flow after every issue lands in `review`.
- Reviewer model override (changed 2026-08-26, user): `gpt-5.6-luna`, thinking **max**.
  (Was `opencode-go/deepseek-v4-flash`; user swapped worker/reviewer roles.)
- Worker model override (changed 2026-08-26, user): `opencode-go/deepseek-v4-flash`,
  thinking **max** — apply to ALL FUTURE WORKERS. History: `opencode-go/ox-alpha-free` and
  `opencode/x-preview-f-free` both 401 "not supported"; `openrouter/z-ai/glm-5.2:free`
  persistent 429 upstream shared-pool limit; `gpt-5.6-luna` used for the 5ee first/second
  workers (user-approved at the time). If deepseek-v4-flash fails at launch, stop and ask.
- Worker turn budget: `max_turns: 50` at launch (user-mandated 2026-08-26).
- Failure handling (turn-cap or budget exhaustion): resume the failed worker to write a
  hand-off comment to the issue (format: Work Attempted / Current State / Failure Point /
  Known Context / Suggested Continuation), `br sync --flush-only`, then spawn a FRESH
  worker (never resume mid-work) to continue from the comment.
- Worker prompt format: Objective / Inputs / Constraints / Required Output; always include
  issue id, REBASE files, reference worktree, br actor, "commit is expected", pre-existing
  baseline failures note, and the finish line (comment + sync + status review).

## Environment facts (all pre-existing, do NOT let workers chase them)

- `npm run check`: typecheck blocked by baseline failures — duplicate `pi-tui` TUI types
  (`src/index.ts`, `src/ui/workflow-menu.ts`); missing `MarkdownOptions` + arg-count
  mismatch (`src/ui/conversation-viewer.ts`); missing `stripTerminalSequences`
  (`src/ui/workflow-card.ts`, `src/ui/workflow-dialog.ts`); `ThinkingLevel` vs
  `EffectiveThinkingLevel` (`src/agent-manager.ts`); autocomplete `triggerCharacters`
  (`src/ui/agent-mention.ts`).
- Vitest normal run: blocked before collection by `@earendil-works/pi-ai` `"./compat" is
  not exported` mismatch.
- Workaround (used by several workers, always restored, never committed): temporarily align
  node_modules to the installed nested pi-ai/pi-tui 0.84.3 packages, run suites, restore.
- Lint: passes; one pre-existing warning `test/workflow-tool-description.test.ts:155`
  (`noTemplateCurlyInString`).
- Lean closeout prompts work: worker #4 on 1r7 finished with 53 tool uses vs 160–240 for
  exploration-heavy ones. Prefer enumerating exact remaining work from hand-off comments.

## Issue status

| Issue | Topic | Status |
|---|---|---|
| `1r7` | Remove foreground mode (background-only) | ✅ CLOSED — commit `d734151`; reviewed, approved |
| `5ri` | Caller model precedence (Decision 1) | ✅ CLOSED — commits `7040a53` (+beads `478d047`); reviewed, approved |
| `g5m` | Weighted token formula (Decision 2) | ⌛ `review` — commits `0d74133`/`8931682`, comment #16; **REVIEW NOT YET RUN** (paused) |
| `5ee` | Remove get_subagent_result `wait` param (Decision 4) | open — next worker |
| `8lw` | Remove `isolation` param, frontmatter-only worktree (Decision 5) | open |
| `7u2` | Permanent lifetime stats store (Decision 6; sub-Q in-memory vs file-backed, default in-memory) | open |
| `wlo` | Drop sessionPersistence, keep master superset (Decision 7) | open |
| `gxu` | Tool-description audit + port (Decision 3) | open — MUST run LAST (blocked on 1r7, now landed) |
| `5ly` | Limit subagent session by max context length (like maxTurns) | open, prio 2 — held (post-rebase batch) |
| `dng` | Trace subagent stats in main agent log (investigate) | open, prio 2 — held (post-rebase batch) |
| `n2k` | Print subagent stats on terminate | open, prio 2 — BLOCKED by `dng` |

Dep graph: `1r7`→`gxu`, `dng`→`n2k`. No cycles. User ordering: rebase queue in listed
order, `gxu` last, then the 3 new features (they were added to br mid-run; default = run
after rebase queue unless user says otherwise).

## Committed baseline on dev_fb_3 (do not revert/redo)

- `d734151` — background-only spawns (1r7): no `run_in_background` param on Agent tool,
  no foreground branch/streaming; `maxConcurrentForeground` and `backgroundByDefault`
  removed; nested/RPC/registry spawns forced background; internal `spawnAndWait` /
  sync resume retained ONLY for workflow/generator coordination; `resolveJoinMode` now
  one arg; `widgetMode all/background` identical. 534 tests passed in aligned env (0 fail).
- `7040a53` — caller model precedence (5ri): `params.model` wins over frontmatter,
  blank→undefined normalization, fail-loud unknown model, `overridden` now thinking-only,
  top-level `requestedModel` no longer populated, schedule persists normalized override only.

## Current working tree

Clean (only normal post-`br`-status `.beads/issues.jsonl` delta after ops).
`g5m`'s changes are in commits `0d74133` (weighted formula across display surfaces +
LifetimeUsage reconciliation) and `8931682` (test correction).

## Next steps if continuing

1. Review flow for `g5m` (reviewer agent, deepseek-v4-flash max): review commit `0d74133`
   against REBASE-DECISIONS #2 (weighted formula on all display surfaces; cost plain sum;
   optional-typing reconciliation; usage.ts rationale replaces #38 note), close or bounce.
2. Worker for `5ee` — purge `wait` param from get_subagent_result (schema, queued-poll
   block, `QUEUE_WAIT_POLL_MS`, abortable usage, steering wording, tests `wait-queued`,
   README/docs). Consistent with background-only world.
3. Continue `8lw` (sub-Q: drop `worktreeIsolation` setting too? default: drop), `7u2`
   (sub-Q: in-memory vs file-backed, default in-memory), `wlo`.
4. `gxu` last — port fork tool descriptions after auditing against v0.19.0 + post-decision
   schema (wait gone, status:running present, overridden wording).
5. New batch: `5ly`, `dng`, `n2k`.