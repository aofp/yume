/**
 * Module Loading and Interop Utilities
 * Provides utilities for CommonJS/ESM module interoperability
 */

import { createRequire } from 'node:module';

/**
 * Create a CommonJS require function from ESM context
 */
export const require = createRequire(import.meta.url);

/**
 * Create an object with proper prototype chain
 */
export const createObject = Object.create;

/**
 * Object utility functions
 */
export const { getPrototypeOf, defineProperty, getOwnPropertyNames } = Object;
export const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * ESM to CommonJS module converter
 * Converts ES modules to CommonJS-compatible format
 * 
 * @param {any} module - The module to convert
 * @param {boolean} isDefault - Whether to use default export
 * @param {object} target - Target object to populate
 * @returns {object} CommonJS-compatible module
 */
export function convertToCommonJS(module, isDefault, target) {
  // Create target object with proper prototype
  target = module != null ? createObject(getPrototypeOf(module)) : {};
  
  // Handle default export
  let result = isDefault || !module || !module.__esModule 
    ? defineProperty(target, "default", { value: module, enumerable: true })
    : target;
  
  // Copy all named exports
  for (let key of getOwnPropertyNames(module)) {
    if (!hasOwnProperty.call(result, key)) {
      defineProperty(result, key, {
        get: () => module[key],
        enumerable: true
      });
    }
  }
  
  return result;
}

/**
 * CommonJS module wrapper
 * Wraps a function to create CommonJS-style module
 * 
 * @param {Function} factory - Module factory function
 * @param {Function} wrapper - Optional wrapper function
 * @returns {Function} Module initializer
 */
export function createCommonJSModule(factory, wrapper) {
  return () => {
    if (!wrapper) {
      wrapper = { exports: {} };
      factory(wrapper.exports, wrapper);
    }
    return wrapper.exports;
  };
}

/**
 * Define module exports
 * Helper to define multiple exports on a module
 * 
 * @param {object} target - Target module object
 * @param {object} exports - Exports to define
 */
export function defineExports(target, exports) {
  for (const key in exports) {
    defineProperty(target, key, {
      get: exports[key],
      enumerable: true,
      configurable: true,
      set: (value) => exports[key] = () => value
    });
  }
}

/**
 * Lazy module initializer
 * Creates a lazy-loaded module initializer
 * 
 * @param {Function} initializer - Module initialization function
 * @param {any} defaultValue - Default value
 * @returns {Function} Lazy initializer
 */
export function lazyModule(initializer, defaultValue) {
  return () => {
    if (initializer) {
      defaultValue = initializer(initializer = 0);
    }
    return defaultValue;
  };
}