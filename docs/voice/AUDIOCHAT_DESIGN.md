# AUDIOCHAT_DESIGN.md

Title: Roo-Code Voice Input (Audio Chat) — Phase 1 Design and Phase 2 Plan

Status: Draft
Owner: @BinaryBeastMaster
Scope: Planning/Analysis (no implementation yet)
Last updated: 2025-08-11

Overview
Roo-Code will add optional voice input to the chat box. The MVP integrates a cloud STT provider (OpenAI Whisper Realtime) with configurable auto-send on silence. Phase 2 adds a local/offline STT option to eliminate ongoing costs, while keeping professional cloud providers selectable.

Free-tier summary (recurring vs. trial credits)
- OpenAI Whisper (Realtime)
  - Recurring monthly free tier: None
  - Trials/credits: None advertised; pay-as-you-go after enabling billing
  - Source: https://openai.com/api/pricing
- Deepgram
  - Recurring monthly free tier: None
  - Trials/credits: One-time $200 signup credit; then pay-as-you-go (no minimums)
  - Source: https://deepgram.com/pricing
- AssemblyAI
  - Recurring monthly free tier: None
  - Trials/credits: One-time $50 credit for evaluation (limited concurrency)
  - Source: https://www.assemblyai.com/pricing/
- Google Cloud Speech-to-Text v2
  - Recurring monthly free tier: None specific to STT v2
  - Trials/credits: New GCP users often get general $300 credits (not recurring; can be used for STT)
  - Source: https://cloud.google.com/speech-to-text/pricing

Notes
- Terms and prices can change; verify during setup.
- Cloud streaming STT is generally inexpensive (~$0.24–$0.96 per hour depending on provider/model and account plan).

Goals and Non-goals
- Goals
  - Enable dictation into the chat input with live interim and final transcripts.
  - Make auto-send on silence configurable with a user-defined silence delay.
  - Keep voice fully optional and off by default; no breaking changes to existing chat UX.
  - Provide a provider-agnostic interface to allow adding more providers later.
- Non-goals (Phase 1)
  - Wake word detection, diarization, translation, and advanced NLP.
  - Multi-channel audio routing, noise profiling, or room calibration.

User experience (Phase 1)
- Mic entry points
  - Mic button in ChatTextArea toolbar with tooltip reflecting state.
  - Push-to-Talk (PTT) hotkey by default (e.g., hold Cmd/Ctrl+M); configurable binding.
- Transcript display
  - Interim transcript appears in the textarea styled subtly (gray/italic).
  - Final transcript replaces interim seamlessly.
- Sending behavior
  - Not auto-send by default; user can edit and press Enter.
  - Optional send-on-release (off by default).
  - Optional auto-send on silence after a configurable delay (default 3000 ms).
- Visual states
  - Idle → Recording → Streaming → Waiting for silence → Sent
  - Small input level indicator (waveform/level bar).
- Accessibility
  - Keyboard-only operation, ARIA labels, visible focus states.
- Device selection
  - Input device dropdown (default system mic); remember selection per workspace.

Settings schema (initial)
- voice.sttProvider: "openai-realtime" | "local" | future providers
- voice.apiKey: stored in VS Code SecretStorage
- voice.language: "auto" | BCP-47 (default "en-US")
- voice.autoSendOnSilence: boolean
- voice.silenceDelayMs: number (default 3000)
- voice.pushToTalk: boolean (default true)
- voice.sendOnRelease: boolean (default false)
- voice.inputNoiseSuppression: boolean
- voice.inputAutoGainControl: boolean
- voice.inputEchoCancellation: boolean
- voice.localServerUrl: string (Phase 2)
- voice.punctuationEnabled: boolean (provider-dependent; default true)
- voice.profanityFilterEnabled: boolean (provider-dependent; default false)
- voice.sessionMaxMinutes: number (default 5)

Provider selection and roadmap
- Phase 1 default: OpenAI Whisper Realtime over WebSocket
- Future cloud providers: Deepgram, AssemblyAI, Google STT v2 (as optional “professional” choices)
- Phase 2 local/offline: faster-whisper or whisper-cpp via a local server (HTTP or WebSocket)

Architecture and integration points
- Webview UI (React)
  - webview-ui/src/components/chat/ChatTextArea.tsx
    - Add mic button, device selector, PTT handling, interim/final rendering, state indicators.
  - webview-ui/src/utils/vscode.ts
    - Use postMessage to send sttStart/sttChunk/sttStop and receive insertTextIntoTextarea + voice state updates.
- Extension host (VS Code)
  - src/core/webview/webviewMessageHandler.ts
    - Handle sttStart/sttChunk/sttStop from the webview; route to SttSession.
  - src/core/webview/ClineProvider.ts
    - Manage per-webview SttSession lifecycle and push transcript updates to the webview (insertTextIntoTextarea).
  - src/shared/WebviewMessage.ts
    - Add types: "sttStart" | "sttChunk" | "sttStop" | "voiceState"
    - Extend insertTextIntoTextarea payload to include mode: "interim" | "final".
  - New modules
    - src/services/stt/providers/openaiRealtime.ts
      - Minimal WS client for Realtime Whisper.
    - src/services/stt/session.ts
      - Provider-independent session controller (VAD/silence, timers, auto-send, error handling).

Event and data flow
1) Webview captures mic audio via getUserMedia({ audio: { noiseSuppression, autoGainControl, echoCancellation, deviceId? } })
2) Webview posts:
   - sttStart: { sampleRate, encoding: "pcm16", language?, deviceId? }
   - sttChunk: ArrayBuffer PCM16 frames at 20–50 ms cadence
   - sttStop: {}
