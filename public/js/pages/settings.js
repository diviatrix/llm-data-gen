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

    // Password change state
    showPasswordForm: false,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    isChangingPassword: false,

    // Account preferences
    onlyFreeModels: false,

    // Storage info
    storageInfo: null,

    // Initialize
    async init() {
      await Promise.all([
        this.checkApiKey(),
        this.loadStorageInfo()
      ]);
      // Check system API key if admin
      if (this.$root?.isAdmin) {
        await this.checkSystemApiKey();
      }
    },

    // Load storage info
    async loadStorageInfo() {
      try {
        const response = await api.get('/user/storage-info');
        if (response.success) {
          this.storageInfo = response.storage;
          
          // Load user settings from backend
          if (response.storage.settings) {
            this.onlyFreeModels = response.storage.settings.onlyFreeModels || false;
            
            // Update global state
            if (this.$root) {
              this.$root.onlyFreeModels = this.onlyFreeModels;
              if (this.$root.user && !this.$root.user.settings) {
                this.$root.user.settings = {};
              }
              if (this.$root.user) {
                this.$root.user.settings.onlyFreeModels = this.onlyFreeModels;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load storage info:', error);
      }
    },

    // Format bytes
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    },

    // Password change methods
    canChangePassword() {
      return this.currentPassword &&
             this.newPassword &&
             this.newPassword.length >= 4 &&
             this.newPassword === this.confirmPassword;
    },

    focusNewPassword() {
      this.$nextTick(() => {
        this.$refs.newPasswordInput?.focus();
      });
    },

    focusConfirmPassword() {
      this.$nextTick(() => {
        this.$refs.confirmPasswordInput?.focus();
      });
    },

    cancelPasswordChange() {
      this.showPasswordForm = false;
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    },

    async changePassword() {
      if (!this.canChangePassword()) {
        return;
      }

      try {
        this.isChangingPassword = true;

        const response = await api.post('/auth/change-password', {
          email: this.$root.user.email,
          currentPassword: this.currentPassword,
          newPassword: this.newPassword
        });

        if (response.success) {
          notify.success('Password changed successfully');
          this.cancelPasswordChange();
        } else {
          throw new Error(response.error || 'Failed to change password');
        }
      } catch (error) {
        if (error.message.includes('Invalid credentials')) {
          notify.error('Current password is incorrect');
        } else {
          notify.error('Failed to change password: ' + error.message);
        }
      } finally {
        this.isChangingPassword = false;
      }
    },

    // Update free models preference
    async updateFreeModelsPreference() {
      try {
        const response = await api.put('/user/preferences', {
          onlyFreeModels: this.onlyFreeModels
        });

        if (response.success) {
          // Update the global state
          if (this.$root) {
            this.$root.onlyFreeModels = this.onlyFreeModels;
            // Update user object
            if (this.$root.user) {
              // Ensure settings object exists
              if (!this.$root.user.settings) {
                this.$root.user.settings = {};
              }
              this.$root.user.settings.onlyFreeModels = this.onlyFreeModels;
            }
          }
          
          notify.success(this.onlyFreeModels ? 
            'Restricted to free models only' : 
            'All models are now available');
            
          // Force model selector to refresh if it exists
          const modelSelectors = document.querySelectorAll('.model-selector');
          modelSelectors.forEach(selector => {
            const component = selector._x_dataStack?.[0];
            if (component?.updateFilteredModels) {
              component.updateFilteredModels();
            }
          });
        }
      } catch (error) {
        notify.error('Failed to update preference');
        // Revert the checkbox
        this.onlyFreeModels = !this.onlyFreeModels;
      }
    }
  };
}
