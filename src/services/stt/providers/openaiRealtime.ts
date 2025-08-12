export interface OpenAiRealtimeOptions {
	apiKey: string
	model?: string
	language?: string
}

export class OpenAiRealtimeClient {
	constructor(private opts: OpenAiRealtimeOptions) {}

	async start(_options?: { language?: string }) {
	}

	sendPcm(_data: ArrayBuffer | Uint8Array) {
	}

	async stop() {
	}

	onTranscript(_cb: (e: { text: string; final?: boolean }) => void) {}
	onError(_cb: (err: Error) => void) {}
}
