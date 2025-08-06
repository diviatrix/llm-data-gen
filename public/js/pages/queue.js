// Queue Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function queuePage() {
  return {
    // State
    activeTab: 'active',
    activeGenerations: [],
    completedGenerations: [],
    refreshInterval: null,
    isLoading: false,

    // Initialize
    async init() {
      // Load from backend
      await this.loadGenerations();

      // Auto-refresh every 3 seconds
      this.refreshInterval = setInterval(() => {
        this.loadGenerations();
      }, 3000);
    },

    // Cleanup
    destroy() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
    },

    // Load both active and completed generations from backend
    async loadGenerations() {
      try {
        this.isLoading = true;
        const response = await api.get('/queue');
        if (response.success) {
          this.activeGenerations = response.active || [];
          this.completedGenerations = response.completed || [];
        }
      } catch (error) {
        console.error('Failed to load generations:', error);
        notify.error('Failed to load generations');
      } finally {
        this.isLoading = false;
      }
    },

    // Format status
    formatStatus(status) {
      const statusMap = {
        'completed': 'Completed',
        'completed_with_errors': 'Completed with errors',
        'failed': 'Failed',
        'cancelled': 'Cancelled'
      };
      return statusMap[status] || status;
    },

    // Format date
    formatDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;

      // Less than 1 hour
      if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'just now';
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      }

      // Less than 24 hours
      if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      }

      // Less than 7 days
      if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
      }

      // Format as date
      return date.toLocaleDateString();
    },

    // Format time
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) { // Less than 1 minute
        return 'just now';
      } else if (diff < 3600000) { // Less than 1 hour
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      } else if (diff < 86400000) { // Less than 1 day
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        return date.toLocaleString();
      }
    },

    // Cancel active generation
    async cancelGeneration(generationId) {
      try {
        const response = await api.post(`/generations/${generationId}/cancel`);
        if (response.success) {
          // Optimistically remove from UI
          this.activeGenerations = this.activeGenerations.filter(g => g.id !== generationId);
          notify.success('Generation cancelled');

          // Refresh to get updated state
          setTimeout(() => this.loadGenerations(), 1000);
        } else {
          notify.error(response.error || 'Failed to cancel generation');
        }
      } catch (error) {
        console.error('Failed to cancel generation:', error);
        notify.error('Failed to cancel generation');
      }
    },

    // Delete completed generation from history
    async deleteGeneration(generationId) {
      if (!confirm('Are you sure you want to delete this generation from history?')) {
        return;
      }

      try {
        const response = await api.delete(`/queue/${generationId}`);
        if (response.success) {
          // Remove from local list
          this.completedGenerations = this.completedGenerations.filter(g => g.id !== generationId);
          notify.success('Generation deleted from history');
        } else {
          notify.error(response.error || 'Failed to delete generation');
        }
      } catch (error) {
        console.error('Failed to delete generation:', error);
        notify.error('Failed to delete generation');
      }
    },

    // Navigate to output file
    navigateToFile(filePath) {
      // filePath is now relative from user output directory
      // Extract directory and filename
      let directory = '';
      let fileName = filePath;

      if (filePath.includes('/')) {
        const parts = filePath.split('/');
        fileName = parts.pop();
        directory = parts.join('/');
      } else if (filePath.includes('\\')) {
        // Handle Windows paths
        const parts = filePath.split('\\');
        fileName = parts.pop();
        directory = parts.join('/');
      }

      // Navigate to files page with directory and file parameters
      // Switch to results tab and navigate to specific directory
      if (directory) {
        window.location.hash = `/files?tab=results&path=${encodeURIComponent(directory)}&file=${encodeURIComponent(fileName)}`;
      } else {
        // If no directory, navigate to root of results
        window.location.hash = `/files?tab=results&file=${encodeURIComponent(fileName)}`;
      }
    },

    // Rerun generation
    async rerunGeneration(generation) {
      // Navigate to generate page with the same config
      if (generation.config_name) {
        window.location.hash = `/generate?config=${encodeURIComponent(generation.config_name)}`;
      } else {
        notify.error('Cannot rerun: configuration name not found');
      }
    }
  };
}
