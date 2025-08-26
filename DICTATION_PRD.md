# PRD: Voice Dictation Feature

## Overview
Add voice dictation functionality to yurucode chat interface using browser's built-in Web Speech API for speech-to-text conversion.

## Requirements

### UI/UX
- **Location**: Bottom center of chat view, between ModelSelector and clear button
- **Button Style**: Match existing model-selector/clear/% used button styles
- **Icon**: Microphone icon (from Tabler Icons)
- **Colors**:
  - Inactive: Accent color (#ff9999)
  - Active (recording): Negative color (magenta)
- **Hotkey**: Ctrl+E toggles dictation on/off

### Functionality
- **Speech Recognition**: Use browser's built-in Web Speech Recognition API
- **Text Handling**: Append completed words to textarea in real-time
- **Continuous Mode**: Keep listening until manually stopped
- **Language**: English (US) by default
- **Visual Feedback**: Button changes color when active

## Technical Implementation

### Components
1. **DictationButton Component**: 
   - Manages speech recognition state
   - Handles start/stop logic
   - Updates textarea content

2. **Speech Recognition Setup**:
   ```javascript
   const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
   recognition.continuous = true;
   recognition.interimResults = true;
   recognition.lang = 'en-US';
   ```

3. **Event Handlers**:
   - `onresult`: Append transcribed text to textarea
   - `onerror`: Handle errors gracefully
   - `onend`: Auto-restart if still active

4. **Integration Points**:
   - Add to ClaudeChat.tsx context-bar
   - Access input state via props/callback
   - Handle Ctrl+E hotkey in existing keyboard handler

## User Flow
1. User clicks dictation button or presses Ctrl+E
2. Microphone permission requested (first time only)
3. Button turns magenta to indicate recording
4. User speaks, words appear in textarea
5. User clicks button again or presses Ctrl+E to stop
6. Button returns to accent color

## Edge Cases
- Browser doesn't support Speech Recognition API
- Microphone permission denied
- No microphone available
- Speech recognition errors
- Multiple tabs/instances running

## Success Criteria
- Seamless integration with existing UI
- Real-time transcription with low latency
- Clear visual feedback of recording state
- Proper error handling
- Works across Chrome, Edge, Safari (with webkit prefix)