// Queue Page Component
export function queuePage() {
  return {
    // State
    activeGenerations: [],
    refreshInterval: null,

    // Initialize
    async init() {
      // Load from localStorage
      this.loadFromStorage();
      
      // Auto-refresh every second to update UI
      this.refreshInterval = setInterval(() => {
        this.loadFromStorage();
      }, 1000);
    },
    
    // Cleanup
    destroy() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
    },

    // Load generations from localStorage
    loadFromStorage() {
      const stored = localStorage.getItem('generations');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          this.activeGenerations = data.active || [];
        } catch (error) {
          console.error('Failed to load generations from storage:', error);
        }
      }
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
        return date.toLocaleDateString();
      }
    }
  };
}