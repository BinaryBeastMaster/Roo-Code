## Project Objective and Conflict Policy

- Objective: Integrate a Prompt Preprocessor into the Roo Code VS Code extension to reduce token usage and cost by routing only essential questions/context to large models, while preserving Roo’s one‑tool‑per‑message workflow and approval gates.
- Minimal‑invasion mandate: We must inject into the existing pipeline with the smallest viable change set, reuse existing modules and flows, avoid new global state, and keep behavior identical when the feature flag is off.
- Conflict policy: If any proposed change conflicts with this objective or increases invasiveness (e.g., duplicating logic already present, bypassing presenter/validation, adding server‑side execution), stop and request clarification and plan adjustment instead of proceeding.

## Remaining Implementation Tasks (Minimal Intrusion)

- Settings and flag
    - Add enablePromptPreprocessor (default false) to Roo Code Settings (Experiments) in [src/package.json](src/package.json:1) and expose via provider state.
- Redirector wiring
    - Single decision point before SYSTEM_PROMPT build: if flag off use original path; if on, call Preprocessor and either emit one tool_use block or set metadata.useCondensedPrompt.
- Condensed prompt builder
    - Add condensed option to [SYSTEM_PROMPT](src/core/prompts/system.ts:134) that omits [getSharedToolUseSection](src/core/prompts/sections/tool-use.ts:1) and [getToolDescriptionsForMode](src/core/prompts/tools/index.ts:1) while keeping essential rules/objective.
- Provider metadata passthrough
    - Honor metadata.useCondensedPrompt in [openai.ts](src/api/providers/openai.ts:81), [openai-native.ts](src/api/providers/openai-native.ts:100), [anthropic.ts](src/api/providers/anthropic.ts:39) without altering existing special‑case logic.
- Prompt Preprocessor module
    - Minimal function returning { decision: tool|big, tool?, big? }; reuse tool names and existing validation paths (no server‑side execution).
- Telemetry reuse
    - Aggregate usage emitted by providers to compute “saved tokens” metric; record only when feature enabled.
- Tests
    - Unit: preprocessor decisions; condensed prompt snapshots.
    - Integration: read_file → condensed BIG → attempt_completion; apply_diff path; GPT‑5 Responses path in [openai-native.ts](src/api/providers/openai-native.ts:216).
- Safeguards
    - Respect gating for codebase_search availability as in [tools/index.ts](src/core/prompts/tools/index.ts:1).
    - Maintain one‑tool‑per‑message and .rooignore protections via existing presenter/tool code.
    - Fallbacks: preprocessor error → legacy path; BIG error → optional legacy retry once.

# Roo Dual‑Model Orchestrator (Prompt Preprocessor) Implementation Plan

> Plan Review Acknowledgment

- Reviewed with explicit requirement to inject into existing workflow with minimal custom code, reusing existing modules and functions wherever feasible.
- Integration strategy: a thin Prompt Preprocessor decision step before provider calls; condensed prompt via an option on existing [SYSTEM_PROMPT](src/core/prompts/system.ts:134); providers honor a small metadata flag (useCondensedPrompt); no server-side tool execution; preserve one-tool-per-message and approval flow.
- Implementation constraints checklist:
    - Do not change tool definitions or [presentAssistantMessage](src/core/assistant-message/presentAssistantMessage.ts:54) flow.
    - Reuse [validateToolUse](src/core/assistant-message/presentAssistantMessage.ts:357), existing providers’ usage accounting, and TelemetryService.
    - No new global state; feature-flagged (enablePromptPreprocessor=false by default).
- Acceptance criteria:
    - With flag off, behavior and prompts are identical to current.
    - With flag on, BIG prompts exclude tool catalogs; token savings recorded; tool behavior unchanged.
    - Feature is big-model agnostic: works with any main provider selected by the user without provider-specific logic beyond honoring metadata.useCondensedPrompt.
    - Preprocessor provider is configurable and extensible; model id is user-entered text; temperature and other model options are configurable in settings.

