/**
 * RegEx Validator - ReDoS Detection Utility
 * Detects potentially dangerous regex patterns that could cause catastrophic backtracking
 */

// Known dangerous patterns that cause ReDoS (Regular Expression Denial of Service)
const REDOS_PATTERNS = [
  // Nested quantifiers: (a+)+, (a*)+, (a+)*, etc.
  /\([^)]*[+*][^)]*\)[+*]/,
  // Overlapping alternations: (a|a)+, (.|a)+
  /\([^)]*\|[^)]*\)[+*]/,
  // Quantified groups with wildcards: .*.*
  /\.\*\.\*/,
  // Repeated alternations with quantifiers - detect patterns like (a)+\1 or similar
  /(\([^)]+\))[+*]\\1/,
  // Exponential patterns: .*a.*a.*a
  /(\.\*[a-zA-Z]){3,}/,
  // Nested groups with quantifiers
  /\([^()]*\([^()]*\)[+*][^()]*\)[+*]/,
];

// Common safe patterns that might look suspicious but are fine
const SAFE_PATTERNS = [
  /^\^.*\$$/,  // Anchored patterns are safe
  /^\[[^\]]+\][+*]$/,  // Simple character class with quantifier
];

export interface RegexValidationResult {
  isValid: boolean;
  hasRedosRisk: boolean;
  error?: string;
  warning?: string;
  riskLevel: 'safe' | 'low' | 'medium' | 'high';
  suggestions?: string[];
}

/**
 * Validate a regex pattern string for ReDoS vulnerabilities and syntax errors
 */
export function validateRegexPattern(pattern: string): RegexValidationResult {
  // Default result
  const result: RegexValidationResult = {
    isValid: true,
    hasRedosRisk: false,
    riskLevel: 'safe',
  };

  // Empty pattern is valid but useless
  if (!pattern || pattern.trim() === '') {
    return {
      isValid: false,
      hasRedosRisk: false,
      error: 'pattern is empty',
      riskLevel: 'safe',
    };
  }

  // Strip leading/trailing slashes if present (common regex notation)
  let cleanPattern = pattern;
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    cleanPattern = pattern.slice(1, -1);
  } else if (pattern.startsWith('/')) {
    cleanPattern = pattern.slice(1);
  }

  // Test if pattern is valid regex
  try {
    new RegExp(cleanPattern);
  } catch (e) {
    return {
      isValid: false,
      hasRedosRisk: false,
      error: e instanceof Error ? e.message : 'invalid regex syntax',
      riskLevel: 'safe',
    };
  }

  // Check for ReDoS patterns
  const suggestions: string[] = [];

  // Check for nested quantifiers
  if (/\([^)]*[+*][^)]*\)[+*]/.test(cleanPattern)) {
    result.hasRedosRisk = true;
    result.riskLevel = 'high';
    result.warning = 'nested quantifiers detected (e.g., (a+)+)';
    suggestions.push('use possessive quantifiers or atomic groups if supported');
    suggestions.push('simplify pattern to avoid nested repetition');
  }

  // Check for overlapping alternations with quantifiers
  if (/\([^)]*\|[^)]*\)[+*]{1,}/.test(cleanPattern) && !/^\([^|]+\|[^|]+\)$/.test(cleanPattern)) {
    if (!result.hasRedosRisk) {
      result.hasRedosRisk = true;
      result.riskLevel = 'medium';
      result.warning = 'alternation with quantifier may cause backtracking';
      suggestions.push('ensure alternation branches are mutually exclusive');
    }
  }

  // Check for .* repeated patterns
  if (/\.\*.*\.\*/.test(cleanPattern)) {
    if (!result.hasRedosRisk) {
      result.hasRedosRisk = true;
      result.riskLevel = 'medium';
      result.warning = 'multiple .* patterns can cause exponential backtracking';
      suggestions.push('use more specific patterns instead of .*');
      suggestions.push('consider using lazy quantifiers .*?');
    }
  }

  // Check for unbounded repetition at the start
  if (/^[^\\]*[+*]/.test(cleanPattern) && !/^\^/.test(cleanPattern)) {
    if (result.riskLevel === 'safe') {
      result.riskLevel = 'low';
      suggestions.push('consider anchoring pattern with ^ for better performance');
    }
  }

  // Check pattern length (very long patterns can be slow)
  if (cleanPattern.length > 500) {
    if (!result.hasRedosRisk) {
      result.riskLevel = 'low';
      result.warning = 'very long pattern may have performance impact';
      suggestions.push('consider splitting into multiple simpler patterns');
    }
  }

  if (suggestions.length > 0) {
    result.suggestions = suggestions;
  }

  return result;
}

