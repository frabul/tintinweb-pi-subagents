// End-to-end test for `toolDescriptionMode` (#91): settings file → sanitize →
// applier → registration-time description pick. Instantiates the real extension
// with a mock pi (same pattern as print-mode.test.ts) inside a temp cwd, then
// inspects the registered Agent tool's description.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import subagentsExtension from "../src/index.js";
import { setWorktreeIsolationEnabled } from "../src/worktree.js";

const EXAMPLE_TEMPLATE = fileURLToPath(new URL("../examples/agent-tool-description.md", import.meta.url));

function makePi() {
  const tools = new Map<string, any>();
  const handlers = new Map<string, any>();

  return {
    pi: {
      registerMessageRenderer: vi.fn(),
      registerTool: vi.fn((tool: any) => {
        tools.set(tool.name, tool);
      }),
      registerCommand: vi.fn(),
      registerEntryRenderer: vi.fn(),
      registerFlag: vi.fn(),
      getFlag: vi.fn(),
      on: vi.fn((event: string, handler: any) => {
        handlers.set(event, handler);
      }),
      events: {
        emit: vi.fn(),
        on: vi.fn(() => vi.fn()),
      },
      appendEntry: vi.fn(),
      sendMessage: vi.fn(),
    } as any,
    tools,
    handlers,
  };
}

