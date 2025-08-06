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
import { queuePage } from './pages/queue.js';
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
window.queuePage = queuePage;
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
    user: null,
    accountInfo: null,
    hasApiKey: false,

    // Computed properties
    get isAdmin() {
      return this.user?.role === 'admin';
    },

    // Navigation items
    navigation: [
      { path: '/', label: 'Dashboard', icon: '🏠' },
      { path: '/generate', label: 'Generate Data', icon: '🚀' },
      { path: '/queue', label: 'Queue', icon: '📊' },
      { path: '/files', label: 'File Manager', icon: '📁' },
      { path: '/viewer', label: 'Data Viewer', icon: '👁️' },
      { path: '/editor', label: 'Data Editor', icon: '✏️' },
      { path: '/chat', label: 'Chat', icon: '💬' },
      { path: '/settings', label: 'Settings', icon: '🔧' }
    ],

    // Initialize app
    async init() {
      // Check for token
      const isAuth = authStore.init();
      
      if (!isAuth) {
        // No token - redirect to login
        if (!window.location.pathname.includes('login')) {
          window.location.href = '/login.html';
        }
        return;
      }

      // We have a token - set state and continue
      this.isAuthenticated = true;
      this.user = authStore.user;

      // Load additional data (don't block on these)
      this.loadAccountInfo();
      this.checkApiKey();

      // Initialize router
      router.init((route) => {
        this.currentRoute = route;
      });

      // Hide loading
      this.loading = false;
    },

    // Load account info
    async loadAccountInfo() {
      try {
        const response = await api.get('/account');
        if (response.success) {
          this.accountInfo = response.account;
          this.hasApiKey = true;
        }
      } catch (error) {
        console.log('Account info error:', error.message);
      }
    },

    // Check if user has API key
    async checkApiKey() {
      try {
        const response = await api.get('/user/api-key');
        this.hasApiKey = response.hasKey;
      } catch (error) {
        console.log('API key check error:', error.message);
      }
    },

    // Navigation helper
    navigate(path) {
      router.navigate(path);
    },

    // Logout
    async logout() {
      authStore.logout();
      window.location.href = '/login.html';
    }
  }));
});