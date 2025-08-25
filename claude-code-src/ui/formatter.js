/**
 * Output Formatter
 * Handles formatting and displaying output in the terminal
 */

import chalk from 'chalk';
import { COLORS, ICONS } from '../cli/constants.js';

/**
 * Output formatter class
 */
export class OutputFormatter {
  constructor(options = {}) {
    this.options = {
      color: options.noColor !== true,
      json: options.json || false,
      quiet: options.quiet || false,
      verbose: options.verbose || false,
      width: options.width || process.stdout.columns || 80,
      indent: options.indent || 2
    };
    
    // Setup chalk based on color option
    this.chalk = new chalk.Instance({ level: this.options.color ? 3 : 0 });
  }
  
  /**
   * Display a message
   */
  display(content) {
    if (this.options.quiet) return;
    
    if (this.options.json) {
      console.log(JSON.stringify({ content }, null, 2));
    } else {
      console.log(content);
    }
  }
  
  /**
   * Display a chat message
   */
  displayMessage(content, role = 'assistant') {
    if (this.options.quiet) return;
    
    if (this.options.json) {
      console.log(JSON.stringify({ role, content }, null, 2));
      return;
    }
    
    const roleColor = role === 'user' ? COLORS.primary : COLORS.success;
    const roleIcon = role === 'user' ? ICONS.user : ICONS.robot;
    
    console.log();
    console.log(this.chalk[roleColor].bold(`${roleIcon} ${role.charAt(0).toUpperCase() + role.slice(1)}:`));
    console.log(this.formatContent(content));
  }
  
  /**
   * Display streaming token
   */
  displayToken(token) {
    if (this.options.quiet) return;
    
    if (!this.options.json) {
      process.stdout.write(token);
    }
  }
  
  /**
   * Display system message
   */
  displaySystemMessage(message) {
    if (this.options.quiet) return;
    
    if (this.options.json) {
      console.log(JSON.stringify({ type: 'system', message }, null, 2));
    } else {
      console.log(this.chalk[COLORS.info](`${ICONS.info} ${message}`));
    }
  }
  
  /**
   * Display error
   */
  displayError(message) {
    if (this.options.json) {
      console.error(JSON.stringify({ type: 'error', message }, null, 2));
    } else {
      console.error(this.chalk[COLORS.error](`${ICONS.error} Error: ${message}`));
    }
  }
  
  /**
   * Display warning
   */
  displayWarning(message) {
    if (this.options.quiet) return;
    
    if (this.options.json) {
      console.log(JSON.stringify({ type: 'warning', message }, null, 2));
    } else {
      console.log(this.chalk[COLORS.warning](`${ICONS.warning} Warning: ${message}`));
    }
  }
  
  /**
   * Display success message
   */
  displaySuccess(message) {
    if (this.options.quiet) return;
    
    if (this.options.json) {
      console.log(JSON.stringify({ type: 'success', message }, null, 2));
    } else {
      console.log(this.chalk[COLORS.success](`${ICONS.success} ${message}`));
    }
  }
  
  /**
   * Display completion
   */
  displayCompletion(content) {
    if (this.options.json) {
      console.log(JSON.stringify({ type: 'completion', content }, null, 2));
    } else {
      console.log('\n' + this.formatContent(content) + '\n');
    }
  }
  
  /**
   * Display analysis results
   */
  displayAnalysis(content, format = 'text') {
    if (this.options.json || format === 'json') {
      console.log(JSON.stringify({ type: 'analysis', content }, null, 2));
    } else {
      console.log('\n' + this.chalk[COLORS.highlight].bold('Analysis Results:'));
      console.log(this.formatContent(content));
    }
  }
  
  /**
   * Format analysis output
   */
  formatAnalysis(content, format) {
    switch (format) {
      case 'json':
        return JSON.stringify({ analysis: content }, null, 2);
      
      case 'markdown':
        return `# Analysis Results\n\n${content}`;
      
      case 'text':
      default:
        return content;
    }
  }
  
  /**
   * Display translation
   */
  displayTranslation(content, targetLang) {
    if (this.options.json) {
      console.log(JSON.stringify({ 
        type: 'translation', 
        targetLanguage: targetLang,
        content 
      }, null, 2));
    } else {
      console.log('\n' + this.chalk[COLORS.success].bold(`${ICONS.translate} Translation (${targetLang}):`));
      console.log(this.formatContent(content));
    }
  }
  
