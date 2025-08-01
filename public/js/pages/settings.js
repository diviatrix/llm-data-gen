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

    // Initialize
    async init() {
      await this.checkApiKey();
    },

    // Check if user has API key
    async checkApiKey() {
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
    }
  };
}
