// Settings Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function settingsPage() {
  return {
    // State
    hasApiKey: false,
    apiKey: '',
    showApiKey: false,
    isLoading: false,
    isSaving: false,
    isDeleting: false,
    
    // System API Key state (for admin)
    hasSystemApiKey: false,
    systemApiKey: '',
    showSystemApiKey: false,
    isLoadingSystemKey: false,
    isSavingSystemKey: false,
    isDeletingSystemKey: false,

    // Initialize
    async init() {
      await this.checkApiKey();
      // Check system API key if admin in local mode
      if (this.$root?.isAdmin && !this.$root?.isCloud) {
        await this.checkSystemApiKey();
      }
    },

    // Check if user has API key
    async checkApiKey() {
      // Skip for admin in local mode - they don't have user auth
      if (this.$root?.isAdmin && !this.$root?.isCloud) {
        this.isLoading = false;
        this.hasApiKey = false; // Admin uses system key, not personal
        return;
      }
      
      try {
        this.isLoading = true;
        const response = await api.get('/user/api-key');
        this.hasApiKey = response.hasKey || false;
      } catch (error) {
        console.error('Failed to check API key:', error);
      } finally {
        this.isLoading = false;
      }
    },

    // Save API key
    async saveApiKey() {
      if (!this.apiKey || !this.apiKey.startsWith('sk-or-')) {
        notify.error('Please enter a valid OpenRouter API key (should start with sk-or-)');
        return;
      }

      try {
        this.isSaving = true;
        const response = await api.post('/user/api-key', { apiKey: this.apiKey });

        if (response.success) {
          notify.success('API key saved successfully');
          this.hasApiKey = true;
          this.apiKey = '';
          this.showApiKey = false;
        } else {
          throw new Error(response.error || 'Failed to save API key');
        }
      } catch (error) {
        notify.error('Failed to save API key: ' + error.message);
      } finally {
        this.isSaving = false;
      }
    },

    // Delete API key
    async deleteApiKey() {
      if (!confirm('Are you sure you want to delete your API key? This action cannot be undone.')) {
        return;
      }

      try {
        this.isDeleting = true;
        const response = await api.delete('/user/api-key');

        if (response.success) {
          notify.success('API key deleted successfully');
          this.hasApiKey = false;
        } else {
          throw new Error(response.error || 'Failed to delete API key');
        }
      } catch (error) {
        notify.error('Failed to delete API key: ' + error.message);
      } finally {
        this.isDeleting = false;
      }
    },

    // Check if system has API key
    async checkSystemApiKey() {
      try {
        this.isLoadingSystemKey = true;
        const response = await api.get('/admin/system-api-key');
        this.hasSystemApiKey = response.hasKey || false;
      } catch (error) {
        console.error('Failed to check system API key:', error);
      } finally {
        this.isLoadingSystemKey = false;
      }
    },

    // Save system API key
    async saveSystemApiKey() {
      if (!this.systemApiKey || !this.systemApiKey.startsWith('sk-or-')) {
        notify.error('Please enter a valid OpenRouter API key (should start with sk-or-)');
        return;
      }

      try {
        this.isSavingSystemKey = true;
        const response = await api.post('/admin/system-api-key', { apiKey: this.systemApiKey });

        if (response.success) {
          notify.success('System API key saved successfully');
          this.hasSystemApiKey = true;
          this.systemApiKey = '';
          this.showSystemApiKey = false;
          // Reload account info to reflect system key
          if (this.$root?.loadAccountInfo) {
            await this.$root.loadAccountInfo();
          }
        } else {
          throw new Error(response.error || 'Failed to save system API key');
        }
      } catch (error) {
        notify.error('Failed to save system API key: ' + error.message);
      } finally {
        this.isSavingSystemKey = false;
      }
    },

    // Delete system API key
    async deleteSystemApiKey() {
      if (!confirm('Are you sure you want to delete the system API key? This will affect all default operations.')) {
        return;
      }

      try {
        this.isDeletingSystemKey = true;
        const response = await api.delete('/admin/system-api-key');

        if (response.success) {
          notify.success('System API key deleted successfully');
          this.hasSystemApiKey = false;
          // Reload account info
          if (this.$root?.loadAccountInfo) {
            await this.$root.loadAccountInfo();
          }
        } else {
          throw new Error(response.error || 'Failed to delete system API key');
        }
      } catch (error) {
        notify.error('Failed to delete system API key: ' + error.message);
      } finally {
        this.isDeletingSystemKey = false;
      }
    }
  };
}
