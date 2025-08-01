// Notification utilities
class NotificationManager {
  constructor() {
    this.container = null;
  }

  init() {
    this.container = document.getElementById('notifications');
  }

  show(message, type = 'info', duration = 5000) {
    if (!this.container) {
      this.init();
    }

    const id = `notification-${Date.now()}`;

    // Create notification element
    const notification = document.createElement('div');
    notification.id = id;
    notification.className = `alert alert-${type} animate-slide-up flex items-start gap-3 min-w-[300px] max-w-md shadow-lg`;

    // Get icon based on type
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    notification.innerHTML = `
            <span class="alert-icon">${icons[type]}</span>
            <div class="flex-1">
                <p class="text-sm">${message}</p>
            </div>
            <button onclick="window.notify.remove('${id}')" class="icon-btn p-1">
                <span class="text-lg">×</span>
            </button>
        `;

    // Add to container
    this.container.appendChild(notification);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  remove(id) {
    const notification = document.getElementById(id);
    if (notification) {
      notification.classList.add('animate-fade-out');
      setTimeout(() => notification.remove(), 300);
    }
  }

  // Convenience methods
  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }
}

// Export singleton
export const notify = new NotificationManager();
