/**
 * Banner Display
 * Shows ASCII art banner and welcome messages
 */

import chalk from 'chalk';
import { VERSION, DESCRIPTION } from '../cli/constants.js';

/**
 * ASCII art for Claude logo
 */
const CLAUDE_ASCII = `
   _____ _                 _      
  / ____| |               | |     
 | |    | | __ _ _   _  __| | ___ 
 | |    | |/ _\` | | | |/ _\` |/ _ \\
 | |____| | (_| | |_| | (_| |  __/
  \\_____|_|\\__,_|\\__,_|\\__,_|\\___|
`;

const CLAUDE_ASCII_SMALL = `
 Claude CLI
`;

/**
 * Display banner
 */
export function displayBanner(options = {}) {
  const {
    showVersion = true,
    showDescription = true,
    showAscii = true,
    small = false,
    color = true
  } = options;
  
  const chalkInstance = new chalk.Instance({ level: color ? 3 : 0 });
  let banner = '';
  
  // Add ASCII art
  if (showAscii) {
    const ascii = small ? CLAUDE_ASCII_SMALL : CLAUDE_ASCII;
    banner += chalkInstance.cyan.bold(ascii) + '\n';
  }
  
  // Add version
  if (showVersion) {
    banner += chalkInstance.gray(`Version ${VERSION}`) + '\n';
  }
  
  // Add description
  if (showDescription) {
    banner += chalkInstance.gray(wrapText(DESCRIPTION, 60)) + '\n';
  }
  
  // Add separator
  banner += chalkInstance.gray('─'.repeat(60)) + '\n';
  
  return banner;
}

/**
 * Display welcome message
 */
export function displayWelcome(username = null, options = {}) {
  const chalkInstance = new chalk.Instance({ level: options.color !== false ? 3 : 0 });
  
  let message = '\n';
  
  if (username) {
    message += chalkInstance.green(`Welcome back, ${username}!`) + '\n';
  } else {
    message += chalkInstance.green('Welcome to Claude CLI!') + '\n';
  }
  
  message += chalkInstance.gray('Type "help" for available commands or "exit" to quit.') + '\n';
  
  return message;
}

/**
 * Display goodbye message
 */
export function displayGoodbye(options = {}) {
  const chalkInstance = new chalk.Instance({ level: options.color !== false ? 3 : 0 });
  
  const messages = [
    'Goodbye! Thanks for using Claude CLI.',
    'See you later!',
    'Farewell! Come back soon.',
    'Until next time!',
    'Thanks for chatting!'
  ];
  
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  return '\n' + chalkInstance.cyan(message) + '\n';
}

/**
 * Display tips
 */
export function displayTips(options = {}) {
  const chalkInstance = new chalk.Instance({ level: options.color !== false ? 3 : 0 });
  
  const tips = [
    'You can save conversations using the "save" command',
    'Use arrow keys to navigate through command history',
    'Press Tab for command completion',
    'Use "clear" to clear the conversation',
    'You can pipe output to Claude: echo "text" | claude chat',
    'Use --stream flag for real-time responses',
    'Check for updates with: claude --version',
    'View all options with: claude --help',
    'You can continue previous conversations with --continue flag',
    'Use different models with --model flag'
  ];
  
  const tip = tips[Math.floor(Math.random() * tips.length)];
  
  return chalkInstance.yellow('💡 Tip: ') + chalkInstance.gray(tip);
}

/**
 * Display feature highlight
 */
export function displayFeature(feature, description, options = {}) {
  const chalkInstance = new chalk.Instance({ level: options.color !== false ? 3 : 0 });
  
  return chalkInstance.cyan.bold(`✨ ${feature}`) + '\n' + 
         chalkInstance.gray(`   ${description}`);
}

/**
 * Display update notification
 */
export function displayUpdateNotification(currentVersion, latestVersion, options = {}) {
  const chalkInstance = new chalk.Instance({ level: options.color !== false ? 3 : 0 });
  
  let notification = '\n' + chalkInstance.yellow.bold('📦 Update Available!') + '\n';
  notification += chalkInstance.gray(`Current version: ${currentVersion}`) + '\n';
  notification += chalkInstance.green(`Latest version: ${latestVersion}`) + '\n';
  notification += chalkInstance.gray('Run: npm install -g @anthropic-ai/claude-code') + '\n';
  
  return notification;
}

/**
 * Display loading animation frames
 */
export const LOADING_FRAMES = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['-', '\\', '|', '/'],
  circle: ['◐', '◓', '◑', '◒'],
  square: ['◰', '◳', '◲', '◱'],
  triangle: ['◢', '◣', '◤', '◥'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  pulse: ['·', '•', '●', '•'],
  bounce: ['⠁', '⠂', '⠄', '⠂']
};