Objective

- Reduce token usage and cost by keeping tool catalogs and busy‑work instructions out of large model prompts.
- Integrate a lightweight Prompt Preprocessor that:
    - decides whether to use a tool next or to call the BIG model,
    - builds a condensed BIG prompt without tool catalogs when analysis is needed.
- Preserve Roo’s one‑tool‑per‑message contract and approval workflow without an external relay.

Key Integration Points

- System prompt assembly and tool catalog:
    - [system prompt builder](src/core/prompts/system.ts:1)
    - [tool‑use banner](src/core/prompts/sections/tool-use.ts:1)
    - [tool catalogs per mode](src/core/prompts/tools/index.ts:1)
- Provider dispatch and message formatting (OpenAI/Anthropic/native/routers):
    - [OpenAI compatible handler](src/api/providers/openai.ts:1)
    - [OpenAI native handler](src/api/providers/openai-native.ts:1)
    - [Anthropic handler](src/api/providers/anthropic.ts:1)
    - [Router base](src/api/providers/router-provider.ts:1)
- Assistant message parsing and tool execution:
    - [stream parser](src/core/assistant-message/parseAssistantMessageV2.ts:1)
    - [presenter and tool execution orchestrator](src/core/assistant-message/presentAssistantMessage.ts:1)

High‑Level Approach

- Add an internal Prompt Preprocessor that:
    1. inspects the user input + minimal conversation context,
    2. decides whether to emit a single tool call or to call the BIG model,
    3. when calling BIG, requests a condensed system prompt with only essential guidance.
- BIG receives role, essential constraints, and specific question/context — not Roo’s full tool inventory.
- If BIG returns plain text, auto‑wrap into attempt_completion before feeding the existing parser.

New Modules and Files

- [prompt-preprocessor.ts](src/core/orchestration/prompt-preprocessor.ts:1)

    - Exports promptPreprocessor.decide() returning:
        - decision: "tool" | "big"
        - tool?: { name: ToolName, params: Record<string, any> }
        - big?: { condensedPrompt: string, messages: Anthropic.Messages.MessageParam[] }
        - reasoning: string
    - Inputs:
        - latest user message, compact conversation/context summary, optional last tool result preview,
        - allowed tools for the current mode (names only).
    - Uses a configured small model (default gpt‑4o‑mini or provider alias); pluggable provider.

- [condensed-prompt.ts](src/core/prompts/condensed-prompt.ts:1)

    - buildCondensedPrompt(options) returns a compact system prompt by omitting:
        - getSharedToolUseSection()
        - getToolDescriptionsForMode()
    - Keeps:
        - role definition and essential rules,
        - minimal environment facts required by the BIG model,
        - task objective and selected dynamic context.

- [preprocessor-integration.ts](src/core/orchestration/preprocessor-integration.ts:1)
    - Hooks into the Task loop to:
        1. run promptPreprocessor.decide() before any provider call,
        2. if decision = tool: inject a synthetic tool_use block into cline.assistantMessageContent (respecting one‑tool‑per‑message),
        3. if decision = big: call provider with condensed prompt and minimal messages via metadata.useCondensedPrompt.

Provider Changes

- Big‑model agnostic integration:
    - All SingleCompletionHandler implementations must remain unchanged except to honor a generic metadata.useCondensedPrompt flag and optional condensed systemPrompt. No provider‑specific branching in the preprocessor or presenter.
- Add optional condensed prompt handling:
    - [OpenAiHandler.createMessage()](src/api/providers/openai.ts:81) honors metadata?.useCondensedPrompt and passed systemPrompt.
    - [OpenAiNativeHandler.createMessage()](src/api/providers/openai-native.ts:100) honors the same for chat and Responses API.
    - [AnthropicHandler.createMessage()](src/api/providers/anthropic.ts:39) accepts condensed systemPrompt via metadata flag.
- Preserve existing special cases (o1/o3/GPT‑5 Responses, streaming) and usage accounting.

