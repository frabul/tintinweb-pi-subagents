# Rebase dev_fb_2 → master (v0.10.2 → v0.19.0) — findings

Branch: `dev_fb_2` (27 commits, June→Aug 2026) onto `master` = upstream v0.19.0.
Backup: `backup/dev_fb_2-pre-rebase`. Diverge point: `94b25c8` (v0.10.2).

## Per-commit inventory

| # | Commit | What it does | Status vs master |
|---|--------|--------------|------------------|
| 1 | 4059d5c | `sessionPersistence` setting (in-memory/persisted), settings menu entry | **SUPERSEDED/COLLIDES** — master has `rememberAgents` (default **true**=persisted) + `persist_session` frontmatter + `sessionDir` + parentSession linking (#205). Master is a superset except the *default* is opposite. |
| 2 | 17b2c4d | Agent renderCall lists passed args under header | Conflicts textually — master renderCall rewritten with agent color badges (#225). Feature additive; `argOrder` list references removed `isolation`. |
| 3 | 41d95f7 | `params.model` wins over frontmatter `model:` | **SEMANTIC COLLISION** — master keeps frontmatter-wins and builds `overridden.model` reporting on top of it (#182). |
| 4 | 8adacfe | Show fully-resolved `provider/modelId` in results (`resolvedModel`) | Partially superseded — master #257 shows model+thinking a subagent ran with; different mechanism, overlapping UI lines. |
| 5 | 74eeb55 | Fail loud if param-supplied model unknown | Superseded by 72af410 (same file region); master behavior to verify at resolve site. |
| 6 | ea8e76b | Task description as subagent session name | Small conflict; master still `agentConfig?.name ?? type`. Interacts with @handle naming/session lists. |
| 7 | 931b367 | Accumulate cacheRead + cost in LifetimeUsage | **Overlaps** master #243: master added `cacheRead?/cost?` (optional), `getLifetimeCost`, spend reporting to parent. Different typing (required vs optional), same purpose. |
| 8 | 933f4f7 | Weighted token formula `3·out + in + 0.2·cacheRead + cacheWrite` | **SEMANTIC COLLISION** — master deliberately keeps display total `in+out+cacheWrite` (documented rationale: cacheRead double-counts prefix; cost reported separately). |
| 9 | fd1e0c4 | Session totals in /agents menu, cost+ctx-len in widget/viewer (`formatCost`, `formatCount`, `getSessionContextLength`) | Overlaps master cost display (#243) and widget rework; textual + partial semantic. |
| 10 | b2a164b | New `agent_info` tool (guidelines/create/list/info) + prompts/agents-guidelines.md | No master equivalent — additive, mostly clean. `create` text mentions `isolation` frontmatter (fine, master keeps it). Uses `parseFrontmatter`. |
| 11 | b3a1425 | Gut Agent tool descriptions → guidelines-style; compact mode becomes pointer to agent_info; **compact becomes default**; drops `promptGuidelines` | **SEMANTIC COLLISION** — master retains full/compact/custom modes, expanded both texts, keeps promptGuidelines. Default-mode flip is a real product decision. |
| 12 | 4c9827f | Turn-limit steer message rewording (+ "MUST call agent_info('list')" in compact desc) | Trivial textual; master wording unchanged. |
| 13 | f007239 | `inherit_context`: `"summary"`/`"fork"` (real branched-session fork via `createBranchedSession`, text-dump fallback `buildFullContext`) | Master has boolean-only inheritContext. Heavy conflicts: master rewrote runAgent (resumeSessionFile, `runInChildSessionContext`, persistSession branching). Feature valuable but must be re-seated. README/schema/tests included. |
| 14 | 498cb14 | `buildParentContext` switched to `sm.buildSessionContext()` | Small conflict in context.ts (master unchanged there). |
| 15 | 614c4ef | Add `Status: running` line to background-spawn result | Small conflict — master spawn-return text diverged (fallbackNote, "Do not duplicate this agent's work."). |
| 16 | 4600cac | cleanup() disposes session but keeps record (stats survive) | **SEMANTIC COLLISION** — master built tombstones + persisted sessions for post-eviction access (@handle reopen, MAX_TOMBSTONES, clearCompleted semantics). Keeping records contradicts master's eviction design; stats-survival achieved differently upstream. |
| 17 | d819b9a | Remove `wait` param from get_subagent_result (abused by agents) | **DIRECT COLLISION** — master kept `wait` and hardened it (queued-agent polling, abortable waits #127/#159). |
| 18 | 28d4c03 | Guidelines tuning (prompts file, descriptions) | Rides on #11's conflicts. |
| 19 | 59d2b31 | `${REPO_AGENTS_MD}`/`${USER_AGENTS_MD}` prompt placeholders | No master equivalent — additive, clean (prompts.ts untouched upstream). |
| 20 | f58165b | Model label in widget finished/running lines, viewer invocation line, /agents menu | Overlaps master #257 (`buildInvocationTags` returns `{modelName, modelId}` + `requestedModel`); textual conflicts. |
| 21 | acab539, 9726725 | Dep bumps (vitest 4.1.8, npm audit fix) | Master bumped lockfile independently → take master's versions, likely drop both commits. |
| 22 | 70ed0e4 | Anti-poll wording in get_subagent_result desc/result | Compatible intent; master description text changed → small conflict. |
| 23 | d9d2d0e | Blank string params normalized to undefined in resolver | Master attacked same problem via inert filler values (#231, isolation `"off"`), no global blank-normalization in resolver. Resolver was fully rewritten upstream (opts, overridden-tracking) → re-seat logic manually. |
| 24 | c2b53c1 | Remove `isolation` param entirely (frontmatter-only worktree) | **DIRECT COLLISION** — master ships `isolationParam` union `"off"\|"worktree"` + `worktreeIsolation` project switch (#231/#238) with detailed rationale. |
| 25 | a63e0ef | Schema: optional params documented as overrides; `strict:false`; `inherit_context` accepts `""`; schedule accepts blank | Conflicts with master schema shape (new `name` param, isolationParam spread, background-default descriptions). `strict:false` + blank-tolerance still applicable. |

## Hard decision points (need user ruling)

1. **Model precedence** (#3): your param-wins vs master frontmatter-wins + `overridden` reporting.
2. **Weighted token formula** (#8): your `3·out+in+0.2·cr+cw` vs master's deliberate plain sum + separate cost.
3. **Tool-description overhaul** (#11,#18): guidelines-style + compact-as-default vs master's evolved full/compact/custom + promptGuidelines.
4. **`wait` param removal** (#17) vs master's hardened wait.
5. **`isolation` param removal** (#24) vs master's `"off"` filler + project switch.
6. **Stats survive cleanup** (#16) vs master tombstone architecture.
7. **sessionPersistence** (#1) vs master `rememberAgents`/`persist_session` (superset; default differs).

## Already-superseded (candidates to drop)

- 4059d5c (sessionPersistence ⊂ rememberAgents, modulo default)
- 74eeb55 (folded into 72af410)
- acab539 + 9726725 (deps — take master's)
- Parts of 8adacfe/f58165b/fd1e0c4 (model/cost display shipped via #243/#257)


## Required fork behaviours — keep on rebase (do not drop)

Cross-cutting list, made explicit so these survive the replay of the per-commit
inventory above. Each maps to inventory items (#) and, where decided, a bead.

1. **Run parameters visible in the subagent widget.** The widget's running AND finished
   agent rows show the parameters the agent was spawned with — at minimum the model,
   ideally the rest (thinking level, isolation/worktree, inherit context, max turns,
   background). Fork: 17b2c4d (renderCall lists passed args), f58165b (model label in
   widget rows), buildInvocationTags surfaces. Master v0.19.0 already carries
   buildInvocationTags + the widget's `showModel`/tags handling, so this is mostly a
   PORT of the fork's param display onto master's plumbing, not a rebuild. → #2, #20.

2. **Widget live stats: token total, cost, context.** Running rows keep updating live
   with: turns, tool uses, weighted token total, raw context-window length (`N ctx`),
   estimated cost; finished rows keep tokens/cost/duration. Fork: fd1e0c4 (formatCount
   + getSessionContextLength + cost + ctx in widget/viewer), 931b367 (accumulate
   cacheRead+cost), 933f4f7 (weighted formula). Master #243/#257 overlap — re-implement
   the fork additions (raw ctx length, cost on the visible rows) on master's display
   path. Decided: #2 (weighted, bead g5m), #7 accumulates onto master's shape. → #7, #8, #9.

3. **/agents menu shows total accumulated stats.** The /agents menu offers a view of
   accumulated subagent stats: the fork's per-session total (tokens, cost, tool uses,
   'Session total' line) plus the decided all-time permanent accumulator. Fork:
   fd1e0c4 (Session total line), 4600cac (stats survive cleanup) → Decision 6: keep
   master's eviction untouched, add a permanent global stats store feeding an all-time
   total in the menu. Decided: #6 (bead 7u2). → #9, #16.
## Clean adds worth keeping

- agent_info tool + agents-guidelines.md (#10)
- `${REPO_AGENTS_MD}`/`${USER_AGENTS_MD}` placeholders (#19)
- inherit_context summary/fork + branched-session fork (#13, needs re-seating)
- blank-param normalization (#23, adapted to new resolver)
- renderCall args listing (#2, minus `isolation`)
- description-as-session-name (#6)
- Status:running line (#15), anti-poll wording (#22), schema override notes + strict:false (#25)
- steer-message rewording (#12)

## Rebase vs re-apply

- Straight rebase: ~18/27 commits hit conflicts; several files (index.ts 1.5k→4k lines,
  invocation-config.ts, agent-runner.ts, usage.ts) were structurally rewritten upstream, so
  conflict hunks often don't map 1:1 and need manual re-implementation anyway.
- Full re-apply: one pass over final code, decisions made once; loses per-commit history;
  higher regression risk without per-commit tests.
- **Assessment**: neither pure form wins. Cheapest correct path = rebase with a plan:
  pre-drop superseded commits (see list above), squash #5 into #72af410-equivalent,
  then replay the rest, re-implementing conflicted hunks against master's new structure.
  Decision points above gate ~6 commits.
