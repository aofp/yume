#!/bin/bash

# Add macOS permissions to Info.plist after build
# This script is called by Tauri after building the app

PLIST_FILE="$1"

if [ -z "$PLIST_FILE" ]; then
    echo "Error: No Info.plist file specified"
    exit 1
fi

if [ ! -f "$PLIST_FILE" ]; then
    echo "Error: Info.plist file not found: $PLIST_FILE"
    exit 1
fi

echo "Adding macOS permissions to: $PLIST_FILE"

# Add microphone permission
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string 'yurucode needs access to your microphone for dictation and voice input features.'" "$PLIST_FILE" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :NSMicrophoneUsageDescription 'yurucode needs access to your microphone for dictation and voice input features.'" "$PLIST_FILE"

# Add speech recognition permission
/usr/libexec/PlistBuddy -c "Add :NSSpeechRecognitionUsageDescription string 'yurucode needs access to speech recognition to convert your voice to text.'" "$PLIST_FILE" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :NSSpeechRecognitionUsageDescription 'yurucode needs access to speech recognition to convert your voice to text.'" "$PLIST_FILE"

# Add accessibility permission (for enhanced dictation)
/usr/libexec/PlistBuddy -c "Add :NSAccessibilityUsageDescription string 'yurucode needs accessibility permissions to support dictation and voice input.'" "$PLIST_FILE" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :NSAccessibilityUsageDescription 'yurucode needs accessibility permissions to support dictation and voice input.'" "$PLIST_FILE"

# Add Apple Events permission (for system integration)
/usr/libexec/PlistBuddy -c "Add :NSAppleEventsUsageDescription string 'yurucode needs to control system events for enhanced functionality.'" "$PLIST_FILE" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :NSAppleEventsUsageDescription 'yurucode needs to control system events for enhanced functionality.'" "$PLIST_FILE"

echo "macOS permissions added successfully"