/**
 * Create animated text
 */
export class AnimatedText {
  constructor(text, options = {}) {
    this.text = text;
    this.options = {
      animation: options.animation || 'typewriter',
      speed: options.speed || 50,
      color: options.color || 'cyan',
      stream: options.stream || process.stdout
    };
    
    this.chalkInstance = new chalk.Instance({ level: options.noColor ? 0 : 3 });
  }
  
  /**
   * Display with typewriter effect
   */
  async typewriter() {
    for (const char of this.text) {
      this.options.stream.write(this.chalkInstance[this.options.color](char));
      await this.sleep(this.options.speed);
    }
    this.options.stream.write('\n');
  }
  
  /**
   * Display with fade-in effect (simulated)
   */
  async fadeIn() {
    const colors = ['gray', 'white', this.options.color];
    
    for (const color of colors) {
      this.clearLine();
      this.options.stream.write(this.chalkInstance[color](this.text));
      await this.sleep(this.options.speed * 3);
    }
    this.options.stream.write('\n');
  }
  
  /**
   * Display with slide effect
   */
  async slide() {
    const width = process.stdout.columns || 80;
    
    for (let i = width; i >= 0; i--) {
      this.clearLine();
      const spaces = ' '.repeat(i);
      this.options.stream.write(spaces + this.chalkInstance[this.options.color](this.text));
      await this.sleep(this.options.speed / 2);
    }
    this.options.stream.write('\n');
  }
  
  /**
   * Start animation
   */
  async animate() {
    switch (this.options.animation) {
      case 'typewriter':
        return await this.typewriter();
      case 'fadeIn':
        return await this.fadeIn();
      case 'slide':
        return await this.slide();
      default:
        this.options.stream.write(this.chalkInstance[this.options.color](this.text) + '\n');
    }
  }
  
  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Clear current line
   */
  clearLine() {
    this.options.stream.write('\r' + ' '.repeat(process.stdout.columns || 80) + '\r');
  }
}

/**
 * Wrap text to specified width
 */
function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  
  return lines.join('\n');
}

/**
 * Create a box around text
 */
export function createBox(text, options = {}) {
  const {
    padding = 1,
    borderStyle = 'single',
    borderColor = 'cyan',
    width = null,
    align = 'left'
  } = options;
  
  const chalkInstance = new chalk.Instance({ level: options.noColor ? 0 : 3 });
  
  // Border characters
  const borders = {
    single: {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      horizontal: '─',
      vertical: '│'
    },
    double: {
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝',
      horizontal: '═',
      vertical: '║'
    },
    round: {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '─',
      vertical: '│'
    }
  };
  
  const border = borders[borderStyle] || borders.single;
  const lines = text.split('\n');
  
  // Calculate box width
  const contentWidth = width || Math.max(...lines.map(l => l.length));
  const boxWidth = contentWidth + padding * 2;
  
  // Create box
  let box = '';
  
  // Top border
  box += chalkInstance[borderColor](
    border.topLeft + 
    border.horizontal.repeat(boxWidth) + 
    border.topRight
  ) + '\n';
  
  // Empty padding lines
  for (let i = 0; i < padding; i++) {
    box += chalkInstance[borderColor](border.vertical) +
           ' '.repeat(boxWidth) +
           chalkInstance[borderColor](border.vertical) + '\n';
  }
  
  // Content lines
  for (const line of lines) {
    const paddedLine = alignText(line, contentWidth, align);
    box += chalkInstance[borderColor](border.vertical) +
           ' '.repeat(padding) +
           paddedLine +
           ' '.repeat(padding) +
           chalkInstance[borderColor](border.vertical) + '\n';
  }
  
  // Empty padding lines
  for (let i = 0; i < padding; i++) {
    box += chalkInstance[borderColor](border.vertical) +
           ' '.repeat(boxWidth) +
           chalkInstance[borderColor](border.vertical) + '\n';
  }
  
  // Bottom border
  box += chalkInstance[borderColor](
    border.bottomLeft + 
    border.horizontal.repeat(boxWidth) + 
    border.bottomRight
  );
  
  return box;
}

/**
 * Align text within specified width
 */
function alignText(text, width, align) {
  const textLength = text.length;
  
  if (textLength >= width) {
    return text.substring(0, width);
  }
  
  const padding = width - textLength;
  
  switch (align) {
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    
    case 'right':
      return ' '.repeat(padding) + text;
    
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

export default {
  displayBanner,
  displayWelcome,
  displayGoodbye,
  displayTips,
  displayFeature,
  displayUpdateNotification,
  AnimatedText,
  createBox,
  LOADING_FRAMES
};