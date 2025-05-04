# Anthropic Extra URL Options - Implementation Plan

## Overview

This document outlines the plan for implementing a new feature that allows adding custom query parameters to Anthropic API requests. This enhancement will provide greater flexibility when interacting with the Anthropic API, particularly for testing beta features or working with custom Anthropic-compatible endpoints.

## Problem Statement

The current Anthropic provider allows setting a custom base URL, but it doesn't provide a way to add query parameters to the requests. When using the Anthropic SDK, it automatically constructs the full URL by appending API endpoints (like `/v1/messages`) to the base URL. However, there's no built-in way to add query parameters (like `?beta=true`) to these requests.

## Solution

Add a new configuration option called `anthropicExtraUrlOptions` that allows specifying query parameters to be appended to all Anthropic API requests. These query parameters will be added to the URL after the SDK has constructed the path.

For example:

- Base URL: `https://api.anthropic.com`
- SDK adds: `/v1/messages`
- Extra URL Options: `beta=true`
- Final URL: `https://api.anthropic.com/v1/messages?beta=true`

## Implementation Steps

### 1. Schema Update

Add a new field to the provider settings schema in `src/schemas/index.ts`:

```typescript
// In the providerSettingsSchema object
anthropicExtraUrlOptions: z.string().optional(),
```

Also update the `ProviderSettingsRecord` object in the same file:

```typescript
const providerSettingsRecord: ProviderSettingsRecord = {
	// ... existing fields
	anthropicExtraUrlOptions: undefined,
	// ... other fields
}
```

### 2. AnthropicHandler Modification

Modify the `createMessage` method in the `AnthropicHandler` class in `src/api/providers/anthropic.ts` to use the extra URL options:

```typescript
// In the createMessage method, when calling client.messages.create
const requestOptions: any = {}

// Add headers if needed (existing code)
if (betas.length > 0) {
	requestOptions.headers = { "anthropic-beta": betas.join(",") }
}

// Add query parameters if extra URL options are provided
if (this.options.anthropicExtraUrlOptions) {
	requestOptions.query = this.options.anthropicExtraUrlOptions
}

stream = await this.client.messages.create(
	{
		/* message parameters */
	},
	requestOptions,
)
```

Apply similar modifications to the `completePrompt` and `countTokens` methods to ensure all API requests include the extra URL options.

### 3. Testing

Test the implementation with various query parameters to ensure they are correctly appended to the URL and that the API requests work as expected.

## Usage Examples

### Setting the Extra URL Options

The value should be a valid query string without the leading `?`. For example:

- `beta=true`
- `version=2&feature=experimental`

### Testing Beta Features

```
beta=true
```

### Specifying API Version

```
api_version=2023-06-01
```

### Multiple Parameters

```
beta=true&debug=1&trace_id=abc123
```

## Technical Considerations

1. **Query String Format**: The value must be a valid query string without the leading `?`. Invalid query strings may cause API requests to fail.

2. **API Compatibility**: Not all query parameters may be supported by the Anthropic API. Refer to the Anthropic API documentation for supported parameters.

3. **Security**: Be cautious when using sensitive information in query parameters, as they may be logged or visible in network traffic.

4. **URL Length**: Very long query strings may exceed URL length limits. Keep the extra URL options concise.

5. **SDK Updates**: Future updates to the Anthropic SDK may change how requests are handled. This implementation may need to be updated accordingly.
