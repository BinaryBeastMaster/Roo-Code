import type { ToolName } from "@roo-code/types"

/**
 * Decision returned by the Prompt Preprocessor.
 */
export type PreprocessorDecision =
	| {
			decision: "tool"
			tool: { name: ToolName; params: Record<string, string> }
			big?: undefined
			reasoning?: string
	  }
	| {
			decision: "big"
			big?: { notes?: string }
			tool?: undefined
			reasoning?: string
	  }

/**
 * Arguments for the preprocessor.
 */
export interface PreprocessorArgs {
	latestUserText: string
	allowedTools: readonly string[]
	settings: {
		provider: string
		modelId: string
		temperature: number
	}
}

/**
 * Lightweight, conservative preprocessor:
 * - Heuristics-only (no model call) to keep integration minimal and safe.
 * - Prefers routing to BIG unless user intent clearly matches a single safe tool.
 * - Emits at most one tool when confident; otherwise returns "big".
 *
 * Notes:
 * - This module is provider-agnostic; settings are accepted for future extensibility.
 * - Initial heuristics intentionally conservative to avoid accidental tool misuse.
 */
export const promptPreprocessor = {
	decide({ latestUserText, allowedTools }: PreprocessorArgs): PreprocessorDecision {
		const text = (latestUserText || "").trim()
		const ltext = text.toLowerCase()

		const can = (toolName: string) => allowedTools.includes(toolName)

		// Minimal, conservative heuristics for an initial version:
		// 1) Explicit search intent -> codebase_search (if available)
		const explicitSearch =
			ltext.startsWith("search ") ||
			ltext.startsWith("find ") ||
			ltext.includes("grep ") ||
			ltext.includes("regex ") ||
			ltext.includes("where is ") ||
			ltext.includes("locate ")

		if (explicitSearch && can("codebase_search")) {
			// Use the whole ask as query to keep it simple/safe initially.
			return {
				decision: "tool",
				tool: {
					name: "codebase_search" as ToolName,
					params: {
						query: text,
					},
				},
				reasoning: "Explicit search intent detected; routing to codebase_search",
			}
		}

		// 2) Explicit list files intent -> list_files (if available)
		const explicitListFiles =
			ltext.startsWith("list files") ||
			ltext.includes("show files") ||
			ltext.includes("what files are in") ||
			ltext.includes("ls ")

		if (explicitListFiles && can("list_files")) {
			return {
				decision: "tool",
				tool: {
					name: "list_files" as ToolName,
					params: {
						path: ".",
						recursive: "false",
					},
				},
				reasoning: "Explicit list files intent detected; routing to list_files",
			}
		}

		// Default: route to BIG with condensed prompt (the task loop sets condensed flag)
		return {
			decision: "big",
			big: { notes: "No confident single-tool match; route to BIG (condensed) for analysis." },
			reasoning: "Conservative default to avoid accidental tool misuse",
		}
	},
}
