/**
 * Settings passed to system prompt generation functions
 */
export interface SystemPromptSettings {
	maxConcurrentFileReads: number
	todoListEnabled: boolean
	useAgentRules: boolean
	/**
	 * When true, build a condensed system prompt (omit tool catalogs and shared tool-use banner).
	 * This is set by the orchestrator when the Prompt Preprocessor routes to BIG.
	 */
	condensed?: boolean
}
