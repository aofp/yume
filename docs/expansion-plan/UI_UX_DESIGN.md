# Multi-Provider UI/UX Design Plan

## Core Philosophy
**"Minimal Configuration, Maximum Power."**
Yume should remain clean and focused. Provider configuration should be accessible but not intrusive. The default experience remains Claude, with other providers opting-in via a seamless "switch."

## 1. Welcome Screen Integration

### Current State
The Welcome Screen features a clean "New Tab" button (+) and recent projects list.

### Proposed Design: The "Provider Badge"
Instead of a complex setup wizard on the welcome screen, we introduce a **Contextual Provider Switcher**.

- **Location:** Next to the "New Tab" (+) button or the version badge.
- **Visual:** A small, pill-shaped badge showing the *active* provider icon (e.g., Anthropic logo, Google G, OpenAI swirl).
- **Interaction:**
  1.  **Click:** Opens a small popover menu to switch active providers for the *next* session.
  2.  **Menu Items:**
      - **Claude** (Default)
      - **Gemini** (Grayed out if not configured)
      - **Codex** (Grayed out if not configured)
      - *Separator*
      - **"Configure Providers..."** (Links to Settings)

### "First Run" Experience for New Providers
If a user selects an unconfigured provider (e.g., Gemini):
1.  Do not fail.
2.  Open a minimal "Quick Setup" modal specific to that provider.
3.  Ask only for essentials: `Binary Path` (if custom) and show auth instructions (CLI login or env vars).

## 2. Settings Modal: "Providers" Tab

### Structure
Add a new tab **"Providers"** between "General" and "Plugins".

### Layout (Clean & minimal)
A list of cards for each provider.

#### Card State: Inactive
- **Icon + Name** (e.g., "Google Gemini")
- **Status:** "Not Configured"
- **Action:** "Enable" button.

#### Card State: Active
- **Toggle:** On/Off switch.
- **Model Selection:** Dropdown for default model (e.g., `gemini-1.5-pro`).
- **Configuration Fields (Collapsible):**
  - **Binary Source:** [Bundled `yume-cli`] | [Native CLI] | [WSL Path] | [Custom Path]
  - **Auth Status:** Indicator showing if the provider is authenticated (e.g., `gcloud auth print-access-token`, `gh auth status`, or presence of env vars).
  - **Custom Flags:** Text input for specific CLI flags (e.g., `--profile work`).

*Note:* Users are responsible for authenticating via their terminal. Yume will provide a "Open Terminal" shortcut to facilitate this.

### Provider Status States (UI)
- **Missing Binary:** `yume-cli` not found or custom path invalid.
- **Unauthenticated:** CLI present but token fetch fails.
- **Unsupported Model:** Model not in allowed list.
- **Degraded Mode:** Provider lacks tool calls; tool features disabled with a banner.

## 3. Analytics & Token Tracking

### Data Structure Challenge
Currently, `SessionAnalytics` hardcodes `opus` and `sonnet`.

### Backend Change
Refactor the store to use a generic map:
```typescript
interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cost: number;
}

// Inside SessionAnalytics
tokens: {
  // ... existing fields
  byProvider: {
    [providerName: string]: {
      total: TokenUsage;
      byModel: { [modelId: string]: TokenUsage };
    }
  }
}
```

### UI Adjustments (Analytics Modal)
1.  **Top Bar Filter:** Add a dropdown "Provider: All" (default).
    - Selecting "Claude" shows only Anthropic stats.
    - Selecting "Gemini" shows Google stats.
2.  **Cost Estimation:**
    - Update cost calculation logic to look up rates based on the `provider + model` key, not just the model name.
    - Warning: Different providers have vastly different pricing (Gemini 1.5 Flash is cheap/free, GPT-4o is expensive). Ensure rates are updated.
3.  **Visuals:**
    - Color-code providers in the usage charts (e.g., Claude=Purple, Gemini=Blue, OpenAI=Green).

## 4. Implementation Steps (Frontend)

1.  **Store Update:**
    - Add `selectedProvider` to `ClaudeCodeStore`.
    - Add `providerConfigs` map to `ClaudeCodeStore`.
2.  **Welcome Screen:**
    - Component: `ProviderSwitcher.tsx`.
    - Inject into `WelcomeScreen.tsx` buttons container.
3.  **Settings:**
    - Create `Settings/ProvidersTab.tsx`.
    - Add to `SettingsModalTabbed.tsx`.
4.  **Analytics:**
    - Update `AnalyticsModal.tsx` to handle dynamic model keys.
    - Refactor `cost` calculation utilities.

## 5. Compatibility Check
- **Persistence:** Ensure `providerConfigs` are saved to `localStorage` (exclude API keys if possible, or encrypt them like we do for license keys).
- **Graceful Fallback:** If a user opens an old session created with "Claude", the UI should respect that session's historical provider, even if the global setting changed.
