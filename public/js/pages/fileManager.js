// File Manager Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function fileManagerPage() {
  return {
    // State
    activeTab: 'configs',
    configFiles: [],
    resultFiles: [],
    isLoading: false,
    selectedFile: null,
    currentPath: '',
    configPath: '',
    resultPath: '',

    // Initialize
    async init() {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');

      // Check if navigating from queue with specific parameters
      const tab = params.get('tab');
      const path = params.get('path');
      const file = params.get('file');

      if (tab === 'results') {
        // Navigate to results tab with specific directory
        this.activeTab = 'results';
        this.resultPath = path || '';
        this.currentPath = this.resultPath;

        // Store the file to highlight after loading
        this.highlightFile = file;
      } else {
        // Normal navigation
        this.activeTab = params.get('tab') || 'configs';
        const path = params.get('path') || '';

        if (this.activeTab === 'configs') {
          this.configPath = path;
          this.currentPath = this.configPath;
        } else {
          this.resultPath = path;
          this.currentPath = this.resultPath;
        }
      }

      await this.loadFiles();

      // Highlight and scroll to file if specified
      if (this.highlightFile) {
        this.$nextTick(() => {
          const fileElement = document.querySelector(`[data-filename="${this.highlightFile}"]`);
          if (fileElement) {
            fileElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Remove highlight after 3 seconds
            setTimeout(() => {
              fileElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
            }, 3000);
          }
        });
      }
    },

    // Load files based on active tab
    async loadFiles() {
      try {
        this.isLoading = true;

        if (this.activeTab === 'configs') {
          await this.loadConfigFiles();
        } else {
          await this.loadResultFiles();
        }
      } catch (error) {
        notify.error('Failed to load files');
      } finally {
        this.isLoading = false;
      }
    },

    // Load configuration files
    async loadConfigFiles() {
      const url = this.configPath
        ? `/config-files?subpath=${encodeURIComponent(this.configPath)}`
        : '/config-files';

      const response = await api.get(url);
      if (response.success) {
        this.configFiles = response.files || [];
      }
    },

    // Load result files
    async loadResultFiles() {
      const url = this.resultPath
        ? `/output-files?subpath=${encodeURIComponent(this.resultPath)}`
        : '/output-files';

      const response = await api.get(url);
      if (response.success) {
        this.resultFiles = response.files || [];
      }
    },

    // Switch tab
    switchTab(tab) {
      this.activeTab = tab;
      this.currentPath = tab === 'configs' ? this.configPath : this.resultPath;
      this.selectedFile = null;

      const url = `#/files?tab=${tab}${this.currentPath ? '&path=' + encodeURIComponent(this.currentPath) : ''}`;
      window.location.hash = url;
      this.loadFiles();
    },

    // Navigate to folder
    navigateToFolder(folder) {
      if (folder.isDirectory) {
        const newPath = folder.relativePath || folder.name;

        if (this.activeTab === 'configs') {
          this.configPath = newPath;
          this.currentPath = this.configPath;
        } else {
          this.resultPath = newPath;
          this.currentPath = this.resultPath;
        }

        window.location.hash = `#/files?tab=${this.activeTab}&path=${encodeURIComponent(this.currentPath)}`;
        this.loadFiles();
      }
    },

    // Navigate up
    navigateUp() {
      const parts = this.currentPath.split('/');
      parts.pop();
      const newPath = parts.join('/');

      if (this.activeTab === 'configs') {
        this.configPath = newPath;
        this.currentPath = this.configPath;
      } else {
        this.resultPath = newPath;
        this.currentPath = this.resultPath;
      }

      window.location.hash = `#/files?tab=${this.activeTab}${this.currentPath ? '&path=' + encodeURIComponent(this.currentPath) : ''}`;
      this.loadFiles();
    },

    // Get breadcrumbs
    getBreadcrumbs() {
      if (!this.currentPath) return [];

      const parts = this.currentPath.split('/');
      const rootName = this.activeTab === 'configs' ? 'Configs' : 'Results';
      const crumbs = [{ name: rootName, path: '' }];

      parts.forEach((part, index) => {
        if (part) {
          crumbs.push({
            name: part,
            path: parts.slice(0, index + 1).join('/')
          });
        }
      });

      return crumbs;
    },

    // Navigate to breadcrumb
    navigateToBreadcrumb(path) {
      if (this.activeTab === 'configs') {
        this.configPath = path;
        this.currentPath = this.configPath;
      } else {
        this.resultPath = path;
        this.currentPath = this.resultPath;
      }

      window.location.hash = `#/files?tab=${this.activeTab}${path ? '&path=' + encodeURIComponent(path) : ''}`;
      this.loadFiles();
    },

    // Get file icon
    getFileIcon(file) {
      if (file.isDirectory) return '📁';

      const ext = file.name.split('.').pop().toLowerCase();
      switch (ext) {
      case 'json': return '📄';
      case 'md': return '📝';
      case 'txt': return '📃';
      case 'csv': return '📊';
      default: return '📄';
      }
    },

    // Format file size
    formatFileSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Format date
    formatDate(date) {
      if (!date) return '';
      return new Date(date).toLocaleDateString();
    },

    // View file
    viewFile(file) {
      if (file.isDirectory) {
        this.navigateToFolder(file);
      } else {
        const path = file.relativePath || file.name;
        window.location.hash = `#/viewer?path=${encodeURIComponent(path)}&type=${this.activeTab}`;
      }
    },

    // Edit file
    editFile(file) {
      const path = this.activeTab === 'configs'
        ? (file.relativePath || file.name)
        : file.relativePath || file.name;
      window.location.hash = `#/editor?path=${encodeURIComponent(path)}&type=${this.activeTab}`;
    },

    // Generate from config
    generateFromConfig(file) {
      const configName = file.relativePath || file.name;
      window.location.hash = `#/generate?config=${encodeURIComponent(configName)}`;
    },

    // Delete file
    async deleteFile(file) {
      if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
        return;
      }

      try {
        const endpoint = this.activeTab === 'configs'
          ? `/config-file/${encodeURIComponent(file.name)}`
          : `/result-file/${encodeURIComponent(file.relativePath || file.name)}`;

        const response = await api.delete(endpoint);

        if (response.success) {
          notify.success('File deleted successfully');
          await this.loadFiles();
        } else {
          throw new Error(response.error || 'Failed to delete file');
        }
      } catch (error) {
        notify.error('Failed to delete file: ' + error.message);
      }
    },

    // Download file
    async downloadFile(file) {
      try {
        const path = file.relativePath || file.name;
        const url = this.activeTab === 'configs'
          ? `/api/config-file/${encodeURIComponent(file.name)}`
          : `/api/result-file/${encodeURIComponent(path)}`;

        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        notify.success('Download started');
      } catch (error) {
        notify.error('Failed to download file');
      }
    },

    // Create new config
    createNewConfig() {
      window.location.hash = '#/generate';
    },

    // Get current files
    get currentFiles() {
      return this.activeTab === 'configs' ? this.configFiles : this.resultFiles;
    }
  };
}
