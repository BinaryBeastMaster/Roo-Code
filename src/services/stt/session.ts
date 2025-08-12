export type TranscriptEvent = { text: string; final?: boolean }

export interface SttClient {
	start(options: { language?: string }): Promise<void>
	sendPcm(data: ArrayBuffer | Uint8Array): void
	stop(): Promise<void>
	onTranscript(cb: (e: TranscriptEvent) => void): void
	onError(cb: (err: Error) => void): void
}

export interface SilenceOptions {
	delayMs: number
	autoSend: boolean
}

export class SttSession {
	private onTranscriptCb?: (e: TranscriptEvent) => void
	private onErrorCb?: (err: Error) => void

	constructor(private client: SttClient, private silence: SilenceOptions) {}

	onTranscript(cb: (e: TranscriptEvent) => void) {
		this.onTranscriptCb = cb
	}
	onError(cb: (err: Error) => void) {
		this.onErrorCb = cb
	}

	async start(language?: string) {
		await this.client.start({ language })
	}

	sendPcm(data: ArrayBuffer | Uint8Array) {
		this.client.sendPcm(data)
	}

	async stop() {
		await this.client.stop()
	}
}
