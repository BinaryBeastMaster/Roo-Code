import { HTMLAttributes, useCallback } from "react"
import { Mic } from "lucide-react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"
import { VSCodeTextField, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SetCachedStateField } from "./types"

type VoiceSettingsProps = HTMLAttributes<HTMLDivElement> & {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	voiceEnabled?: boolean
	setCachedStateField: SetCachedStateField<"voiceEnabled">
}

export const VoiceSettings = ({
	apiConfiguration,
	setApiConfigurationField,
	voiceEnabled,
	setCachedStateField,
	className,
	...props
}: VoiceSettingsProps) => {
	const { t } = useAppTranslation()

	const handleInput = useCallback(
		(field: keyof ProviderSettings) => (e: Event | any) => {
			const value = (e.target as HTMLInputElement).value
			setApiConfigurationField(field, value)
		},
		[setApiConfigurationField],
	)

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description="Enable voice input in chat using a speech‑to‑text backend. VS Code may prompt you to install “VS Code Speech” to enable microphone capture in this webview. API keys are stored securely in VS Code Secret Storage.">
				<div className="flex items-center gap-2">
					<Mic className="w-4" />
					<div>Voice (Experimental)</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={!!voiceEnabled}
						onChange={(e: any) => setCachedStateField("voiceEnabled", !!e.target.checked)}>
						<span className="font-medium">Enable voice input</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						Turn on a built-in mic-to-text flow powered by your configured STT backend.
					</div>
				</div>

				{voiceEnabled && (
					<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
						<div>
							<label className="block font-medium mb-1">STT Provider</label>
							<VSCodeDropdown
								value={(apiConfiguration as any)?.voiceSttProvider || "openai-realtime"}
								onChange={(e: any) => setApiConfigurationField("voiceSttProvider", e.target.value)}
								className="w-full">
								<VSCodeOption value="openai-realtime" className="p-2">
									OpenAI Realtime (Transcription)
								</VSCodeOption>
								<VSCodeOption value="local" className="p-2" disabled>
									Local (coming soon)
								</VSCodeOption>
							</VSCodeDropdown>
							<div className="text-[12px] opacity-70 mt-1">
								“VS Code Speech” is a mic capture helper; the STT provider actually does the
								transcription.
							</div>
						</div>

						<div>
							<label className="block font-medium mb-1">Mic capture method</label>
							<VSCodeDropdown
								value={(apiConfiguration as any)?.voiceMicCaptureMethod || "built-in"}
								onChange={(e: any) => setApiConfigurationField("voiceMicCaptureMethod", e.target.value)}
								className="w-full">
								<VSCodeOption value="built-in" className="p-2">
									Built-in (webview)
								</VSCodeOption>
								<VSCodeOption value="vscode-speech" className="p-2">
									VS Code Speech extension
								</VSCodeOption>
							</VSCodeDropdown>
							<div className="text-[12px] opacity-70 mt-1">
								If built-in capture is blocked, you’ll be prompted to install “VS Code Speech”.
							</div>
						</div>

						<div>
							<label className="block font-medium mb-1">API Key</label>
							<VSCodeTextField
								value={(apiConfiguration as any)?.voiceApiKey || ""}
								type="password"
								onInput={handleInput("voiceApiKey")}
								placeholder={t("settings:placeholders.apiKey")}
								className="w-full"
							/>
							<div className="text-[12px] opacity-70 mt-1">
								Used for OpenAI Realtime Whisper transcription. Save to enable the mic.
							</div>
						</div>
					</div>
				)}
			</Section>
		</div>
	)
}
