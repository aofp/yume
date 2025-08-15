// Polyfills for production build
(function() {
  'use strict';
  
  // Object.assign polyfill
  if (typeof Object.assign !== 'function') {
    Object.defineProperty(Object, "assign", {
      value: function assign(target, varArgs) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var nextSource = arguments[index];
          if (nextSource != null) {
            for (var nextKey in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      },
      writable: true,
      configurable: true
    });
  }
  
  console.log('Polyfills loaded. Object.assign available:', typeof Object.assign === 'function');
  
  // Workaround for require_core error in bundled modules
  window.require_core = function() {
    return { Object: Object };
  };
  
  // Also provide global require if needed
  if (typeof require === 'undefined') {
    window.require = function() { 
      console.warn('require() polyfill called');
      return {}; 
    };
  }
})();