Task Loop Integration

- Integration point: the Task step just before building the SYSTEM_PROMPT and dispatching to a provider.
- Flow:
    1. Build a compact preprocessor input (latest user message + small context summary).
    2. promptPreprocessor.decide():
        - tool: append one tool_use block and route through [presentAssistantMessage](src/core/assistant-message/presentAssistantMessage.ts:54) for approval and execution.
        - big: call provider with { metadata: { useCondensedPrompt: true } } and the condensed system prompt.
    3. If the BIG reply has no tools, auto‑wrap the text in an attempt_completion tool before parsing.

Condensed Prompt Rules

- Keep
    - Mode role definition
    - Essential rules subset (security, one‑tool‑per‑message, streaming handling, file safety)
    - Objective, minimal system info (OS/shell/workspace hints)
- Drop
    - [getSharedToolUseSection](src/core/prompts/sections/tool-use.ts:1)
    - [getToolDescriptionsForMode](src/core/prompts/tools/index.ts:1)
    - Long catalogs and verbose formatting guidance
- Implement via [condensed-prompt.ts](src/core/prompts/condensed-prompt.ts:1) and a condensed option in [system.ts SYSTEM_PROMPT](src/core/prompts/system.ts:134).

Preprocessor Policy (Initial Heuristics)

- Choose a tool when:
    - The ask is to read/edit/search files, run commands, or inspect code (prefer codebase_search + read_file).
    - The previous step produced tool output that the user wants continued processing of.
- Choose BIG when:
    - The request is conceptual/synthesis or summarization based on already available context.
- Guardrails:
    - Emit at most one tool per decision.
    - For edits, prefer apply_diff or insert_content; require precise context or prior read_file.
    - Enforce mode tool allow‑list.

Telemetry and Token Accounting

- Track per‑stage metrics:
    - preprocessor: tokens in/out, latency
    - big: tokens in/out, latency
- Aggregate and display savings compared to the legacy single‑BIG flow.
- Usage sources:
    - [OpenAiHandler.processUsageMetrics](src/api/providers/openai.ts:246)
    - [OpenAiNativeHandler usage](src/api/providers/openai-native.ts:63)
    - [AnthropicHandler usage events](src/api/providers/anthropic.ts:148)
- Add a small accumulator and route to TelemetryService.

Configuration

- Settings (in Roo Code extension settings UI under Experiments, contributed via [src/package.json](src/package.json:1)):
    - enablePromptPreprocessor: boolean (default: false)
    - preprocessorProvider: enum dropdown (default: openai)
        - Initial options: ["openai"]
        - Designed to be extensible to additional providers (e.g., anthropic, openrouter, ollama) without changing the preprocessor core
    - preprocessorModelId: string (user‑entered; default: gpt‑4o‑mini)
        - Free‑form text field to allow any valid model name for the selected provider
    - preprocessorTemperature: number (default: 0.2)
    - condensedPromptEnabled: boolean (default: true)
    - preprocessorMaxContextChars: number (default: 2000)
- Provider/model governance:
    - Respect organization allow‑lists for providers/models.
    - If the selected preprocessorProvider/model is disallowed or misconfigured, fall back to legacy flow and surface a configuration warning (no server‑side execution).

Error Handling and Fallbacks

- If preprocessor errors:
    - Fall back to legacy flow (full prompt)
- If preprocessor chooses a tool that fails validation in [validateToolUse](src/core/assistant-message/presentAssistantMessage.ts:357):
    - Fall back to ask_followup_question to gather parameters.
- If BIG call fails:
    - Retry once using the legacy full prompt (feature‑flagged); otherwise surface the error.

Testing Plan

- Unit
    - preprocessor decisions for read/edit/search/command vs. conceptual requests; one‑tool cap.
    - condensed-prompt correctness; snapshot size reduction.
    - preprocessor-integration single tool injection and one‑tool‑per‑message enforcement.
