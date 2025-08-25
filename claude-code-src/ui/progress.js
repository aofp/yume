/**
 * Progress Indicator
 * Shows progress indicators and spinners in the terminal
 */

import { SPINNERS, COLORS } from '../cli/constants.js';
import chalk from 'chalk';

/**
 * Progress indicator class
 */
export class ProgressIndicator {
  constructor(options = {}) {
    this.options = {
      spinner: options.spinner || 'dots',
      color: options.color || COLORS.primary,
      stream: options.stream || process.stderr,
      enabled: !options.quiet && !options.json && process.stdout.isTTY,
      clearOnComplete: options.clearOnComplete !== false
    };
    
    this.spinnerFrames = SPINNERS[this.options.spinner] || SPINNERS.dots;
    this.currentFrame = 0;
    this.interval = null;
    this.text = '';
    this.isSpinning = false;
  }
  
  /**
   * Start spinning with optional text
   */
  start(text = '') {
    if (!this.options.enabled || this.isSpinning) return;
    
    this.text = text;
    this.isSpinning = true;
    this.currentFrame = 0;
    
    // Start animation
    this.render();
    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.spinnerFrames.length;
      this.render();
    }, 80);
  }
  
  /**
   * Update spinner text
   */
  update(text) {
    this.text = text;
    if (this.isSpinning) {
      this.render();
    }
  }
  
  /**
   * Stop spinning
   */
  stop() {
    if (!this.isSpinning) return;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isSpinning = false;
    
    if (this.options.clearOnComplete) {
      this.clear();
    }
  }
  
  /**
   * Stop with success message
   */
  succeed(text) {
    this.stop();
    
    if (this.options.enabled) {
      const message = chalk.green('✓') + ' ' + (text || this.text);
      this.options.stream.write(message + '\n');
    }
  }
  
  /**
   * Stop with failure message
   */
  fail(text) {
    this.stop();
    
    if (this.options.enabled) {
      const message = chalk.red('✗') + ' ' + (text || this.text);
      this.options.stream.write(message + '\n');
    }
  }
  
  /**
   * Stop with warning message
   */
  warn(text) {
    this.stop();
    
    if (this.options.enabled) {
      const message = chalk.yellow('⚠') + ' ' + (text || this.text);
      this.options.stream.write(message + '\n');
    }
  }
  
  /**
   * Stop with info message
   */
  info(text) {
    this.stop();
    
    if (this.options.enabled) {
      const message = chalk.blue('ℹ') + ' ' + (text || this.text);
      this.options.stream.write(message + '\n');
    }
  }
  
  /**
   * Render current frame
   */
  render() {
    if (!this.options.enabled) return;
    
    const frame = this.spinnerFrames[this.currentFrame];
    const spinner = chalk[this.options.color](frame);
    const message = spinner + ' ' + this.text;
    
    this.clear();
    this.options.stream.write(message);
  }
  
  /**
   * Clear current line
   */
  clear() {
    if (!this.options.enabled) return;
    
    const clearLine = '\r' + ' '.repeat(process.stdout.columns || 80) + '\r';
    this.options.stream.write(clearLine);
  }
}

/**
 * Progress bar class
 */
export class ProgressBar {
  constructor(options = {}) {
    this.options = {
      total: options.total || 100,
      width: options.width || 40,
      complete: options.complete || '█',
      incomplete: options.incomplete || '░',
      renderThrottle: options.renderThrottle || 16,
      stream: options.stream || process.stderr,
      enabled: !options.quiet && !options.json && process.stdout.isTTY,
      showPercentage: options.showPercentage !== false,
      showETA: options.showETA || false,
      format: options.format || ':bar :percent :etas'
    };
    
    this.current = 0;
    this.startTime = null;
    this.lastRender = 0;
  }
  
  /**
   * Start progress bar
   */
  start(total = null, startValue = 0) {
    if (total !== null) {
      this.options.total = total;
    }
    
    this.current = startValue;
    this.startTime = Date.now();
    this.render();
  }
  
  /**
   * Update progress
   */
  update(current) {
    this.current = Math.min(current, this.options.total);
    
    // Throttle rendering
    const now = Date.now();
    if (now - this.lastRender >= this.options.renderThrottle) {
      this.render();
      this.lastRender = now;
    }
  }
  
  /**
   * Increment progress
   */
  increment(delta = 1) {
    this.update(this.current + delta);
  }
  
  /**
   * Complete progress bar
   */
  complete() {
    this.current = this.options.total;
    this.render();
    
    if (this.options.enabled) {
      this.options.stream.write('\n');
    }
  }
  
