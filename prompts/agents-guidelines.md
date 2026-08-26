# Agents

You can launch new agents to help you to complete your task without cluttering your context window.
If you haven't already done so or if explicitly requested, inspect the available agents and their capabilities
using tool `agent_info('list')`, and check which one of them most fits the task you want to delegate.
When using the Agent tool, specify a subagent_type parameter to select which agent type to use.
If the user asks to create a custom agent, obtain instructions using `agent_info('create')`.

This document is the reference copy of the Agent tool's full description (the
runtime text is generated in `src/index.ts`; `agent_info('guidelines')` returns
it to the model on demand). The `schedule` bullet below is emitted only when
scheduling is enabled (the default).

## Guidelines

- Always include a short (3-5 word) description summarizing what the agent will do (shown in UI).
- Optional parameters override the selected agent type's defaults. Omit or blank them when no override is intended.
- All agents run in the background. When you launch multiple agents for independent work, send them in a single message with multiple tool uses, so they run concurrently. If the user specifies that they want agents run "in parallel", you MUST send a single message with multiple tool calls.
- When the agent is done, it returns a single message back to you. The result is not visible to the user — to show the user, send a text message with a concise summary.
- When an agent runs in the background, you will be notified on completion — **DO NOT POLL OR SLEEP WAITING FOR IT**. Continue with other work or wait for user prompt.
- For broad codebase exploration or research, spawn an agent with an appropriate subagent_type (e.g. Explore). Otherwise use direct tools (read, grep, find) when the target is already known.
- Get an agent's full result with get_subagent_result (its ID or handle) — it reports the agent's status and full result; the completion notification carries only a preview. Do not use it to poll — you will be notified when the agent completes.
- Address a running agent by its handle — the `name` you gave the Agent call, or its type: `@name` at the chat prompt routes to it, and steer_subagent takes the handle directly.
- Use resume to continue the conversation with an agent that completed its task. A new (non-resume) Agent call starts a fresh agent with no memory of prior runs — the prompt must be self-contained.
- Use inherit_context if the agent needs the parent conversation history.
- Use `schedule` only when the user explicitly asked for scheduled / recurring / delayed execution (e.g. "every Monday", "in an hour"). Don't auto-schedule from vague intent like "monitor X" — run once now or ask.
- Split complex tasks into simpler subtasks to assign to multiple agents. Example: if a task involves implementation then testing, assign one agent to implementation and another to testing.
- Verify the work done by subagents. Verification can eventually be delegated to another agent.

## Writing the prompt

- Give enough context about the surrounding problem so that the agent can make judgment calls rather than just guessing.
- Describe what you've already learned or ruled out, so that the agent doesn't need to repeat the same work.
- Provide clear, detailed prompts so the agent can work autonomously.
- When you assign an implementation task, mention the known implementation details (strategy, modules to change, etc.) to avoid unnecessary research by the subagent.
- Add constraints. Example: "Only change this file, don't add new dependencies, etc."
- If all information is already in one or more files, provide the reference to the files instead.

## What to delegate vs do directly

If the target is already known, use a direct tool — `read` for a known path, `grep`/`find` for a specific symbol or string. Reserve this tool for open-ended questions that span the codebase, or tasks that require multi-step reasoning and could clutter the context window with intermediate steps and findings which are not relevant for the big picture.

Delegate to subagents:
- Independent implementation tasks (e.g. refactor package A)
- Test writing after implementation
- Validation of the execution of some task
- Codebase exploration / research

Do directly:
- Quick edits (one-liners, config changes)
- Reading files you already have anchors for
- grep/find for specific known targets (e.g. "Where is function X defined?")