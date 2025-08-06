import { router } from './router.js';
import { api } from './api.js';
import { authStore } from './stores/auth.js';
import { notify } from './utils/notifications.js';
import { generatePage } from './pages/generate.js';

window.api = api;
window.notify = notify;

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

document.addEventListener('alpine:init', () => {
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
    sidebarCollapsed: false,

    get isAdmin() {
      return this.user?.role === 'admin';
    },

    navigation: [
      { path: '/', label: 'Chat', icon: '💬' },
      { path: '/generate', label: 'Generate Data', icon: '🚀' },
      { path: '/queue', label: 'Queue', icon: '📊' },
      { path: '/files', label: 'File Manager', icon: '📁' },
      { path: '/viewer', label: 'Data Viewer', icon: '👁️' },
      { path: '/editor', label: 'Data Editor', icon: '✏️' },
      { path: '/settings', label: 'Settings', icon: '🔧' }
    ],


    async init() {
      const isAuth = authStore.init();

      if (!isAuth) {
        if (!window.location.pathname.includes('login')) {
          window.location.href = '/login.html';
        }
        return;
      }

      this.isAuthenticated = true;
      this.user = authStore.user;

      this.loadAccountInfo();
      this.checkApiKey();

      router.init((route) => {
        this.currentRoute = route;
      });

      this.loading = false;
    },

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
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },

    async logout() {
      authStore.logout();
      window.location.href = '/login.html';
    }
  }));
});