describe("toolDescriptionMode", () => {
  let tmpDir: string;
  let hermeticAgentDir: string;
  let prevCwd: string;
  let prevAgentDir: string | undefined;
  let prevHome: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  function setup(settings?: Record<string, unknown>, beforeInstantiate?: () => void) {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-tooldesc-"));
    // Isolate global settings (getAgentDir / ~/.pi) so the dev's real
    // subagents.json can't leak into the "default is full" assertion.
    hermeticAgentDir = mkdtempSync(join(tmpdir(), "pi-tooldesc-agentdir-"));
    prevAgentDir = process.env.PI_CODING_AGENT_DIR;
    prevHome = process.env.HOME;
    process.env.PI_CODING_AGENT_DIR = hermeticAgentDir;
    process.env.HOME = hermeticAgentDir;
    prevCwd = process.cwd();
    mkdirSync(join(tmpDir, ".pi"), { recursive: true });
    if (settings) {
      writeFileSync(join(tmpDir, ".pi", "subagents.json"), JSON.stringify(settings));
    }
    beforeInstantiate?.();
    process.chdir(tmpDir);

    const { pi, tools, handlers } = makePi();
    subagentsExtension(pi);
    shutdown = async () => {
      await handlers.get("session_shutdown")?.({}, { hasUI: false, ui: {} } as any);
    };
    return tools;
  }

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    // applySettings only applies keys that are PRESENT, so a subagents.json
    // without `worktreeIsolation` leaves the module singleton wherever the
    // previous test left it. Reset it so each setup()'s settings decide, and
    // so the "default" assertions below really test the default.
    setWorktreeIsolationEnabled(true);
    process.chdir(prevCwd);
    if (prevAgentDir == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
    if (prevHome == null) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(hermeticAgentDir, { recursive: true, force: true });
  });

  it("defaults to the full description", () => {
    const tools = setup();
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("## Guidelines");
    expect(desc).toContain("## Writing the prompt");
    // The full description points at agent_info for details instead of
    // embedding the roster (context-bloat reduction).
    expect(desc).toContain("agent_info('list')");
    expect(desc).not.toContain("- general-purpose:");
  });

  it("compact mode swaps in the lean pointer-to-agent_info description", () => {
    const tools = setup({ toolDescriptionMode: "compact" });
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("Launch an autonomous sub-agent");
    expect(desc).toContain("MUST call `agent_info('list')` to get available agents");
    expect(desc).not.toContain("## Guidelines");
    expect(desc).not.toContain("## Writing the prompt");
    // No embedded roster — the model pulls types/tools via agent_info('list').
    expect(desc).not.toContain("- general-purpose:");
    expect(desc).not.toContain("very thorough");
    // The point of the feature: materially smaller than the full version.
    expect(desc.length).toBeLessThan(1600);
  });

  it("invalid mode in the settings file is dropped — full description", () => {
    const tools = setup({ toolDescriptionMode: "tiny" });
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("## Guidelines");
  });

  it("compact keeps every load-bearing contract — fails when a behavior change forgets compact", () => {
    const tools = setup({ toolDescriptionMode: "compact" });
    const desc: string = tools.get("Agent").description;
    // One keyword per behavioral contract the orchestrator must know about.
    // If you change one of these behaviors, update BOTH descriptions.
    for (const contract of [
      "background",
      "resume",
      "steer_subagent",
      ".pi/agents/",
      "self-contained",
    ]) {
      expect(desc).toContain(contract);
    }
  });

  // The compact test above pins the prose alone, which is right for compact —
  // it is the only place that mode states these. `full` is different: several
  // contracts are stated twice, in the description AND in the param schema, so
  // pinning prose alone would block a legitimate move of one into the other
  // while missing the failure that actually matters — a contract that ends up
  // in neither. Asserting over description + schema is the invariant that
  // survives either choice. The second test then keeps the schema half honest,
  // so "it's also in the schema" can never degrade to an empty stub.
  it("full states every load-bearing contract in the description or the schema", () => {
    const tool = setup().get("Agent");
    const visible = `${tool.description}\n${JSON.stringify(tool.parameters)}`;
    for (const contract of [
      "background",
      "resume",
      "steer_subagent",
      ".pi/agents/",
      "self-contained",
      "model",
      "thinking",
      "inherit_context",
    ]) {
      expect(visible).toContain(contract);
    }
  });

  it("every exposed strategy param carries a real description of its own", () => {
    const props = setup().get("Agent").parameters?.properties ?? {};
    expect(props.run_in_background).toBeUndefined();
    for (const name of ["model", "thinking", "inherit_context"]) {
      // Long enough to be an explanation the model can act on, not a bare label.
      expect(props[name]?.description?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("custom mode renders the project template with placeholders substituted", () => {
    const tools = setup({ toolDescriptionMode: "custom" }, () => {
      writeFileSync(
        join(tmpDir, ".pi", "agent-tool-description.md"),
        "My agents:\n{{typeList}}\n\nGlobal dir: {{agentDir}}\nUnknown: {{nope}}\nCost: $& stays literal",
      );
    });
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("My agents:");
    expect(desc).toContain("- general-purpose:"); // {{typeList}} expanded
    expect(desc).toContain(`Global dir: ${hermeticAgentDir}`); // {{agentDir}} expanded
    expect(desc).toContain("Unknown: {{nope}}"); // unknown placeholder left verbatim
    expect(desc).toContain("Cost: $& stays literal"); // no $-pattern expansion
    expect(desc).not.toContain("## Usage notes");
  });

  it("custom mode falls back to the global file when no project file exists", () => {
    const tools = setup({ toolDescriptionMode: "custom" }, () => {
      writeFileSync(join(hermeticAgentDir, "agent-tool-description.md"), "GLOBAL CUSTOM\n{{compactTypeList}}");
    });
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("GLOBAL CUSTOM");
    expect(desc).toContain("- Explore: Fast read-only search agent for locating code. (Tools:");
  });

  it("{{scheduleGuideline}} expands to the schedule bullet when scheduling is on (default)", () => {
    const tools = setup({ toolDescriptionMode: "custom" }, () => {
      writeFileSync(join(tmpDir, ".pi", "agent-tool-description.md"), "RULES:{{scheduleGuideline}}\nEND");
    });
    const desc: string = tools.get("Agent").description;
    // The expansion carries its own leading "\n- " bullet.
    expect(desc).toContain("RULES:\n- Use `schedule` only when");
  });

  it("{{scheduleGuideline}} expands to the empty string when scheduling is disabled", () => {
    const tools = setup({ toolDescriptionMode: "custom", schedulingEnabled: false }, () => {
      writeFileSync(join(tmpDir, ".pi", "agent-tool-description.md"), "RULES:{{scheduleGuideline}}\nEND");
    });
    const desc: string = tools.get("Agent").description;
    expect(desc).toContain("RULES:\nEND");
    expect(desc).not.toContain("schedule");
  });

  it("every documented placeholder is replaced — no {{ }} residue", () => {
    const tools = setup({ toolDescriptionMode: "custom" }, () => {
      writeFileSync(
        join(tmpDir, ".pi", "agent-tool-description.md"),
        "A {{typeList}} B {{compactTypeList}} C {{agentDir}} D {{scheduleGuideline}} F",
      );
    });
    const desc: string = tools.get("Agent").description;
    expect(desc).not.toContain("{{");
    expect(desc).not.toContain("}}");
  });

  it("the shipped example template renders byte-identical to the full description", async () => {
    // Guards examples/agent-tool-description.md against going stale: it must
    // reproduce the full description exactly. If you edit one, edit the other.
    const example = readFileSync(EXAMPLE_TEMPLATE, "utf-8");
    const tools = setup({ toolDescriptionMode: "custom" }, () => {
      writeFileSync(join(tmpDir, ".pi", "agent-tool-description.md"), example);
    });
    const customDesc: string = tools.get("Agent").description;

    // Second instance in the same hermetic cwd, flipped to full mode.
    writeFileSync(join(tmpDir, ".pi", "subagents.json"), JSON.stringify({ toolDescriptionMode: "full" }));
    const second = makePi();
    subagentsExtension(second.pi);
    try {
      expect(customDesc).toBe(second.tools.get("Agent").description);
    } finally {
      await second.handlers.get("session_shutdown")?.({}, { hasUI: false, ui: {} } as any);
    }
  });

  it("custom mode without a file falls back to the full description with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const tools = setup({ toolDescriptionMode: "custom" });
      const desc: string = tools.get("Agent").description;
      expect(desc).toContain("## Guidelines");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no agent-tool-description.md found"));
    } finally {
      warn.mockRestore();
    }
  });

  // README:87 promises that disabling scheduling "removes `schedule` from the
  // `Agent` tool spec (no LLM-context cost)". Only the {{scheduleGuideline}}
  // TEXT expansion was tested — nothing asserted the schema itself, so the
  // parameter could keep costing tokens (and stay callable) while the prose
  // claimed otherwise.
  describe("schedulingEnabled gates the schedule parameter", () => {
    const props = (tools: Map<string, any>) =>
      Object.keys(tools.get("Agent").parameters?.properties ?? {});

    it("advertises `schedule` by default", () => {
      expect(props(setup())).toContain("schedule");
    });

    it("removes `schedule` from the tool schema when scheduling is disabled", () => {
      const names = props(setup({ schedulingEnabled: false }));
      expect(names).not.toContain("schedule");
      // The rest of the parameter surface is untouched — this gates one field,
      // not the tool.
      expect(names).toEqual(expect.arrayContaining(["prompt", "description", "subagent_type"]));
    });
  });

  // Worktree isolation is frontmatter-only: the Agent tool neither advertises
  // nor accepts an `isolation` parameter, and no description may tell the model
  // to pass one. There is no schema half to gate on `worktreeIsolation` — the
  // setting refuses worktree creation on every path directly.
  describe("worktree isolation stays out of the Agent tool surface", () => {
    const props = (tools: Map<string, any>) =>
      Object.keys(tools.get("Agent").parameters?.properties ?? {});

    it("never advertises an `isolation` parameter", () => {
      const names = props(setup());
      expect(names).not.toContain("isolation");
      // The rest of the parameter surface is untouched — one field, not the tool.
      expect(names).toEqual(expect.arrayContaining(["prompt", "description", "subagent_type", "schedule"]));
    });

    it("never tells the model to pass isolation in the full description", () => {
      expect(setup().get("Agent").description).not.toContain('isolation: "worktree"');
    });

    it("compact mode says nothing about isolation either", () => {
      const desc: string = setup({ toolDescriptionMode: "compact" }).get("Agent").description;
      expect(desc).not.toContain("isolation");
      // The bullet above it survives — the removal trims a suffix, not the list.
      expect(desc).toContain("resume continues a previous agent by ID");
    });

    it("disabling worktreeIsolation changes nothing about the tool surface", () => {
      const tools = setup({ worktreeIsolation: false });
      const names = props(tools);
      expect(names).not.toContain("isolation");
      expect(tools.get("Agent").description).not.toContain("isolation");
      expect(names).toEqual(expect.arrayContaining(["prompt", "description", "subagent_type", "schedule"]));
    });
  });

  // The description no longer embeds the roster (agent_info('list') supplies
  // it on demand), so the honesty contract — the only thing the orchestrator
  // LLM knows about an agent's capabilities before spawning it — moved to that
  // tool's output. `tools: none` and an `ext:`-only `tools:` both parse to zero
  // built-ins (custom-agents.ts parseToolsField), and test/fixtures/.pi/agents/
  // tools-none.md pins that the *runtime* really does drop every built-in. So
  // the list must not claim otherwise — an agent advertised as having `bash`
  // that cannot run `bash` gets routed work it can only fail at.
  describe("tool scope suffix reflects the real built-in set", () => {
    function withAgent(name: string, frontmatter: string, settings?: Record<string, unknown>) {
      const extra = frontmatter ? `${frontmatter}\n` : "";
      return setup(settings, () => {
        mkdirSync(join(tmpDir, ".pi", "agents"), { recursive: true });
        writeFileSync(
          join(tmpDir, ".pi", "agents", `${name}.md`),
          `---\ndescription: ${name} agent.\n${extra}---\n\nBody.\n`,
        );
      });
    }

    async function listTypes(tools: Map<string, any>): Promise<string> {
      const tool = tools.get("agent_info");
      const result = await tool.execute("call-1", { sub: "list" }, undefined, undefined, {});
      return result.content[0].text as string;
    }

    it("`tools: none` never claims the full built-in set", async () => {
      const text = await listTypes(withAgent("quiet", "tools: none"));
      expect(text).not.toContain("quiet - quiet agent. (Tools: *)");
    });

    it("`tools: none` says none only when the agent can call nothing at all", async () => {
      // extensions: false and isolated: true both leave the agent with zero
      // built-ins AND zero extension tools — the one case "none" is true.
      for (const fm of ["tools: none\nextensions: false", "tools: none\nisolated: true"]) {
        const text = await listTypes(withAgent("silent", fm));
        expect(text).toContain("silent - silent agent. (Tools: none)");
      }
    });

    it("`tools: none` with extensions loaded is not described as having no tools", async () => {
      // Zero built-ins is not zero tools: test/fixtures/.pi/agents/tools-none.md
      // pins that such an agent still surfaces alpha_read, alpha_write, beta_tool.
      // Saying "none" understates it and routes work away from the only agent
      // that could do it — the mirror of the bug this suffix used to have.
      const text = await listTypes(withAgent("probe", 'tools: none\nextensions: "./ext-alpha.mjs"'));
      expect(text).toContain("probe - probe agent. (Tools: no built-ins, extension tools only)");
      expect(text).not.toContain("probe - probe agent. (Tools: *)");
      expect(text).not.toContain("probe - probe agent. (Tools: none)");
    });

    it("an ext:-only `tools:` is described by what it actually has", async () => {
      const text = await listTypes(withAgent("extonly", 'tools: "ext:probe.mjs"'));
      expect(text).toContain("extonly - extonly agent. (Tools: no built-ins, extension tools only)");
      expect(text).not.toContain("extonly - extonly agent. (Tools: *)");
    });

    it("compact mode carries no roster — the suffix contract lives on agent_info('list')", async () => {
      const tools = withAgent("quiet", "tools: none\nextensions: false", { toolDescriptionMode: "compact" });
      expect(tools.get("Agent").description).not.toContain("quiet - quiet agent.");
      const text = await listTypes(tools);
      expect(text).toContain("quiet - quiet agent. (Tools: none)");
      expect(text).not.toContain("quiet - quiet agent. (Tools: *)");
    });

    it("an omitted `tools:` still renders as * — absent means all built-ins", async () => {
      // Guards the fix from over-correcting: undefined (inherit everything,
      // as the shipped defaults do) is not the same as [] (explicitly zero).
      const text = await listTypes(withAgent("broad", ""));
      expect(text).toContain("broad - broad agent. (Tools: *)");
    });

    it("a narrowed `tools:` still lists the names it actually has", async () => {
      const text = await listTypes(withAgent("narrow", "tools: read, grep"));
      expect(text).toContain("narrow - narrow agent. (Tools: read, grep)");
    });
  });

  describe("agent_info — the on-demand info tool", () => {
    async function callInfo(tools: Map<string, any>, params: Record<string, unknown>) {
      const tool = tools.get("agent_info");
      const result = await tool.execute("call-1", params, undefined, undefined, {});
      return result.content[0].text as string;
    }

    it("registers with the four subs plus the name param", () => {
      const tool = setup().get("agent_info");
      expect(tool).toBeDefined();
      const literals = tool.parameters.properties.sub.anyOf.map((s: any) => s.const);
      expect([...literals].sort()).toEqual(["create", "guidelines", "info", "list"]);
      expect(tool.parameters.properties.name).toBeDefined();
    });

    it("'list' returns the agent roster with provenance markers and tool suffixes", async () => {
      const tools = setup({}, () => {
        mkdirSync(join(tmpDir, ".pi", "agents"), { recursive: true });
        writeFileSync(
          join(tmpDir, ".pi", "agents", "audit.md"),
          "---\ndescription: Audit agent.\ntools: read, grep\n---\n\nBody.\n",
        );
      });
      const text = await callInfo(tools, { sub: "list" });
      expect(text).toContain("# Defined Agents");
      expect(text).toContain("• audit - Audit agent. (Tools: read, grep)");
      // Defaults carry no marker, custom project agents do. The roster is what
      // replaced the embedded type list in the description.
      expect(text).toContain("Explore -");
      expect(text).toContain("• = project  ◦ = global");
    });

    it("'guidelines' returns the registered full description", async () => {
      const tools = setup();
      const text = await callInfo(tools, { sub: "guidelines" });
      expect(text).toBe(tools.get("Agent").description);
    });

    it("'info' returns the agent file's frontmatter and requires a name", async () => {
      const tools = setup({}, () => {
        mkdirSync(join(tmpDir, ".pi", "agents"), { recursive: true });
        writeFileSync(
          join(tmpDir, ".pi", "agents", "audit.md"),
          "---\ndescription: Audit agent.\ntools: read, grep\nisolation: worktree\n---\n\nBody.\n",
        );
      });
      const missing = await callInfo(tools, { sub: "info" });
      expect(missing).toContain("'name' parameter is required");
      const fm = await callInfo(tools, { sub: "info", name: "audit" });
      expect(fm).toContain("description: Audit agent.");
      expect(fm).toContain("isolation: worktree");
      const unknown = await callInfo(tools, { sub: "info", name: "nope" });
      expect(unknown).toContain('Agent not found: "nope"');
    });

    it("'create' documents the frontmatter field set final after the rebase decisions", async () => {
      const text = await callInfo(setup(), { sub: "create" });
      for (const field of [
        "**name**",
        "**display_name**",
        "**tools**",
        "**model**",
        "**thinking**",
        "**max_turns**",
        "**prompt_mode**",
        "**inherit_context**",
        "**memory**",
        "**isolated**",
        "**isolation**",
        "**persist_session**",
        "**allowed_subagents**",
        "**enabled**",
      ]) {
        expect(text).toContain(field);
      }
      // 1r7: no background/foreground selector — runs always in the background.
      expect(text).not.toContain("run_in_background");
      // 8lw: worktree isolation is frontmatter-only — no Agent tool parameter.
      expect(text).toContain("frontmatter-only");
    });
  });
});