- Integration
    - End‑to‑end: codebase_search → read_file → condensed BIG synthesis → attempt_completion.
    - Edit path: read_file → apply_diff with approval.
    - GPT‑5 Responses path via [OpenAiNativeHandler](src/api/providers/openai-native.ts:216).
- Non‑regression
    - With enablePromptPreprocessor=false, behavior identical to current.

Incremental Rollout

1. Land behind enablePromptPreprocessor=false.
2. Dogfood with telemetry.
3. Enable for OpenAI native/compatible; then Anthropic.
4. Add routers via [RouterProvider](src/api/providers/router-provider.ts:22).

Detailed Changes by File

- [src/core/prompts/system.ts](src/core/prompts/system.ts:1)
    - Add condensed=true option to omit tool sections and verbose guidance.
- [src/core/prompts/sections/tool-use.ts](src/core/prompts/sections/tool-use.ts:1)
    - No change; excluded when condensed.
- [src/core/prompts/tools/index.ts](src/core/prompts/tools/index.ts:1)
    - No change; excluded when condensed.
- [src/core/orchestration/prompt-preprocessor.ts](src/core/orchestration/prompt-preprocessor.ts:1) NEW
    - promptPreprocessor.decide(): Promise<Decision> as described.
- [src/core/orchestration/preprocessor-integration.ts](src/core/orchestration/preprocessor-integration.ts:1) NEW
    - Injects tool_use or triggers condensed BIG call pre‑provider.
- [src/api/providers/openai.ts](src/api/providers/openai.ts:81)
    - Honor metadata.useCondensedPrompt and provided systemPrompt; preserve o1/o3 behavior.
- [src/api/providers/openai-native.ts](src/api/providers/openai-native.ts:100)
    - Same for chat and Responses flows; preserve reasoning/verbosity handling.
- [src/api/providers/anthropic.ts](src/api/providers/anthropic.ts:39)
    - Accept condensed systemPrompt when flagged.
- [src/core/assistant-message/parseAssistantMessageV2.ts](src/core/assistant-message/parseAssistantMessageV2.ts:1)
    - No change; preprocessor output uses existing tool XML.
- [src/core/assistant-message/presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts:54)
    - If BIG returns plain text and no tool, auto‑wrap into [attempt_completion](src/core/assistant-message/presentAssistantMessage.ts:517).

Preprocessor Prompt

- System: “You are the Roo Prompt Preprocessor. Decide the next single tool if required; otherwise route to BIG with condensed prompt.”
- Provider/model configuration:
    - Uses the configured preprocessorProvider and preprocessorModelId with preprocessorTemperature.
    - Default provider is openai; the provider list is extensible via settings and future adapters.
- Input: latest user ask, compact context (≤ preprocessorMaxContextChars), allowed tool names for current mode.
- Output JSON
  {
  "decision": "tool" | "big",
  "tool": {"name": "read_file", "params": {...}},
  "big": {"notes": "why condensed BIG is appropriate"},
  "reasoning": "brief"
  }
- Safety: Validate tool name against mode allow‑list before emitting.

Security and Constraints

- Preserve one‑tool‑per‑message via presenter.
- Honor .rooignore and protect flows in tools.
- No server‑side tool execution; preprocessor only suggests.

Telemetry and UI

- Record preprocessor decisions, latency, and tokens per stage; show “Saved X tokens this turn” in dev telemetry.

Rollback Lever

- Single flag: enablePromptPreprocessor.
- Providers ignore condensed flag if disabled.

Milestones

1. Skeleton: modules, flag, condensed builder, provider hooks
2. Happy path: read_file → condensed BIG → attempt_completion
3. Edit path: read_file → apply_diff with approval
4. GPT‑5 Responses validation
5. Telemetry + settings UI
6. Docs + staged rollout

Appendix: Relay v3 Parity Mapping

