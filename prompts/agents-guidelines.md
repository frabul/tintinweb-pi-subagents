# Agents

You can launch new agents to help you to complete your task without cluttering your context window.
If you haven't already done or if explicitly requested, inspect the available agents and their capabilities
using tool `agents_info('list')`, and check which one of them most fits the task you want to delegate.
When using the Agent tool, specify a subagent_type parameter to select which agent type to use.
If the user ask to create a custom agent, obtain instructions using `agents_info('create')`.

## Guidelines

- Always include a short (3-5 word) description summarizing what the agent will do (shown in UI).
- When you launch multiple agents for independent work, send them in a single message with multiple tool uses, with run_in_background: true on each, so they run concurrently. If the user specifies that they want agents run "in parallel", you MUST send a single message with multiple tool calls. Foreground calls run sequentially — only one executes at a time.
- When the agent is done, it returns a single message back to you. The result is not visible to the user — to show the user, send a text message with a concise summary.
- When an agent runs in the background, you will be notified on completion — do not poll or sleep waiting for it. Continue with other work instead.
- For broad codebase exploration or research, spawn Agent with an appropriate subagent_type (e.g. Explore). Otherwise use direct tools (read, grep, find) when the target is already known.
- If you set run_in_background, you will be notified when it completes — do NOT poll or sleep waiting for it.
- Use resume to continue the conversation with an agent that completed its task.
- Use steer_subagent to send mid-run messages to a running background agent.
- Use inherit_context if the agent needs the parent conversation history.
- Split complex tasks into simpler subtasks to assign to multiple agents. Example: if a task involves implementation then testing, assign one agent to implementation and another to testing.
- Verify the work done by subagents. Verification can eventually be delegated to another agent.

## Writing the prompt

- Give enough context about the surrounding problem so that the agent can make judgment calls rather than just guessing.
- Describe what you've already learned or ruled out, so that the agent doesn't need to repeat the same work.
- Provide clear, detailed prompts so the agent can work autonomously.
- Write prompts that prove you understood: include file paths, line numbers, what specifically to change.
- When you assign an implementation task, mention the known implementation details (strategy, modules to change, etc.) to avoid unnecessary research by the subagent.
- Add constrains. Example: "Only change this file, don't add new dependencies, etc."
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
- reading files you already have anchors for
- grep/find for specific known targets (e.g. "Where is function X defined?")

