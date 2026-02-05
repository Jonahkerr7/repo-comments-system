// RepoComments - Enterprise Configuration
// This file centralizes all environment-specific configuration

(function() {
  'use strict';

  // Environment detection
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isProduction = hostname.includes('railway.app') ||
                       hostname.includes('github.io') ||
                       (!isLocalhost && !hostname.includes('staging'));
  const isStaging = hostname.includes('staging');

  // Determine environment
  const ENV = isProduction ? 'production' : isStaging ? 'staging' : 'development';

  // API endpoints by environment
  const API_ENDPOINTS = {
    development: 'http://localhost:3000/api/v1',
    staging: 'https://repo-comments-staging.up.railway.app/api/v1',
    production: 'https://renewed-appreciation-production-55e2.up.railway.app/api/v1'
  };

  // WebSocket endpoints by environment
  const WS_ENDPOINTS = {
    development: 'ws://localhost:3000',
    staging: 'wss://repo-comments-staging.up.railway.app',
    production: 'wss://renewed-appreciation-production-55e2.up.railway.app'
  };

  // OAuth callback URLs by environment
  const OAUTH_CALLBACKS = {
    development: 'http://localhost:3000/api/v1/auth/github/callback',
    staging: 'https://repo-comments-staging.up.railway.app/api/v1/auth/github/callback',
    production: 'https://renewed-appreciation-production-55e2.up.railway.app/api/v1/auth/github/callback'
  };

  // Feature flags
  const FEATURES = {
    // Screenshot capture method: 'extension' | 'html2canvas' | 'none'
    screenshotMethod: isLocalhost ? 'extension' : 'html2canvas',

    // Enable debug logging
    debugMode: ENV !== 'production',

    // Enable WebSocket real-time updates
    realTimeUpdates: true,

    // Enable analytics
    analytics: ENV === 'production'
  };

  // Check for localStorage override (useful for local dev pointing to production)
  const apiOverride = localStorage.getItem('repo-comments-api-override');
  const wsOverride = localStorage.getItem('repo-comments-ws-override');

  // Export configuration
  window.RepoCommentsConfig = {
    // Current environment
    env: ENV,

    // API base URL (priority: localStorage > window global > environment default)
    apiUrl: apiOverride || window.REPO_COMMENTS_API_URL || API_ENDPOINTS[ENV],

    // WebSocket URL
    wsUrl: wsOverride || window.REPO_COMMENTS_WS_URL || WS_ENDPOINTS[ENV],

    // OAuth callback
    oauthCallback: OAUTH_CALLBACKS[ENV],

    // Feature flags
    features: FEATURES,

    // Helper to check environment
    isDevelopment: () => ENV === 'development',
    isStaging: () => ENV === 'staging',
    isProduction: () => ENV === 'production',

    // Debug logging
    log: function(...args) {
      if (FEATURES.debugMode) {
        console.log('[RepoComments]', ...args);
      }
    },

    warn: function(...args) {
      if (FEATURES.debugMode) {
        console.warn('[RepoComments]', ...args);
      }
    },

    error: function(...args) {
      console.error('[RepoComments]', ...args);
    }
  };

  // Log configuration on load (in dev mode)
  if (FEATURES.debugMode) {
    console.log('[RepoComments Config]', {
      env: ENV,
      apiUrl: window.RepoCommentsConfig.apiUrl,
      features: FEATURES
    });
  }
})();