/**
 * Test a regex pattern against sample text to estimate performance
 */
export function testRegexPerformance(pattern: string, sampleText: string, timeoutMs: number = 100): {
  passed: boolean;
  durationMs: number;
  timedOut: boolean;
} {
  const startTime = performance.now();

  try {
    // Strip slashes if present
    let cleanPattern = pattern;
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      cleanPattern = pattern.slice(1, -1);
    } else if (pattern.startsWith('/')) {
      cleanPattern = pattern.slice(1);
    }

    const regex = new RegExp(cleanPattern);

    // Create a promise that times out
    let timedOut = false;
    const result = regex.test(sampleText);

    const durationMs = performance.now() - startTime;

    if (durationMs > timeoutMs) {
      timedOut = true;
    }

    return {
      passed: true,
      durationMs,
      timedOut,
    };
  } catch {
    return {
      passed: false,
      durationMs: performance.now() - startTime,
      timedOut: false,
    };
  }
}

/**
 * Generate adversarial test strings for ReDoS detection
 */
export function generateAdversarialStrings(pattern: string): string[] {
  const strings: string[] = [];

  // Extract repeated characters/groups from pattern
  const repeatMatch = pattern.match(/\(([^)]+)\)[+*]/);
  if (repeatMatch) {
    const repeatedPart = repeatMatch[1].replace(/[\\^$.*+?()[\]{}|]/g, '');
    if (repeatedPart) {
      // Generate exponentially growing strings
      strings.push(repeatedPart.repeat(10) + 'X');
      strings.push(repeatedPart.repeat(20) + 'X');
      strings.push(repeatedPart.repeat(50) + 'X');
    }
  }

  // Check for .* patterns
  if (/\.\*/.test(pattern)) {
    strings.push('a'.repeat(100) + 'X');
    strings.push('a'.repeat(500) + 'X');
  }

  // Default adversarial strings
  if (strings.length === 0) {
    strings.push('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX');
    strings.push('a'.repeat(100) + 'X');
  }

  return strings;
}

/**
 * Full validation with performance testing
 */
export function fullRegexValidation(pattern: string): RegexValidationResult & {
  performanceTest?: {
    passed: boolean;
    avgDurationMs: number;
    worstCase: string;
  };
} {
  const result = validateRegexPattern(pattern);

  if (!result.isValid) {
    return result;
  }

  // Run performance tests with adversarial strings
  const adversarialStrings = generateAdversarialStrings(pattern);
  let maxDuration = 0;
  let worstCase = '';
  let totalDuration = 0;

  for (const testStr of adversarialStrings) {
    const perfResult = testRegexPerformance(pattern, testStr, 50);
    totalDuration += perfResult.durationMs;

    if (perfResult.durationMs > maxDuration) {
      maxDuration = perfResult.durationMs;
      worstCase = testStr.length > 20 ? testStr.slice(0, 20) + '...' : testStr;
    }

    if (perfResult.timedOut) {
      result.hasRedosRisk = true;
      result.riskLevel = 'high';
      result.warning = 'pattern timed out during performance test';
      break;
    }
  }

  return {
    ...result,
    performanceTest: {
      passed: maxDuration < 50,
      avgDurationMs: totalDuration / adversarialStrings.length,
      worstCase,
    },
  };
}

export default {
  validateRegexPattern,
  testRegexPerformance,
  generateAdversarialStrings,
  fullRegexValidation,
};
