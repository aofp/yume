#!/bin/bash

# yurucode UI Demo Script for macOS
# Interactive demo showcasing all UI features

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# Demo configuration
DEMO_DELAY=2
TYPING_DELAY=0.05

# Function to simulate typing
type_text() {
    for (( i=0; i<${#1}; i++ )); do
        echo -n "${1:$i:1}"
        sleep $TYPING_DELAY
    done
    echo ""
}

# Function to show demo step
demo_step() {
    echo ""
    echo -e "${CYAN}┌────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│ $1${NC}"
    echo -e "${CYAN}└────────────────────────────────────────────────────────────┘${NC}"
    sleep $DEMO_DELAY
}

# Function to show keyboard shortcut
show_shortcut() {
    echo -e "${YELLOW}  ⌨️  Press: ${MAGENTA}$1${NC} ${GRAY}→ $2${NC}"
    sleep 1
}

# Function to show message
show_message() {
    echo -e "${GREEN}  💬 ${NC}$1"
    sleep 1
}

# Main demo
main() {
    clear
    echo -e "${MAGENTA}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                    yurucode UI Demo                         ║
║                  macOS Edition v1.0.0                       ║
║                                                              ║
║              Minimal Claude UI with OLED Theme              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    echo -e "${BLUE}This demo will showcase all UI features and interactions.${NC}"
    echo -e "${GRAY}Press Enter to continue after each step...${NC}"
    read -r
    
    # Demo 1: Window and Theme
    demo_step "Demo 1: Window & OLED Theme"
    echo -e "${GRAY}  The app features an ultra-minimal black OLED theme${NC}"
    echo -e "${GRAY}  with pastel red (#ff9999) and magenta (#ff99cc) accents${NC}"
    echo ""
    echo -e "  🎨 Theme Features:"
    echo -e "     ${RED}●${NC} Pure black background (#000000)"
    echo -e "     ${MAGENTA}●${NC} Pastel accent colors"
    echo -e "     ${GRAY}●${NC} No pointer cursors (cursor: default)"
    echo -e "     ${GRAY}●${NC} All lowercase text"
    echo -e "     ${GRAY}●${NC} Tabler icons (no emojis)"
    read -r
    
    # Demo 2: Multi-Tab Sessions
    demo_step "Demo 2: Multi-Tab Sessions"
    show_shortcut "Ctrl+T" "Create new tab/session"
    show_message "Each tab maintains its own Claude session"
    show_message "Sessions are isolated and can run concurrently"
    echo ""
    echo -e "  📑 Tab Management:"
    show_shortcut "Ctrl+Tab" "Navigate to next tab"
    show_shortcut "Ctrl+Shift+Tab" "Navigate to previous tab"
    show_shortcut "Ctrl+W" "Close current tab"
    show_shortcut "Ctrl+1-9" "Jump to tab by number"
    read -r
    
    # Demo 3: Concurrent Streaming Test
    demo_step "Demo 3: Concurrent Streaming (FIXED!)"
    echo -e "${GREEN}  ✅ Issue Fixed: Multiple tabs can now stream simultaneously!${NC}"
    echo ""
    echo -e "  🔧 Improvements implemented:"
    echo -e "     • Queue-based process spawning"
    echo -e "     • Process group isolation (detached: true)"
    echo -e "     • Anti-race condition delays (200-500ms)"
    echo -e "     • Better process cleanup with kill(-pid)"
    echo ""
    echo -e "${BLUE}  Try it: Open 2+ tabs and send messages simultaneously${NC}"
    read -r
    
    # Demo 4: Model Selection
    demo_step "Demo 4: Model Selection"
    show_shortcut "Ctrl+O" "Toggle between Opus/Sonnet"
    echo ""
    echo -e "  🤖 Available Models:"
    echo -e "     ${MAGENTA}●${NC} Claude Opus 4.1 (default)"
    echo -e "     ${CYAN}●${NC} Claude 3.5 Sonnet"
    echo ""
    show_message "Model indicator shown in input area"
    read -r
    
    # Demo 5: Message Features
    demo_step "Demo 5: Message Features"
    echo -e "  📝 Message Types:"
    echo -e "     • User messages (right-aligned)"
    echo -e "     • Assistant messages (left-aligned)"
    echo -e "     • Tool use indicators"
    echo -e "     • Thinking blocks (collapsible)"
    echo -e "     • Code blocks with syntax highlighting"
    echo ""
    show_shortcut "Right-click" "Context menu with copy option"
    show_shortcut "Ctrl+F" "Search in messages"
    read -r
    
    # Demo 6: Session Management
    demo_step "Demo 6: Session Management"
    show_shortcut "Ctrl+L" "Clear context (start fresh)"
    show_shortcut "Ctrl+R" "Recent projects modal"
    echo ""
    echo -e "  💾 Session Features:"
    echo -e "     • Auto-save session state"
    echo -e "     • Resume interrupted sessions"
    echo -e "     • Title generation (1-3 words)"
    echo -e "     • Token usage tracking"
    read -r
    
    # Demo 7: Streaming Control
    demo_step "Demo 7: Streaming Control"
    show_shortcut "Escape" "Stop streaming/close modals"
    echo ""
    echo -e "  🔄 Streaming Features:"
    echo -e "     • Real-time token counting"
    echo -e "     • 'thinking...' indicator"
    echo -e "     • Health checks every 5 seconds"
    echo -e "     • Graceful interruption"
    read -r
    
    # Demo 8: Analytics & Tokens
    demo_step "Demo 8: Analytics & Token Tracking"
    echo -e "  📊 Token Analytics:"
    echo -e "     • Input tokens (accumulative)"
    echo -e "     • Output tokens (accumulative)"
    echo -e "     • Cache tokens tracked"
    echo -e "     • Per-conversation totals"
    echo ""
    show_message "Token counts use += for proper accumulation"
    read -r
    
    # Demo 9: Window Controls
    demo_step "Demo 9: Window Controls"
    echo -e "  🪟 Window Features:"
    echo -e "     • Custom window decorations"
    echo -e "     • Transparent background"
    echo -e "     • Size: 516x509px (default)"
    echo ""
    show_shortcut "Ctrl+0" "Reset zoom"
    show_shortcut "Ctrl+Plus" "Zoom in"
    show_shortcut "Ctrl+Minus" "Zoom out"
    show_shortcut "F12" "Open DevTools"
    read -r
    
    # Demo 10: Error Recovery
    demo_step "Demo 10: Error Recovery"
    echo -e "  ⚡ Recovery Features:"
    echo -e "     • Automatic reconnection"
    echo -e "     • Session persistence"
    echo -e "     • Queue recovery after errors"
    echo -e "     • Timeout detection (health checks)"
    echo ""
    echo -e "${YELLOW}  If streaming gets stuck:${NC}"
    echo -e "     1. Press Escape to stop"
    echo -e "     2. Send a new message to continue"
    echo -e "     3. Or use Ctrl+L to clear and restart"
    read -r
    
    # Test Commands
    demo_step "Demo 11: Test Commands"
    echo -e "${BLUE}  Sample prompts to test concurrent sessions:${NC}"
    echo ""
    echo -e "  Tab 1:"
    type_text "  'Create a Python fibonacci function'"
    echo ""
    echo -e "  Tab 2:"
    type_text "  'Explain quantum computing in simple terms'"
    echo ""
    echo -e "  Tab 3:"
    type_text "  'Write a bash script to backup files'"
    echo ""
    echo -e "${GREEN}  Send all three simultaneously to test fixes!${NC}"
    read -r
    
    # Summary
    clear
    echo -e "${CYAN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                    Demo Complete! 🎉                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    echo -e "${GREEN}Key Fixes Applied:${NC}"
    echo "  ✅ Concurrent sessions now work properly"
    echo "  ✅ Process isolation improved"
    echo "  ✅ Queue-based spawning prevents race conditions"
    echo "  ✅ Better error recovery and cleanup"
    echo ""
    
    echo -e "${BLUE}Quick Reference:${NC}"
    echo "  • New tab: Ctrl+T"
    echo "  • Switch tabs: Ctrl+Tab"
    echo "  • Clear: Ctrl+L"
    echo "  • Toggle model: Ctrl+O"
    echo "  • Stop: Escape"
    echo ""
    
    echo -e "${MAGENTA}Testing Instructions:${NC}"
    echo "  1. Open yurucode app"
    echo "  2. Create multiple tabs (Ctrl+T)"
    echo "  3. Send messages in each tab simultaneously"
    echo "  4. Verify all tabs stream without timeouts"
    echo ""
    
    echo -e "${GRAY}Run ./test-suite-macos.sh for automated testing${NC}"
}

# Run demo
main "$@"