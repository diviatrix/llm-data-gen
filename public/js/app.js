import { router } from './router.js';
import { api } from './api.js';
import { authStore } from './stores/auth.js';
import { notify } from './utils/notifications.js';
import { generatePage } from './pages/generate.js';
import { i18n } from './stores/i18n.js';

window.api = api;
window.notify = notify;
window.i18n = i18n;

window.Alpine = window.Alpine || {};
window.Alpine.data = window.Alpine.data || function () {};

import { configPage } from './pages/config.js';
import { queuePage } from './pages/queue.js';
import { resultsPage } from './pages/results.js';
import { chatPage } from './pages/chat.js';
import { viewerPage } from './pages/viewer.js';
import { editorPage } from './pages/editor.js';
import { fileManagerPage } from './pages/fileManager.js';
import { settingsPage } from './pages/settings.js';
import { adminPage } from './pages/admin.js';

window.generatePage = generatePage;
window.configPage = configPage;
window.queuePage = queuePage;
window.resultsPage = resultsPage;
window.chatPage = chatPage;
window.viewerPage = viewerPage;
window.editorPage = editorPage;
window.fileManagerPage = fileManagerPage;
window.settingsPage = settingsPage;
window.adminPage = adminPage;

// Initialize i18n before Alpine starts
(async () => {
  try {
    await i18n.init();
    console.log('i18n initialized');
  } catch (err) {
    console.error('Failed to initialize i18n:', err);
  }
})();

document.addEventListener('alpine:init', () => {
  // Register i18n as Alpine store with proper reactivity
  Alpine.store('i18n', i18n);
  Alpine.data('apiKeyConfig', () => ({
    newApiKey: '',
    showApiKeyHelp: false,

    async saveApiKey() {
      if (!this.newApiKey || !this.newApiKey.startsWith('sk-or-')) {
        notify.error('Please enter a valid OpenRouter API key (should start with sk-or-)');
        return;
      }

      try {
        const response = await api.post('/user/api-key', { apiKey: this.newApiKey });
        if (response.success) {
          notify.success('API key saved successfully');
          this.newApiKey = '';
          if (this.$root) {
            this.$root.hasApiKey = true;
            await this.$root.loadAccountInfo();
          }
        } else {
          throw new Error(response.error || 'Failed to save API key');
        }
      } catch (error) {
        notify.error('Failed to save API key: ' + error.message);
      }
    },

    updateApiKey() {
      this.$root.navigate('/settings');
    }
  }));

  Alpine.data('adminPanel', () => ({
    users: [],
    showUsersModal: false,

    async init() {
      await this.loadUsers();
    },

    async loadUsers() {
      try {
        const response = await api.get('/admin/users');
        if (response.success) {
          this.users = response.users || [];
        }
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    },

    async resetUserPassword(userId) {
      if (!confirm('Reset password for this user?')) return;

      try {
        const response = await api.post(`/admin/users/${userId}/reset-password`);
        if (response.success) {
          notify.success('Password reset successfully');
        } else {
          throw new Error(response.error || 'Failed to reset password');
        }
      } catch (error) {
        notify.error('Failed to reset password: ' + error.message);
      }
    },

    async deleteUser(userId) {
      if (!confirm('Delete this user permanently?')) return;

      try {
        const response = await api.delete(`/admin/users/${userId}`);
        if (response.success) {
          notify.success('User deleted successfully');
          await this.loadUsers();
        } else {
          throw new Error(response.error || 'Failed to delete user');
        }
      } catch (error) {
        notify.error('Failed to delete user: ' + error.message);
      }
    },

    logout() {
      this.$root.logout();
    }
  }));

  Alpine.data('app', () => ({
    loading: true,
    currentRoute: '/',
    isAuthenticated: false,
    user: null,
    accountInfo: null,
    hasApiKey: false,
    siteTitle: localStorage.getItem('siteTitle') || 'LLM Data Generator',
    onlyFreeModels: false,
    sidebarOpen: (() => {
      // Check if portrait mode (aspect ratio < 1:1)
      const isPortrait = window.innerWidth < window.innerHeight;
      // If portrait, default to collapsed regardless of localStorage
      if (isPortrait) return false;
      // Otherwise use saved preference
      return localStorage.getItem('sidebarOpen') !== 'false';
    })(),

    get isAdmin() {
      return this.user?.role === 'admin';
    },

    navigation: [
      { path: '/', labelKey: 'navigation.chat', icon: '💬' },
      { path: '/generate', labelKey: 'navigation.generate', icon: '🚀' },
      { path: '/queue', labelKey: 'navigation.queue', icon: '📊' },
      { path: '/files', labelKey: 'navigation.fileManager', icon: '📁' },
      { path: '/viewer', labelKey: 'navigation.viewer', icon: '👁️' },
      { path: '/editor', labelKey: 'navigation.editor', icon: '✏️' },
      { path: '/settings', labelKey: 'navigation.settings', icon: '🔧' }
    ],

    async init() {
      // Ensure i18n is ready
      if (!i18n.translations[i18n.currentLocale]) {
        await i18n.init();
      }
      
      const isAuth = authStore.init();

      if (!isAuth) {
        if (!window.location.pathname.includes('login') && !window.location.pathname.includes('landing')) {
          window.location.href = '/landing.html';
        }
        return;
      }

      this.isAuthenticated = true;
      this.user = authStore.user;
      
      // Check if user has only_free_models restriction from settings
      this.onlyFreeModels = this.user?.settings?.onlyFreeModels || this.user?.only_free_models || false;

      this.loadAccountInfo();
      this.checkApiKey();

      router.init((route) => {
        this.currentRoute = route;
      });

      // Handle window resize for portrait/landscape changes
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      this.loading = false;
    },

    async loadAccountInfo() {
      try {
        const [accountResponse, storageResponse] = await Promise.all([
          api.get('/account'),
          api.get('/user/storage-info')
        ]);
        
        if (accountResponse.success) {
          this.accountInfo = accountResponse.account;
          this.hasApiKey = true;
        }
        
        if (storageResponse.success && storageResponse.storage.settings) {
          // Update onlyFreeModels from backend
          this.onlyFreeModels = storageResponse.storage.settings.onlyFreeModels || false;
          
          // Update user object
          if (this.user) {
            if (!this.user.settings) {
              this.user.settings = {};
            }
            this.user.settings.onlyFreeModels = this.onlyFreeModels;
          }
        }
      } catch (error) {
        console.log('Account info error:', error.message);
      }
    },

    async checkApiKey() {
      try {
        const response = await api.get('/user/api-key');
        this.hasApiKey = response.hasKey;
      } catch (error) {
        console.log('API key check error:', error.message);
      }
    },

    navigate(path) {
      router.navigate(path);
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
      localStorage.setItem('sidebarOpen', this.sidebarOpen.toString());
    },

    handleResize() {
      const isPortrait = window.innerWidth < window.innerHeight;
      // Auto-collapse on portrait screens
      if (isPortrait && this.sidebarOpen) {
        this.sidebarOpen = false;
        // Don't save to localStorage as this is automatic
      } else if (!isPortrait && !this.sidebarOpen) {
        // Restore from localStorage when switching back to landscape
        const savedState = localStorage.getItem('sidebarOpen');
        if (savedState !== 'false') {
          this.sidebarOpen = true;
        }
      }
    },

    async logout() {
      authStore.logout();
      window.location.href = '/login.html';
    }
  }));
});
