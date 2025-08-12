import { HTMLAttributes, useCallback } from "react"
import { Mic } from "lucide-react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type VoiceSettingsProps = HTMLAttributes<HTMLDivElement> & {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const VoiceSettings = ({ apiConfiguration, setApiConfigurationField, className, ...props }: VoiceSettingsProps) => {
	const { t } = useAppTranslation()

	const handleInput = useCallback(
		(field: keyof ProviderSettings) =>
			(e: Event | any) => {
				const value = (e.target as HTMLInputElement).value
				setApiConfigurationField(field, value)
			},
		[setApiConfigurationField],
	)

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:providers.apiKeyStorageNotice")}>
				<div className="flex items-center gap-2">
					<Mic className="w-4" />
					<div>{t("settings:sections.voice")}</div>
				</div>
			</SectionHeader>

			<Section>
				<VSCodeTextField
					value={apiConfiguration?.voiceApiKey || ""}
					type="password"
					onInput={handleInput("voiceApiKey")}
					placeholder={t("settings:placeholders.apiKey")}
					className="w-full"
				>
					<label className="block font-medium mb-1">{t("settings:providers.apiKey")}</label>
				</VSCodeTextField>
			</Section>
		</div>
	)
}