  /**
   * Render progress bar
   */
  render() {
    if (!this.options.enabled) return;
    
    const percentage = Math.round((this.current / this.options.total) * 100);
    const filled = Math.round((this.current / this.options.total) * this.options.width);
    const empty = this.options.width - filled;
    
    const bar = this.options.complete.repeat(filled) + 
                this.options.incomplete.repeat(empty);
    
    let output = this.options.format;
    
    // Replace tokens
    output = output.replace(':bar', bar);
    output = output.replace(':percent', `${percentage}%`);
    output = output.replace(':current', this.current.toString());
    output = output.replace(':total', this.options.total.toString());
    
    // Calculate ETA if requested
    if (this.options.showETA && output.includes(':eta')) {
      const eta = this.calculateETA();
      output = output.replace(':etas', eta ? `${eta}s` : '');
      output = output.replace(':eta', eta || '');
    }
    
    // Clear line and write
    this.clear();
    this.options.stream.write(output);
  }
  
  /**
   * Calculate estimated time remaining
   */
  calculateETA() {
    if (!this.startTime || this.current === 0) return null;
    
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed;
    const remaining = this.options.total - this.current;
    const eta = remaining / rate;
    
    return Math.round(eta / 1000); // Convert to seconds
  }
  
  /**
   * Clear current line
   */
  clear() {
    if (!this.options.enabled) return;
    
    const clearLine = '\r' + ' '.repeat(process.stdout.columns || 80) + '\r';
    this.options.stream.write(clearLine);
  }
}

/**
 * Multi-progress manager for multiple progress bars
 */
export class MultiProgress {
  constructor(options = {}) {
    this.options = {
      stream: options.stream || process.stderr,
      enabled: !options.quiet && !options.json && process.stdout.isTTY
    };
    
    this.bars = new Map();
    this.rendering = false;
  }
  
  /**
   * Create a new progress bar
   */
  create(id, options = {}) {
    const bar = new ProgressBar({
      ...options,
      stream: this.options.stream,
      enabled: this.options.enabled
    });
    
    this.bars.set(id, bar);
    return bar;
  }
  
  /**
   * Get progress bar by ID
   */
  get(id) {
    return this.bars.get(id);
  }
  
  /**
   * Remove progress bar
   */
  remove(id) {
    this.bars.delete(id);
  }
  
  /**
   * Update all bars
   */
  render() {
    if (!this.options.enabled || this.rendering) return;
    
    this.rendering = true;
    
    // Move cursor up to redraw all bars
    const barCount = this.bars.size;
    if (barCount > 0) {
      this.options.stream.write(`\x1b[${barCount}A`);
    }
    
    // Render each bar
    for (const bar of this.bars.values()) {
      bar.render();
      this.options.stream.write('\n');
    }
    
    this.rendering = false;
  }
  
  /**
   * Clear all progress bars
   */
  clear() {
    for (const bar of this.bars.values()) {
      bar.clear();
    }
    this.bars.clear();
  }
}

/**
 * Simple loading dots animation
 */
export class LoadingDots {
  constructor(text = 'Loading', options = {}) {
    this.text = text;
    this.options = {
      interval: options.interval || 500,
      maxDots: options.maxDots || 3,
      stream: options.stream || process.stderr,
      enabled: !options.quiet && !options.json && process.stdout.isTTY
    };
    
    this.dots = 0;
    this.interval = null;
  }
  
  /**
   * Start animation
   */
  start() {
    if (!this.options.enabled) return;
    
    this.dots = 0;
    this.render();
    
    this.interval = setInterval(() => {
      this.dots = (this.dots + 1) % (this.options.maxDots + 1);
      this.render();
    }, this.options.interval);
  }
  
  /**
   * Stop animation
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.clear();
  }
  
  /**
   * Render current state
   */
  render() {
    if (!this.options.enabled) return;
    
    const dots = '.'.repeat(this.dots);
    const spaces = ' '.repeat(this.options.maxDots - this.dots);
    const message = `${this.text}${dots}${spaces}`;
    
    this.clear();
    this.options.stream.write(message);
  }
  
  /**
   * Clear line
   */
  clear() {
    if (!this.options.enabled) return;
    
    const clearLine = '\r' + ' '.repeat(process.stdout.columns || 80) + '\r';
    this.options.stream.write(clearLine);
  }
}

export default {
  ProgressIndicator,
  ProgressBar,
  MultiProgress,
  LoadingDots
};