- Detection/wrapping by NANO → Prompt Preprocessor decide().
- BIG call with full history → condensed BIG call with minimal context via [condensed-prompt.ts](src/core/prompts/condensed-prompt.ts:1) and metadata.useCondensedPrompt.
- Tool wrapping → presenter auto‑wraps attempt_completion when appropriate.

## Experimental Settings and Redirector Flow

- Setting (Experimental section): `enablePromptPreprocessor`
    - Location: Roo Code Settings under Experiments.
    - Default: `false`
    - Scope: per-workspace
- Behavior:
    - Off (default): Original flow is preserved end-to-end. System prompt includes full tool catalogs; providers receive current prompts; no preprocessor invoked.
    - On: A lightweight redirector in the Task loop routes chats through the Prompt Preprocessor:
        1. Preprocessor decides either a single tool_use block (emitted to presenter) or a BIG call with a condensed system prompt.
        2. Providers honor `metadata.useCondensedPrompt` to avoid tool catalogs.
        3. If BIG returns plain text, it is wrapped once in `attempt_completion` before parsing.
- Non-invasive design:
    - Uses existing presenter, tool validation, and providers; no server-side tool execution.
    - Feature-flagged: disabling returns to original behavior without side effects.
      Note on Settings Scope
- All configuration is within the Roo Code VS Code extension itself (not generic VS Code). The feature flag is contributed via the extension’s settings schema in [src/package.json](src/package.json:1) under Experiments and is surfaced in the Roo Code Settings UI.

## Continuity and Completeness Review

Scope alignment

- Matches objective and conflict policy: minimal intrusion, reuse of existing flows, default-off flag, no server-side tool execution.
- Settings are within Roo Code extension settings UI (not generic VS Code), under Experiments.

End-to-end data flows

- Flag OFF: unchanged path

    1. Build full [SYSTEM_PROMPT](src/core/prompts/system.ts:134) including tool sections
    2. Provider handler ([openai.ts](src/api/providers/openai.ts:81), [openai-native.ts](src/api/providers/openai-native.ts:100), [anthropic.ts](src/api/providers/anthropic.ts:39)) called with standard params
    3. Streaming parsed by existing assistant-message parser; tools executed via presenter

- Flag ON: redirector path
    1. Preprocessor decision before SYSTEM_PROMPT build
    2. If “tool” → inject one tool_use block → [presentAssistantMessage](src/core/assistant-message/presentAssistantMessage.ts:54)
    3. If “big” → condensed SYSTEM_PROMPT (no tool catalogs) + metadata.useCondensedPrompt=true → provider call
    4. If BIG returns plain text → wrap once in attempt_completion; parser/presenter unchanged

Integration points and compatibility

- SYSTEM_PROMPT: add condensed option that omits [getSharedToolUseSection](src/core/prompts/sections/tool-use.ts:1) and [getToolDescriptionsForMode](src/core/prompts/tools/index.ts:1); retains essential rules/objective.
- Providers: createMessage already supports metadata; honoring metadata.useCondensedPrompt is additive and no-op when absent.
- Presenter, tools, validation, and .rooignore protections remain unchanged.

Gating and constraints

- codebase_search availability must mirror gating in [tools/index.ts](src/core/prompts/tools/index.ts:1).
- One-tool-per-message preserved by presenter.
- GPT‑5 continuity preserved (previous_response_id in [openai-native.ts](src/api/providers/openai-native.ts:216)).

Telemetry and tests

- Token/latency metrics reuse provider usage chunks; add small accumulator for “Saved tokens”.
- Tests cover unit decisions, condensed prompt snapshots, e2e flows (search→read→condensed BIG→completion; edit path; GPT‑5 Responses), and strict non‑regression with flag OFF.

Open items and acceptance gates

- Settings plumbing in [src/package.json](src/package.json:1), provider state threading, and redirector hook placement in Task loop.
- If any change increases invasiveness (duplicate logic, bypass presenter, new global state), stop and request clarification per policy.

Conclusion

- The plan is internally consistent and complete for a minimal, reversible integration. Remaining work is implementation per file list and tests under the feature flag.