  /**
   * Display summary
   */
  displaySummary(content, format) {
    if (this.options.json || format === 'json') {
      console.log(JSON.stringify({ type: 'summary', content }, null, 2));
    } else {
      console.log('\n' + this.chalk[COLORS.highlight].bold(`${ICONS.summary} Summary:`));
      console.log(this.formatContent(content));
    }
  }
  
  /**
   * Display configuration
   */
  displayConfig(config) {
    if (this.options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(this.chalk[COLORS.info].bold('Configuration:'));
      this.displayObject(config);
    }
  }
  
  /**
   * Display auth status
   */
  displayAuthStatus(status) {
    if (this.options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      const statusColor = status.authenticated ? COLORS.success : COLORS.warning;
      const statusIcon = status.authenticated ? ICONS.success : ICONS.warning;
      
      console.log(this.chalk[statusColor](`${statusIcon} Authentication: ${status.authenticated ? 'Active' : 'Not authenticated'}`));
      
      if (status.user) {
        console.log(this.chalk[COLORS.muted](`  User: ${status.user}`));
      }
      
      if (status.expiresAt) {
        console.log(this.chalk[COLORS.muted](`  Expires: ${status.expiresAt}`));
      }
    }
  }
  
  /**
   * Format content with word wrapping
   */
  formatContent(content) {
    if (!content) return '';
    
    // Handle different content types
    if (typeof content === 'object') {
      return JSON.stringify(content, null, this.options.indent);
    }
    
    // Apply word wrapping if needed
    if (this.options.width && content.length > this.options.width) {
      return this.wordWrap(content, this.options.width);
    }
    
    return content;
  }
  
  /**
   * Word wrap text
   */
  wordWrap(text, width) {
    const lines = text.split('\n');
    const wrapped = [];
    
    for (const line of lines) {
      if (line.length <= width) {
        wrapped.push(line);
      } else {
        // Wrap long lines
        let currentLine = '';
        const words = line.split(' ');
        
        for (const word of words) {
          if (currentLine.length + word.length + 1 <= width) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) wrapped.push(currentLine);
            currentLine = word;
          }
        }
        
        if (currentLine) wrapped.push(currentLine);
      }
    }
    
    return wrapped.join('\n');
  }
  
  /**
   * Display object with indentation
   */
  displayObject(obj, indent = 0) {
    const spaces = ' '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        console.log(`${spaces}${this.chalk[COLORS.muted](key)}: ${this.chalk.gray('(not set)')}`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        console.log(`${spaces}${this.chalk[COLORS.primary](key)}:`);
        this.displayObject(value, indent + this.options.indent);
      } else if (Array.isArray(value)) {
        console.log(`${spaces}${this.chalk[COLORS.primary](key)}: [${value.join(', ')}]`);
      } else {
        console.log(`${spaces}${this.chalk[COLORS.muted](key)}: ${value}`);
      }
    }
  }
  
  /**
   * Format prompt for interactive mode
   */
  formatPrompt(role = 'You') {
    return this.chalk[COLORS.primary].bold(`${role}> `);
  }
  
  /**
   * Display table
   */
  displayTable(headers, rows) {
    if (this.options.json) {
      console.log(JSON.stringify({ headers, rows }, null, 2));
      return;
    }
    
    // Calculate column widths
    const widths = headers.map((h, i) => {
      const headerWidth = h.length;
      const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
      return Math.max(headerWidth, maxRowWidth);
    });
    
    // Display headers
    const headerRow = headers.map((h, i) => 
      this.chalk[COLORS.primary].bold(h.padEnd(widths[i]))
    ).join(' | ');
    
    console.log(headerRow);
    console.log('-'.repeat(headerRow.length));
    
    // Display rows
    for (const row of rows) {
      const rowStr = row.map((cell, i) => 
        String(cell || '').padEnd(widths[i])
      ).join(' | ');
      console.log(rowStr);
    }
  }
  
  /**
   * Display progress bar
   */
  displayProgressBar(current, total, label = '') {
    if (this.options.quiet || this.options.json) return;
    
    const percentage = Math.round((current / total) * 100);
    const barWidth = Math.min(30, this.options.width - 20);
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const progress = `[${bar}] ${percentage}% ${label}`;
    
    process.stdout.write(`\r${progress}`);
    
    if (current >= total) {
      console.log(); // New line when complete
    }
  }
  
  /**
   * Clear line
   */
  clearLine() {
    if (this.options.quiet || this.options.json) return;
    
    process.stdout.write('\r' + ' '.repeat(this.options.width) + '\r');
  }
}

export default OutputFormatter;