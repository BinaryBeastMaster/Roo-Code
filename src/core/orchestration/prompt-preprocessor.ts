export type PreprocessorDecision =
        | { decision: "tool"; tool: { name: string; params: Record<string, unknown> }; reasoning?: string }
        | { decision: "big"; reasoning?: string }

export async function decidePreprocessor(): Promise<PreprocessorDecision> {
        return { decision: "big" }
}
