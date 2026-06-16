/**
 * context.test.ts — Parent conversation context extraction for inherit_context spawns.
 *
 * buildParentContext shapes what a subagent sees from its parent; silent bugs
 * here would feed wrong context into spawns. Tests use realistic SessionEntry
 * shapes and a minimal ExtensionContext stub — no mocking beyond the one
 * getBranch() call the function actually reads.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildFullContext, buildParentContext, extractText } from "../src/context.js";

function makeCtx(entries: unknown[]): ExtensionContext {
  return { sessionManager: { getBranch: () => entries } } as unknown as ExtensionContext;
}

function userMsg(content: string | unknown[]) {
  return { type: "message", message: { role: "user", content } };
}

function assistantMsg(blocks: unknown[]) {
  return { type: "message", message: { role: "assistant", content: blocks } };
}

describe("extractText", () => {
  it("joins multiple text blocks with newlines", () => {
    expect(extractText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
  });

  it("filters out non-text blocks (tool_use, etc.)", () => {
    expect(
      extractText([
        { type: "text", text: "keep" },
        { type: "tool_use", name: "x", input: {} },
        { type: "text", text: "also keep" },
      ]),
    ).toBe("keep\nalso keep");
  });

  it("treats a text block with missing text field as empty", () => {
    expect(extractText([{ type: "text" }, { type: "text", text: "x" }])).toBe("\nx");
  });

  it("returns empty string for an empty content array", () => {
    expect(extractText([])).toBe("");
  });
});

describe("buildParentContext", () => {
  it("returns empty string for an empty branch", () => {
    expect(buildParentContext(makeCtx([]))).toBe("");
  });

  it("returns empty string when no entries produce extractable content", () => {
    // toolResult is skipped, empty-summary compaction is skipped
    const out = buildParentContext(
      makeCtx([
        { type: "message", message: { role: "tool_result", content: "..." } },
        { type: "compaction", summary: "" },
      ]),
    );
    expect(out).toBe("");
  });

  it("wraps a user+assistant exchange with the parent-context header and task footer", () => {
    const out = buildParentContext(
      makeCtx([userMsg("hello"), assistantMsg([{ type: "text", text: "hi back" }])]),
    );
    expect(out).toContain("# Parent Conversation Context");
    expect(out).toContain("[User]: hello");
    expect(out).toContain("[Assistant]: hi back");
    expect(out).toMatch(/# Your Task \(below\)\n$/);
    // Entries are joined with a blank line, preserving conversation order
    expect(out).toContain("[User]: hello\n\n[Assistant]: hi back");
  });

  it("accepts user messages whose content is content-blocks (not just a string)", () => {
    const out = buildParentContext(makeCtx([userMsg([{ type: "text", text: "from blocks" }])]));
    expect(out).toContain("[User]: from blocks");
  });

  it("includes compaction summaries inline in their original position", () => {
    const out = buildParentContext(
      makeCtx([
        userMsg("orig question"),
        { type: "compaction", summary: "we discussed X" },
        assistantMsg([{ type: "text", text: "follow-up" }]),
      ]),
    );
    expect(out.indexOf("[User]: orig question"))
      .toBeLessThan(out.indexOf("[Summary]: we discussed X"));
    expect(out.indexOf("[Summary]: we discussed X"))
      .toBeLessThan(out.indexOf("[Assistant]: follow-up"));
  });

  it("skips tool_result messages — they're too verbose for inherited context", () => {
    const out = buildParentContext(
      makeCtx([
        userMsg("real user"),
        { type: "message", message: { role: "tool_result", content: "noisy tool output" } },
        assistantMsg([{ type: "text", text: "real assistant" }]),
      ]),
    );
    expect(out).not.toContain("noisy tool output");
    expect(out).toContain("[User]: real user");
    expect(out).toContain("[Assistant]: real assistant");
  });

  it("trims and skips whitespace-only messages", () => {
    const out = buildParentContext(
      makeCtx([userMsg("   \n  "), assistantMsg([{ type: "text", text: "non-empty" }])]),
    );
    expect(out).not.toMatch(/\[User\]:/);
    expect(out).toContain("[Assistant]: non-empty");
  });

  it("ignores assistant messages whose only content is non-text blocks", () => {
    // Assistant emitted only a tool_use — nothing extractable, so it shouldn't appear
    const out = buildParentContext(
      makeCtx([
        userMsg("question"),
        assistantMsg([{ type: "tool_use", name: "x", input: {} }]),
      ]),
    );
    expect(out).toContain("[User]: question");
    expect(out).not.toContain("[Assistant]:");
  });
});

describe("buildFullContext", () => {
  it("returns empty string for an empty branch", () => {
    expect(buildFullContext(makeCtx([]))).toBe("");
  });

  it("wraps a user+assistant exchange with the forked-context header and task footer", () => {
    const out = buildFullContext(
      makeCtx([userMsg("hello"), assistantMsg([{ type: "text", text: "hi back" }])]),
    );
    expect(out).toContain("# Parent Conversation (Forked)");
    expect(out).toContain("[User]: hello");
    expect(out).toContain("[Assistant]: hi back");
    expect(out).toMatch(/# Your Task \(below\)\n$/);
  });

  it("includes tool results (unlike buildParentContext)", () => {
    const out = buildFullContext(
      makeCtx([
        userMsg("list files"),
        { type: "message", message: { role: "tool_result", content: "file1.txt\nfile2.txt", toolName: "bash" } },
        assistantMsg([{ type: "text", text: "here are the files" }]),
      ]),
    );
    expect(out).toContain("[User]: list files");
    expect(out).toContain("[Tool Result (bash)]");
    expect(out).toContain("file1.txt");
    expect(out).toContain("[Assistant]: here are the files");
  });

  it("truncates long tool results to 1000 chars", () => {
    const longOutput = "x".repeat(2000);
    const out = buildFullContext(
      makeCtx([
        userMsg("run"),
        { type: "message", message: { role: "tool_result", content: longOutput, toolName: "read" } },
      ]),
    );
    expect(out).toContain("x".repeat(1000));
    expect(out).toContain("...");
    expect(out).not.toContain("x".repeat(1001));
  });

  it("includes tool calls from assistant messages", () => {
    const out = buildFullContext(
      makeCtx([
        userMsg("find the function"),
        assistantMsg([
          { type: "toolCall", name: "grep", arguments: { pattern: "func" } },
          { type: "text", text: "searching..." },
        ]),
      ]),
    );
    expect(out).toContain("[User]: find the function");
    expect(out).toContain("[Tool Calls]");
    expect(out).toContain("grep");
    expect(out).toContain("[Assistant]: searching...");
  });

  it("skips whitespace-only messages", () => {
    const out = buildFullContext(
      makeCtx([assistantMsg([{ type: "text", text: "   " }])]),
    );
    expect(out).toBe("");
  });

  it("includes compaction summaries inline", () => {
    const out = buildFullContext(
      makeCtx([
        userMsg("q1"),
        { type: "compaction", summary: "compacted discussion" },
        assistantMsg([{ type: "text", text: "a2" }]),
      ]),
    );
    expect(out).toContain("[Summary]: compacted discussion");
    expect(out).toContain("[User]: q1");
    expect(out).toContain("[Assistant]: a2");
  });
});
