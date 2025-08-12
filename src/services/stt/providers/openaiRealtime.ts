type WSLike = {
	send: (data: any) => void
	close: () => void
	onopen: ((this: any, ev: any) => any) | null
	onmessage: ((this: any, ev: any) => any) | null
	onerror: ((this: any, ev: any) => any) | null
	onclose: ((this: any, ev: any) => any) | null
}

export class OpenAIRealtimeClient {
	private ws: WSLike | null = null
	private onTranscriptCb: ((t: string, f: boolean) => void) | null = null
	private onErrorCb: ((e: Error) => void) | null = null
	private bufferedText = ""
	private language?: string

	constructor(private opts: { apiKey?: string; language?: string }) {}

	onTranscript(cb: (text: string, final: boolean) => void) {
		this.onTranscriptCb = cb
	}
	onError(cb: (err: Error) => void) {
		this.onErrorCb = cb
	}

	async start(opts: { language?: string }) {
		this.language = opts.language ?? this.opts.language
		const key = this.opts.apiKey
		if (!key) {
			this.emitError(new Error("Missing OpenAI API key"))
			return
		}

		const subprotocols = ["realtime", `openai-insecure-api-key.${key}`, "openai-beta.realtime-v1"]

		const url = "wss://api.openai.com/v1/realtime?intent=transcription"

		const WSImpl: any =
			(globalThis as any).WebSocket ||
			(() => {
				try {
					const ws = require("ws")
					return ws
				} catch {
					return null
				}
			})()

		if (!WSImpl) {
			this.emitError(new Error("WebSocket implementation not available"))
			return
		}

		const ws: WSLike = new WSImpl(url, subprotocols)
		this.ws = ws

		ws.onopen = () => {
			if (this.language) {
				try {
					ws.send(
						JSON.stringify({
							type: "session.update",
							session: {
								input_audio_format: { type: "pcm16", sample_rate_hz: 16000 },
								language: this.language,
							},
						}),
					)
				} catch {}
			}
		}

		ws.onmessage = (ev: any) => {
			try {
				const data = typeof ev.data === "string" ? ev.data : (ev.data?.toString?.() ?? "")
				const msg = JSON.parse(data)

				const type = msg?.type as string

				if (type && (type.includes("delta") || type.endsWith(".delta"))) {
					const delta = msg.delta ?? msg.output_text_delta ?? msg.text ?? ""
					if (typeof delta === "string" && delta.length > 0) {
						this.bufferedText += delta
						this.onTranscriptCb?.(this.bufferedText, false)
					}
					return
				}

				if (
					type === "response.completed" ||
					type === "response.output_text.done" ||
					type === "transcript.completed"
				) {
					const finalText = msg.output_text ?? msg.text ?? msg.transcript ?? this.bufferedText
					this.bufferedText = finalText || this.bufferedText
					this.onTranscriptCb?.(this.bufferedText, true)
					return
				}

				if (type && (type.includes("snapshot") || type.endsWith(".content"))) {
					const text = msg.text ?? msg.output_text
					if (typeof text === "string") {
						this.bufferedText = text
						this.onTranscriptCb?.(text, false)
					}
				}
			} catch (e: any) {
				this.emitError(e)
			}
		}

		ws.onerror = (_e: any) => {
			this.emitError(new Error("WebSocket error"))
		}
		ws.onclose = () => {}
	}

	sendPcm(chunk: Uint8Array) {
		const ws = this.ws
		if (!ws) return
		try {
			const audioB64 = Buffer.from(chunk).toString("base64")
			ws.send(
				JSON.stringify({
					type: "input_audio_buffer.append",
					audio: audioB64,
				}),
			)
		} catch (e: any) {
			this.emitError(e)
		}
	}

	requestTranscription() {
		const ws = this.ws
		if (!ws) return
		try {
			ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
			ws.send(
				JSON.stringify({
					type: "response.create",
					response: { modalities: ["text"] },
				}),
			)
		} catch (e: any) {
			this.emitError(e)
		}
	}

	async stop() {
		try {
			this.requestTranscription()
		} catch {}
		if (this.ws) {
			try {
				this.ws.close()
			} catch {}
			this.ws = null
		}
	}

	private emitError(e: Error) {
		if (this.onErrorCb) this.onErrorCb(e)
	}
}

export async function createOpenAIRealtimeClient(params: { apiKey?: string; language?: string }) {
	return new OpenAIRealtimeClient({ apiKey: params.apiKey, language: params.language })
}
