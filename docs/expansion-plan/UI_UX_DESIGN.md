# Multi-Provider UI/UX Design Plan

**Implementation Status:** Multi-provider support is designed but not yet enabled. Feature flags `PROVIDER_GEMINI_AVAILABLE` and `PROVIDER_OPENAI_AVAILABLE` are currently `false` in `config/features.ts`.

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
- **Model Selection:** Dropdown for default model (e.g., `gemini-2.5-pro`).
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

## 6. Session Migration & Provider Switching

### Switching Providers Mid-Session

When a user attempts to switch providers during an active session:

```
┌─────────────────────────────────────────────────┐
│  Switch to Gemini?                              │
│                                                 │
│  Your current session uses Claude. Switching    │
│  providers will start a new session.            │
│                                                 │
│  Current session will be saved and accessible   │
│  in the Recent Conversations list.              │
│                                                 │
│  [Cancel]                    [Start New Session]│
└─────────────────────────────────────────────────┘
```

### Implementation

```typescript
// In claudeCodeStore.ts
async function switchProvider(newProvider: Provider): Promise<void> {
  const currentSession = get().activeSession;

  if (currentSession && currentSession.messages.length > 0) {
    // Show confirmation modal
    const confirmed = await modalService.confirm({
      title: `Switch to ${newProvider.displayName}?`,
      message: `Your current session uses ${currentSession.provider}. Switching providers will start a new session.`,
      confirmText: 'Start New Session',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    // Save current session to history
    await saveSessionToHistory(currentSession);
  }

  // Update provider and create new session
  set({
    selectedProvider: newProvider.id,
    activeSession: createNewSession(newProvider),
  });
}
```

### Session History UX

The Recent Conversations modal should show provider badges:

```
┌─────────────────────────────────────────────────┐
│  Recent Conversations                           │
├─────────────────────────────────────────────────┤
│  [Claude] Refactor authentication module        │
│  2 hours ago · 24 messages                      │
├─────────────────────────────────────────────────┤
│  [Gemini] Analyze performance bottlenecks       │
│  Yesterday · 12 messages                        │
├─────────────────────────────────────────────────┤
│  [OpenAI] Generate test fixtures                │
│  2 days ago · 8 messages                        │
└─────────────────────────────────────────────────┘
```

### Cross-Provider Limitations

When resuming a session:
- Sessions can only be resumed with their original provider
- Show tooltip: "This session was created with Claude and must be continued with Claude"
- Disable "Resume" button if provider is not available

```typescript
function canResumeSession(session: Session): { canResume: boolean; reason?: string } {
  const providerConfig = getProviderConfig(session.provider);

  if (!providerConfig.enabled) {
    return {
      canResume: false,
      reason: `${session.provider} is not enabled. Enable it in Settings → Providers.`,
    };
  }

  if (!providerConfig.isAuthenticated) {
    return {
      canResume: false,
      reason: `${session.provider} requires authentication.`,
    };
  }

  return { canResume: true };
}
```

## 7. Provider Status Indicators

### Tab Bar Integration

Each tab should show a subtle provider indicator:

```
┌──────────────┬──────────────┬──────────────┐
│ 🟣 Project A │ 🔵 Analysis  │ 🟢 Tests     │
└──────────────┴──────────────┴──────────────┘
  Claude         Gemini         OpenAI
```

Color Legend:
- 🟣 Purple: Claude (Anthropic)
- 🔵 Blue: Gemini (Google)
- 🟢 Green: OpenAI

### Context Bar Provider Badge

The context bar (above the input) should show the active provider:

```
┌─────────────────────────────────────────────────┐
│  [Claude Sonnet 4.5] │ 42K / 200K tokens │ $0.12 │
└─────────────────────────────────────────────────┘
```

Clicking the badge opens a quick-switch menu (same as Welcome Screen switcher).

## 8. Error States & Degradation

### Provider Unavailable

When a provider becomes unavailable mid-session:

```
┌─────────────────────────────────────────────────┐
│  ⚠️ Gemini Unavailable                          │
│                                                 │
│  Could not connect to Gemini API.               │
│  Error: Rate limit exceeded (429)               │
│                                                 │
│  [Retry]  [Switch to Claude]  [View Details]    │
└─────────────────────────────────────────────────┘
```

### Degraded Mode Banner

When a provider lacks feature support:

```
┌─────────────────────────────────────────────────┐
│  ℹ️ Limited features with OpenAI                 │
│  MCP and prompt caching are not available.      │
│  [Learn More]                          [Dismiss]│
└─────────────────────────────────────────────────┘
```

## 9. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+P` | Open provider switcher |
| `Cmd+Shift+1` | Switch to Claude |
| `Cmd+Shift+2` | Switch to Gemini |
| `Cmd+Shift+3` | Switch to OpenAI |

## 10. Settings: Providers Tab Layout

```
┌─────────────────────────────────────────────────┐
│  Providers                                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🟣 Claude                    [Enabled ✓] │   │
│  │ Status: Connected                        │   │
│  │ Model: claude-sonnet-4-5-20250929       │   │
│  │ [Configure]                              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔵 Gemini                    [Disabled]  │   │
│  │ Status: Not configured                   │   │
│  │ [Enable]                                 │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🟢 OpenAI                    [Disabled]  │   │
│  │ Status: API key not set                  │   │
│  │ [Enable]                                 │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ───────────────────────────────────────────   │
│                                                 │
│  Default Provider: [Claude ▼]                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Provider Configuration Modal

When clicking "Configure" or "Enable":

```
┌─────────────────────────────────────────────────┐
│  Configure Gemini                               │
├─────────────────────────────────────────────────┤
│                                                 │
│  Authentication                                 │
│  ○ gcloud CLI (recommended)                     │
│    Status: ✓ Authenticated as user@gmail.com    │
│    [Re-authenticate]                            │
│                                                 │
│  ○ API Key                                      │
│    Set GOOGLE_API_KEY environment variable      │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Default Model                                  │
│  [gemini-2.5-pro ▼]                            │
│                                                 │
│  Context Compaction Threshold                   │
│  [80%] (800K tokens for 1M context)            │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [Test Connection]              [Save] [Cancel] │
└─────────────────────────────────────────────────┘
```
