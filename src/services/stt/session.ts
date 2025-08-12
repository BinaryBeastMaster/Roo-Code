import type * as vscode from "vscode"
import { createOpenAIRealtimeClient } from "./providers/openaiRealtime"

export interface SttClient {
	start(opts: { language?: string }): Promise<void>
	sendPcm(chunk: Uint8Array): void
	stop(): Promise<void>
	onTranscript(cb: (text: string, final: boolean) => void): void
	onError(cb: (err: Error) => void): void
	requestTranscription?: () => void
}

export class SttSession {
	private client: SttClient | null = null
	private transcript = ""
	private onTranscriptCb: ((t: string, f: boolean) => void) | null = null
	private onVoiceStateCb: ((s: any) => void) | null = null
	private silenceTimer: any = null
	private speaking = false
	private lastSpeechTs = 0
	constructor(
		private opts: {
			webview: vscode.Webview
			apiKey?: string
			autoSendOnSilence: boolean
			silenceDelayMs: number
			language?: string
		},
	) {}

	onTranscript(cb: (text: string, final: boolean) => void) {
		this.onTranscriptCb = cb
	}
	onVoiceState(cb: (s: any) => void) {
		this.onVoiceStateCb = cb
	}

	async start(opts: { sampleRate: number; encoding: "pcm16"; language?: string }) {
		this.client = await createOpenAIRealtimeClient({
			apiKey: this.opts.apiKey,
			language: opts.language ?? this.opts.language,
		})
		this.client.onTranscript((text, final) => {
			this.transcript = text
			this.onTranscriptCb?.(text, final)
		})
		this.client.onError((_e) => {
			this.onVoiceStateCb?.({ error: "stt_error", isRecording: false, isStreaming: false })
		})
		await this.client.start({ language: opts.language ?? this.opts.language })
		this.onVoiceStateCb?.({ isRecording: true, isStreaming: true })
	}

	sendPcm(chunk: Uint8Array | number[] | ArrayBuffer) {
		if (!this.client) return
		let buf: Uint8Array
		if (chunk instanceof Uint8Array) buf = chunk
		else if (Array.isArray(chunk)) buf = new Uint8Array(chunk as number[])
		else buf = new Uint8Array(chunk)
		this.updateVad(buf)
		this.client.sendPcm(buf)
	}

	private updateVad(buf: Uint8Array) {
		let sum = 0
		for (let i = 0; i < buf.length; i += 2) {
			const sample = ((buf[i] | (buf[i + 1] << 8)) << 16) >> 16
			sum += sample * sample
		}
		const rms = Math.sqrt(sum / (buf.length / 2)) / 32768
		const now = Date.now()
		const threshold = 0.02
		const wasSpeaking = this.speaking
		this.speaking = rms > threshold
		if (this.speaking) {
			this.lastSpeechTs = now
			if (!wasSpeaking && this.silenceTimer) {
				clearTimeout(this.silenceTimer)
				this.silenceTimer = null
				this.onVoiceStateCb?.({ isRecording: true, isStreaming: true, silenceCountdownMs: 0 })
			}
		} else if (this.opts.autoSendOnSilence) {
			if (!this.silenceTimer) {
				this.onVoiceStateCb?.({
					isRecording: true,
					isStreaming: true,
					silenceCountdownMs: this.opts.silenceDelayMs,
				})
				this.silenceTimer = setTimeout(() => {
					if (this.client?.requestTranscription) {
						this.client.requestTranscription()
					}
					this.onTranscriptCb?.(this.transcript, true)
				}, this.opts.silenceDelayMs)
			}
		}
	}

	async stop() {
		if (this.silenceTimer) {
			clearTimeout(this.silenceTimer)
			this.silenceTimer = null
		}
		if (this.client?.requestTranscription) {
			this.client.requestTranscription()
		}
		this.onVoiceStateCb?.({ isRecording: false, isStreaming: false, silenceCountdownMs: 0 })
		await this.client?.stop()
		this.client = null
	}
}