3) Extension opens provider WS on sttStart (auth via SecretStorage API key), forwards sttChunk frames.
4) Provider returns interim and final transcript events; SttSession relays insertTextIntoTextarea with mode = "interim" | "final".
5) Endpointing:
   - SttSession runs energy-based VAD + hangover.
   - On silence detected, start silenceDelayMs timer; if no speech resumes and autoSendOnSilence = true, auto-send current transcript; else just finalize and stop.
6) Webview updates UI state (voiceState) and shows transcript; if auto-send triggers, the chat input is cleared after send.

Silence detection and endpointing
- Client-side VAD:
  - Compute RMS/energy per audio frame, thresholds with hysteresis.
  - Hangover to prevent rapid toggling; debounce with silenceDelayMs.
- Provider endpointing (if available):
  - When provider offers endpointing signals, treat them as hints; still apply user-configured delay as a debounce for auto-send.
- Config exposure:
  - Only silenceDelayMs is exposed; internal thresholds remain fixed to reduce complexity.

Quality controls
- Language
  - Prefer "auto"; allow manual language override via setting.
- Punctuation/casing and profanity filter (provider-dependent)
  - Toggleable; default punctuation on, profanity filter off.
- Browser audio controls
  - Toggle echo cancellation, noise suppression, and AGC when supported.

Reliability and error handling
- Errors surfaced clearly:
  - Mic permission denied, no input device, missing/invalid API key, billing required, network/WS disconnect, rate limited, session max duration reached.
- Retry and backoff:
  - Retry transient network errors with exponential backoff; cap attempts per session; do not duplicate sends.
- Safe fallbacks:
  - If provider fails mid-session, preserve any interim transcript in the textarea; stop cleanly and inform the user.
- Session timeout:
  - Stop automatically after voice.sessionMaxMinutes to cap billing and avoid hanging sessions.

Privacy, compliance, transparency
- First-run disclosure:
  - A one-time note that audio is streamed to the selected provider; link to provider policy.
- Data retention:
  - Link doc page explaining provider retention policies; no audio is stored by Roo-Code.
- Optional redaction:
  - Client-side redaction list for common secret patterns before streaming; off by default.

Telemetry (opt-in)
- Collect only non-content event counts (no audio, no transcripts):
  - start, stop, failure, auto-send triggered, send-on-release used
- Disabled by default; respect VS Code telemetry settings.

Provider abstraction
- Interface (per provider)
  - startStream(opts) → { sendPcm(frame), stop(), onTranscript(cb), onError(cb) }
- Provider config map
  - Flags for server-side endpointing, max chunk size, keepalive, language option hints.
- Backpressure
  - Drop or coalesce frames under load to maintain real-time behavior; never block UI thread.

Testing strategy
- Unit tests
  - VAD/endpointing behavior around silenceDelayMs, including edge cases (low-volume, long pauses).
  - Message contracts for sttStart/sttChunk/sttStop; insertTextIntoTextarea mode handling.
  - Error surfaces and teardown pathways.
- Integration tests
  - Mock provider (local WS) emitting interim/final transcripts.
  - End-to-end flow: webview mic capture → transcripts → optional auto-send.
- Manual test checklist
  - Mic permission flow, device switching, hotkey PTT, interim/final rendering, error injection, network toggle, session timeout.

Phase 2: Local/offline and “professional” options
- Local server (faster-whisper/whisper-cpp)
  - Docs for CPU vs. GPU, model recommendations, expected latency, RAM/VRAM needs.
  - Health check endpoint; auto-detect availability to enable "local" in provider selection.
- Cloud providers
  - Add Deepgram/AssemblyAI/Google STT with provider modules and per-provider settings.
- Benchmarks
  - Snapshot doc of latency/accuracy/cost across cloud vs. local on a standard sample set.
- Power-user settings
  - Chunk size, downsampling, max utterance duration, reconnect behavior.

“Start without paying” note (docs)
- Use trial credits to evaluate:
  - Deepgram: $200 signup credit
  - AssemblyAI: $50 credit (eval concurrency limits)
  - Google Cloud: $300 general credits on new accounts (usable for STT)
- Then switch to local mode in Phase 2 for ongoing zero cost.
- Setup checklist:
  - Enter API key (SecretStorage), enable Voice, set auto-send and silence delay, verify mic permissions, and select provider/local.

Open questions
- Default PTT hotkey (Cmd/Ctrl+M proposed) — confirm or adjust.
- Default language value ("en-US" vs. "auto") — proposed default "en-US" with "auto" available.
- Default sessionMaxMinutes (5 proposed).

Risks and mitigations
- Browser audio quirks: gate controls behind feature detection; provide informative fallbacks.
- Network instability: retries with backoff and stop gracefully; preserve interim text.
- Provider changes: abstract via provider interface; document flags and endpoints.

Rollout plan
- Feature-flag gated; off by default.
- Add “Voice” section to Extension Settings and docs.
- Ship Phase 1 with Whisper first; monitor issues; iterate.
- Phase 2: local server docs + provider, then additional cloud providers.

Changelog (planned)
- Phase 1: Add voice input (optional), Whisper Realtime provider, silence auto-send option, silence delay, PTT, device selector, error handling, basic tests, telemetry opt-in.
- Phase 2: Local provider option, more providers, benchmarks, advanced configs.
