// Main Application Module
import { router } from './router.js';
import { api } from './api.js';
import { authStore } from './stores/auth.js';
import { notify } from './utils/notifications.js';
import { generatePage } from './pages/generate.js';

// Make api and notify available globally for components
window.api = api;
window.notify = notify;

// Define Alpine component
window.Alpine = window.Alpine || {};
window.Alpine.data = window.Alpine.data || function () {};

// Import other pages
import { configPage } from './pages/config.js';
import { resultsPage } from './pages/results.js';
import { chatPage } from './pages/chat.js';
import { viewerPage } from './pages/viewer.js';
import { editorPage } from './pages/editor.js';
import { fileManagerPage } from './pages/fileManager.js';
import { settingsPage } from './pages/settings.js';
import { adminPage } from './pages/admin.js';

// Export page components to global scope
window.generatePage = generatePage;
window.configPage = configPage;
window.resultsPage = resultsPage;
window.chatPage = chatPage;
window.viewerPage = viewerPage;
window.editorPage = editorPage;
window.fileManagerPage = fileManagerPage;
window.settingsPage = settingsPage;
window.dashboardPage = () => ({ init() {} }); // Simple dashboard
window.adminPage = adminPage;

// Register component
document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // State
    loading: true,
    currentRoute: '/',
    isAuthenticated: false,
    isAdmin: false,
    isCloud: false,
    user: null,
    accountInfo: null,
    hasApiKey: false,

    // Navigation items
    navigation: [
      { path: '/', label: 'Dashboard', icon: '🏠' },
      { path: '/generate', label: 'Generate Data', icon: '🚀' },
      { path: '/files', label: 'File Manager', icon: '📁' },
      { path: '/viewer', label: 'Data Viewer', icon: '👁️' },
      { path: '/editor', label: 'Data Editor', icon: '✏️' },
      { path: '/chat', label: 'Chat', icon: '💬' },
      { path: '/settings', label: 'Settings', icon: '🔧' }
    ],

    // Initialize app
    async init() {
      try {
        // Check mode (local vs cloud)
        await this.checkMode();

        // Initialize auth
        if (this.isCloud) {
          const isAuth = await authStore.checkAuth();
          if (!isAuth) {
            window.location.href = '/login.html';
            return;
          }
        } else {
          // Local mode - set as authenticated admin
          this.isAuthenticated = true;
          this.isAdmin = true;
          authStore.isAuthenticated = true;
          authStore.isAdmin = true;
        }

        // Set auth state
        this.isAuthenticated = authStore.isAuthenticated;
        this.user = authStore.user;

        // Load account info
        await this.loadAccountInfo();

        // Check API key
        await this.checkApiKey();

        // Initialize router
        router.init((route) => {
          this.currentRoute = route;
        });

        // Hide loading
        this.loading = false;

      } catch (error) {
        console.error('App initialization error:', error);
        notify.error('Failed to initialize app');
        this.loading = false;
      }
    },

    // Check if running in cloud or local mode
    async checkMode() {
      try {
        const response = await api.get('/mode');
        this.isCloud = response.isCloud;
        this.isAdmin = response.isAdmin;
        authStore.isAdmin = response.isAdmin;
        authStore.isCloud = response.isCloud;
        // Set cloud mode in API client to handle auth properly
        api.isCloud = response.isCloud;
      } catch (error) {
        console.error('Mode check failed:', error);
        // Assume local mode if check fails
        this.isCloud = false;
        this.isAdmin = true;
        api.isCloud = false;
      }
    },

    // Load account info
    async loadAccountInfo() {
      try {
        const response = await api.get('/account');
        if (response.success) {
          this.accountInfo = response.account;
          // If we got account info, it means API key is configured
          this.hasApiKey = true;
        }
      } catch (error) {
        if (error.response?.data?.needsApiKey) {
          this.hasApiKey = false;
        } else {
          console.error('Failed to load account info:', error);
        }
      }
    },

    // Check if user has API key
    async checkApiKey() {
      // Skip personal API key check for admin in local mode
      if (!this.isCloud && this.isAdmin) {
        // Admin in local mode doesn't need personal key, uses system key
        return;
      }
      
      try {
        const response = await api.get('/user/api-key');
        this.hasApiKey = response.hasKey;
      } catch (error) {
        console.error('Failed to check API key:', error);
      }
    },

    // Navigation helper
    navigate(path) {
      router.navigate(path);
    },

    // Logout
    async logout() {
      try {
        await authStore.logout();
        if (this.isCloud) {
          window.location.href = '/login.html';
        } else {
          notify.success('Logged out successfully');
          this.isAuthenticated = false;
          this.user = null;
        }
      } catch (error) {
        notify.error('Logout failed');
      }
    }
  }));
});
