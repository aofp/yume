import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Comprehensive tests for keyEventToString utility function
 *
 * Tests cover:
 * - Single modifier keys
 * - Multiple modifier combinations
 * - Regular alphanumeric keys
 * - Special keys (Enter, Escape, Tab, etc.)
 * - Function keys (F1-F12)
 * - Arrow keys
 * - Numpad keys
 * - Edge cases and invalid inputs
 */

describe('keyEventToString', () => {
  let mockEvent: Partial<KeyboardEvent>;

  beforeEach(() => {
    mockEvent = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      code: '',
      key: '',
    };
  });

  describe('single modifier keys', () => {
    it('should format Control key alone', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'Control';
      // Expected: "Ctrl" when no other key is pressed
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl');
    });

    it('should format Shift key alone', () => {
      mockEvent.shiftKey = true;
      mockEvent.key = 'Shift';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Shift');
    });

    it('should format Alt key alone', () => {
      mockEvent.altKey = true;
      mockEvent.key = 'Alt';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Alt');
    });

    it('should format Meta/Command key alone on macOS', () => {
      mockEvent.metaKey = true;
      mockEvent.key = 'Meta';
      // Expected: "Cmd" on macOS or "Meta" on other platforms
      const result = keyEventToString(mockEvent as KeyboardEvent);
      expect(['Cmd', 'Meta']).toContain(result);
    });
  });

  describe('modifier combinations with regular keys', () => {
    it('should format Ctrl+A', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'a';
      mockEvent.code = 'KeyA';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+A');
    });

    it('should format Ctrl+Shift+K', () => {
      mockEvent.ctrlKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'K';
      mockEvent.code = 'KeyK';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Shift+K');
    });

    it('should format Ctrl+Alt+Delete', () => {
      mockEvent.ctrlKey = true;
      mockEvent.altKey = true;
      mockEvent.key = 'Delete';
      mockEvent.code = 'Delete';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Alt+Delete');
    });

    it('should format Alt+Shift+Right', () => {
      mockEvent.altKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'ArrowRight';
      mockEvent.code = 'ArrowRight';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Alt+Shift+ArrowRight');
    });

    it('should format Cmd+Shift+S on macOS', () => {
      mockEvent.metaKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'S';
      mockEvent.code = 'KeyS';
      const result = keyEventToString(mockEvent as KeyboardEvent);
      expect(result).toMatch(/^(Cmd|Meta)\+Shift\+S$/);
    });

    it('should format Ctrl+Alt+Shift+P', () => {
      mockEvent.ctrlKey = true;
      mockEvent.altKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'P';
      mockEvent.code = 'KeyP';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Alt+Shift+P');
    });
  });

  describe('alphanumeric keys', () => {
    it('should format lowercase letter as uppercase', () => {
      mockEvent.key = 'a';
      mockEvent.code = 'KeyA';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('A');
    });

    it('should format uppercase letter', () => {
      mockEvent.key = 'A';
      mockEvent.code = 'KeyA';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('A');
    });

    it('should format digit 0', () => {
      mockEvent.key = '0';
      mockEvent.code = 'Digit0';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('0');
    });

    it('should format digit 9', () => {
      mockEvent.key = '9';
      mockEvent.code = 'Digit9';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('9');
    });

    it('should handle all letters A-Z', () => {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      for (const letter of letters) {
        mockEvent.key = letter;
        mockEvent.code = `Key${letter.toUpperCase()}`;
        expect(keyEventToString(mockEvent as KeyboardEvent)).toBe(letter.toUpperCase());
      }
    });

    it('should handle all digits 0-9', () => {
      for (let i = 0; i <= 9; i++) {
        mockEvent.key = String(i);
        mockEvent.code = `Digit${i}`;
        expect(keyEventToString(mockEvent as KeyboardEvent)).toBe(String(i));
      }
    });
  });

  describe('special character keys', () => {
    it('should format Shift+1 as !', () => {
      mockEvent.shiftKey = true;
      mockEvent.key = '!';
      mockEvent.code = 'Digit1';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Shift+!');
    });

    it('should format hyphen', () => {
      mockEvent.key = '-';
      mockEvent.code = 'Minus';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('-');
    });

    it('should format equals sign', () => {
      mockEvent.key = '=';
      mockEvent.code = 'Equal';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('=');
    });

    it('should format bracket', () => {
      mockEvent.key = '[';
      mockEvent.code = 'BracketLeft';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('[');
    });

    it('should format slash', () => {
      mockEvent.key = '/';
      mockEvent.code = 'Slash';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('/');
    });

    it('should format semicolon', () => {
      mockEvent.key = ';';
      mockEvent.code = 'Semicolon';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe(';');
    });

    it('should format backtick', () => {
      mockEvent.key = '`';
      mockEvent.code = 'Backquote';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('`');
    });
  });

  describe('special navigation keys', () => {
    it('should format Enter key', () => {
      mockEvent.key = 'Enter';
      mockEvent.code = 'Enter';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Enter');
    });

    it('should format Tab key', () => {
      mockEvent.key = 'Tab';
      mockEvent.code = 'Tab';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Tab');
    });

    it('should format Escape key', () => {
      mockEvent.key = 'Escape';
      mockEvent.code = 'Escape';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Escape');
    });

    it('should format Backspace key', () => {
      mockEvent.key = 'Backspace';
      mockEvent.code = 'Backspace';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Backspace');
    });

    it('should format Delete key', () => {
      mockEvent.key = 'Delete';
      mockEvent.code = 'Delete';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Delete');
    });

    it('should format Space key', () => {
      mockEvent.key = ' ';
      mockEvent.code = 'Space';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Space');
    });

    it('should format Ctrl+Shift+Escape', () => {
      mockEvent.ctrlKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'Escape';
      mockEvent.code = 'Escape';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Shift+Escape');
    });
  });

  describe('arrow keys', () => {
    it('should format ArrowUp', () => {
      mockEvent.key = 'ArrowUp';
      mockEvent.code = 'ArrowUp';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('ArrowUp');
    });

    it('should format ArrowDown', () => {
      mockEvent.key = 'ArrowDown';
      mockEvent.code = 'ArrowDown';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('ArrowDown');
    });

    it('should format ArrowLeft', () => {
      mockEvent.key = 'ArrowLeft';
      mockEvent.code = 'ArrowLeft';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('ArrowLeft');
    });

    it('should format ArrowRight', () => {
      mockEvent.key = 'ArrowRight';
      mockEvent.code = 'ArrowRight';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('ArrowRight');
    });

    it('should format Ctrl+ArrowRight', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'ArrowRight';
      mockEvent.code = 'ArrowRight';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+ArrowRight');
    });

    it('should format Alt+ArrowDown', () => {
      mockEvent.altKey = true;
      mockEvent.key = 'ArrowDown';
      mockEvent.code = 'ArrowDown';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Alt+ArrowDown');
    });
  });

  describe('function keys', () => {
    it('should format F1', () => {
      mockEvent.key = 'F1';
      mockEvent.code = 'F1';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('F1');
    });

    it('should format F12', () => {
      mockEvent.key = 'F12';
      mockEvent.code = 'F12';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('F12');
    });

    it('should format all F1-F12 keys', () => {
      for (let i = 1; i <= 12; i++) {
        mockEvent.key = `F${i}`;
        mockEvent.code = `F${i}`;
        expect(keyEventToString(mockEvent as KeyboardEvent)).toBe(`F${i}`);
      }
    });

    it('should format Ctrl+F5', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'F5';
      mockEvent.code = 'F5';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+F5');
    });

    it('should format Shift+F11', () => {
      mockEvent.shiftKey = true;
      mockEvent.key = 'F11';
      mockEvent.code = 'F11';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Shift+F11');
    });
  });

  describe('numpad keys', () => {
    it('should format Numpad0', () => {
      mockEvent.key = '0';
      mockEvent.code = 'Numpad0';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Numpad0');
    });

    it('should format Numpad9', () => {
      mockEvent.key = '9';
      mockEvent.code = 'Numpad9';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Numpad9');
    });

    it('should format NumpadAdd', () => {
      mockEvent.key = '+';
      mockEvent.code = 'NumpadAdd';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('NumpadAdd');
    });

    it('should format NumpadSubtract', () => {
      mockEvent.key = '-';
      mockEvent.code = 'NumpadSubtract';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('NumpadSubtract');
    });

    it('should format NumpadMultiply', () => {
      mockEvent.key = '*';
      mockEvent.code = 'NumpadMultiply';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('NumpadMultiply');
    });

    it('should format NumpadDivide', () => {
      mockEvent.key = '/';
      mockEvent.code = 'NumpadDivide';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('NumpadDivide');
    });

    it('should format NumpadEnter', () => {
      mockEvent.key = 'Enter';
      mockEvent.code = 'NumpadEnter';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('NumpadEnter');
    });

    it('should format Ctrl+Numpad5', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = '5';
      mockEvent.code = 'Numpad5';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Numpad5');
    });
  });

  describe('printing keys and modifiers', () => {
    it('should format Print Screen', () => {
      mockEvent.key = 'PrintScreen';
      mockEvent.code = 'PrintScreen';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('PrintScreen');
    });

    it('should format Scroll Lock', () => {
      mockEvent.key = 'ScrollLock';
      mockEvent.code = 'ScrollLock';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('ScrollLock');
    });

    it('should format Pause', () => {
      mockEvent.key = 'Pause';
      mockEvent.code = 'Pause';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Pause');
    });

    it('should format Insert', () => {
      mockEvent.key = 'Insert';
      mockEvent.code = 'Insert';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Insert');
    });

    it('should format Home', () => {
      mockEvent.key = 'Home';
      mockEvent.code = 'Home';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Home');
    });

    it('should format End', () => {
      mockEvent.key = 'End';
      mockEvent.code = 'End';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('End');
    });

    it('should format Page Up', () => {
      mockEvent.key = 'PageUp';
      mockEvent.code = 'PageUp';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('PageUp');
    });

    it('should format Page Down', () => {
      mockEvent.key = 'PageDown';
      mockEvent.code = 'PageDown';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('PageDown');
    });
  });

  describe('edge cases and normalization', () => {
    it('should normalize modifier order consistently', () => {
      // Test that modifiers appear in a consistent order: Ctrl, Alt, Shift, Meta/Cmd
      mockEvent.shiftKey = true;
      mockEvent.ctrlKey = true;
      mockEvent.altKey = true;
      mockEvent.key = 'X';
      mockEvent.code = 'KeyX';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Alt+Shift+X');
    });

    it('should handle uppercase and lowercase letters consistently', () => {
      mockEvent.key = 'a';
      mockEvent.code = 'KeyA';
      const result1 = keyEventToString(mockEvent as KeyboardEvent);

      mockEvent.key = 'A';
      const result2 = keyEventToString(mockEvent as KeyboardEvent);

      expect(result1).toBe(result2);
      expect(result1).toBe('A');
    });

    it('should handle whitespace in Space key', () => {
      mockEvent.key = ' ';
      mockEvent.code = 'Space';
      // Should output "Space" not " "
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Space');
    });

    it('should handle repeated modifiers gracefully', () => {
      // If somehow both Shift keys were pressed, should appear once
      mockEvent.shiftKey = true;
      mockEvent.key = 'Shift';
      mockEvent.code = 'ShiftLeft';
      const result = keyEventToString(mockEvent as KeyboardEvent);
      // Should not have "Shift+Shift"
      expect(result.split('+').length).toBeLessThanOrEqual(2);
    });

    it('should handle missing code property gracefully', () => {
      mockEvent.key = 'A';
      mockEvent.code = '';
      expect(() => keyEventToString(mockEvent as KeyboardEvent)).not.toThrow();
    });

    it('should handle missing key property gracefully', () => {
      mockEvent.key = '';
      mockEvent.code = 'KeyA';
      expect(() => keyEventToString(mockEvent as KeyboardEvent)).not.toThrow();
    });
  });

  describe('platform-specific behavior', () => {
    it('should use Cmd for Meta on macOS-like platforms', () => {
      mockEvent.metaKey = true;
      mockEvent.key = 'Meta';
      mockEvent.code = 'MetaLeft';
      // On macOS, should be "Cmd"; on others, may be "Meta"
      const result = keyEventToString(mockEvent as KeyboardEvent);
      expect(/^(Cmd|Meta)$/).test(result);
    });

    it('should format Cmd+S as Cmd+S on macOS', () => {
      mockEvent.metaKey = true;
      mockEvent.key = 's';
      mockEvent.code = 'KeyS';
      const result = keyEventToString(mockEvent as KeyboardEvent);
      expect(result).toMatch(/^(Cmd|Meta)\+S$/);
    });

    it('should handle Ctrl on non-Mac platforms', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'c';
      mockEvent.code = 'KeyC';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+C');
    });
  });

  describe('complex realistic scenarios', () => {
    it('should format VS Code save shortcut (Ctrl+S)', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 's';
      mockEvent.code = 'KeyS';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+S');
    });

    it('should format VS Code command palette (Ctrl+Shift+P)', () => {
      mockEvent.ctrlKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'P';
      mockEvent.code = 'KeyP';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+Shift+P');
    });

    it('should format VS Code quick open (Ctrl+P)', () => {
      mockEvent.ctrlKey = true;
      mockEvent.key = 'p';
      mockEvent.code = 'KeyP';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Ctrl+P');
    });

    it('should format browser back (Alt+ArrowLeft)', () => {
      mockEvent.altKey = true;
      mockEvent.key = 'ArrowLeft';
      mockEvent.code = 'ArrowLeft';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Alt+ArrowLeft');
    });

    it('should format developer tools (F12)', () => {
      mockEvent.key = 'F12';
      mockEvent.code = 'F12';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('F12');
    });

    it('should format Tab navigation (Tab)', () => {
      mockEvent.key = 'Tab';
      mockEvent.code = 'Tab';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Tab');
    });

    it('should format Reverse Tab navigation (Shift+Tab)', () => {
      mockEvent.shiftKey = true;
      mockEvent.key = 'Tab';
      mockEvent.code = 'Tab';
      expect(keyEventToString(mockEvent as KeyboardEvent)).toBe('Shift+Tab');
    });
  });

  describe('error handling and null/undefined cases', () => {
    it('should handle null event gracefully', () => {
      expect(() => keyEventToString(null as any)).not.toThrow();
    });

    it('should handle undefined event gracefully', () => {
      expect(() => keyEventToString(undefined as any)).not.toThrow();
    });

    it('should handle event with undefined key property', () => {
      mockEvent.key = undefined;
      mockEvent.code = 'KeyA';
      expect(() => keyEventToString(mockEvent as any)).not.toThrow();
    });

    it('should handle event with undefined code property', () => {
      mockEvent.key = 'A';
      mockEvent.code = undefined;
      expect(() => keyEventToString(mockEvent as any)).not.toThrow();
    });

    it('should handle event with empty string key and code', () => {
      mockEvent.key = '';
      mockEvent.code = '';
      expect(() => keyEventToString(mockEvent as KeyboardEvent)).not.toThrow();
    });
  });

  describe('consistency and uniqueness', () => {
    it('should produce consistent output for the same input', () => {
      mockEvent.ctrlKey = true;
      mockEvent.shiftKey = true;
      mockEvent.key = 'K';
      mockEvent.code = 'KeyK';

      const result1 = keyEventToString(mockEvent as KeyboardEvent);
      const result2 = keyEventToString(mockEvent as KeyboardEvent);
      const result3 = keyEventToString(mockEvent as KeyboardEvent);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should produce different output for different modifiers', () => {
      mockEvent.key = 'A';
      mockEvent.code = 'KeyA';

      mockEvent.ctrlKey = true;
      const withCtrl = keyEventToString(mockEvent as KeyboardEvent);

      mockEvent.ctrlKey = false;
      mockEvent.altKey = true;
      const withAlt = keyEventToString(mockEvent as KeyboardEvent);

      expect(withCtrl).not.toBe(withAlt);
    });

    it('should produce different output for different keys', () => {
      mockEvent.ctrlKey = true;

      mockEvent.key = 'A';
      mockEvent.code = 'KeyA';
      const withA = keyEventToString(mockEvent as KeyboardEvent);

      mockEvent.key = 'B';
      mockEvent.code = 'KeyB';
      const withB = keyEventToString(mockEvent as KeyboardEvent);

      expect(withA).not.toBe(withB);
      expect(withA).toBe('Ctrl+A');
      expect(withB).toBe('Ctrl+B');
    });
  });
});
