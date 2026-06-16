/**
 * context.ts — Extract parent conversation context for subagent inheritance.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Extract text from a message content block array. */
export function extractText(content: unknown[]): string {
  return content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text ?? "")
    .join("\n");
}

/**
 * Build a text summary of the parent conversation context.
 * Used when inherit_context is "summary" to give the subagent visibility
 * into what has been discussed so far — tool results are skipped for brevity.
 */
export function buildParentContext(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getBranch();
  if (!entries || entries.length === 0) return "";

  const parts: string[] = [];

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user") {
        const text = typeof msg.content === "string"
          ? msg.content
          : extractText(msg.content);
        if (text.trim()) parts.push(`[User]: ${text.trim()}`);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content);
        if (text.trim()) parts.push(`[Assistant]: ${text.trim()}`);
      }
      // Skip toolResult messages — too verbose for context
    } else if (entry.type === "compaction") {
      // Include compaction summaries — they're already condensed
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join("\n\n")}

---
# Your Task (below)
`;
}

/**
 * Build a complete parent conversation dump including tool calls and results.
 * Used as a fallback when inherit_context is "fork" but a proper session-based
 * fork (the preferred path) cannot be created. The session-based fork is the
 * primary mechanism; this text dump provides full visibility as a fallback.
 *
 * Uses buildSessionContext() to get the fully resolved messages (compaction
 * summaries, branch summaries resolved) rather than manually iterating raw
 * branch entries.
 */
export function buildFullContext(ctx: ExtensionContext): string {
  // buildSessionContext is on SessionManager, but ExtensionContext exposes it
  // as ReadonlySessionManager. At runtime it IS a SessionManager, so cast.
  const sm = ctx.sessionManager as any;
  const { messages } = sm.buildSessionContext?.() ?? { messages: undefined };
  if (!messages || messages.length === 0) return "";

  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : extractText(msg.content);
      if (text.trim()) parts.push(`[User]: ${text.trim()}`);
    } else if (msg.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: string[] = [];
      for (const c of msg.content) {
        if (c.type === "text" && c.text?.trim()) textParts.push(c.text.trim());
        else if (c.type === "toolCall") {
          toolCalls.push(`  Tool: ${(c as any).name ?? (c as any).toolName ?? "unknown"}`);
        }
      }
      if (textParts.length > 0) parts.push(`[Assistant]: ${textParts.join("\n")}`);
      if (toolCalls.length > 0) parts.push(`[Tool Calls]:\n${toolCalls.join("\n")}`);
    } else if (msg.role === "tool_result" || msg.role === "toolResult") {
      const text = typeof msg.content === "string"
        ? msg.content
        : extractText(msg.content);
      const truncated = text.length > 1000 ? text.slice(0, 1000) + "..." : text;
      parts.push(`[Tool Result (${(msg as any).toolName ?? "unknown"})]: ${truncated}`);
    }
  }

  if (parts.length === 0) return "";

  const header = "# Parent Conversation (Forked)";
  const desc = "The following is the complete conversation history from the parent session, including tool calls and results.";
  const instruction = "Use this context to continue the work as if you were the original agent.";
  const separator = "---";
  const footer = "# Your Task (below)";

  return `${header}\n${desc}\n${instruction}\n\n${parts.join("\n\n")}\n\n${separator}\n${footer}\n`;
}
