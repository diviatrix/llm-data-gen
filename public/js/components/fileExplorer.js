// File Explorer Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function createFileExplorer(config = {}) {
  return {
    // Configuration
    basePath: config.basePath || '', // Base path for API calls
    showActions: config.showActions !== false, // Show action buttons
    allowNavigation: config.allowNavigation !== false, // Allow folder navigation
    viewMode: config.viewMode || 'cards', // 'cards' or 'list'

    // State
    files: [],
    currentPath: '',
    isLoading: false,
    selectedFile: null,
    sortBy: 'name', // 'name', 'date', 'size', 'type'
    sortDirection: 'asc',
    searchQuery: '',

    // Initialize
    async init() {
      await this.loadFiles();
    },

    // Load files from current path
    async loadFiles(path = '') {
      try {
        this.isLoading = true;
        const endpoint = path ?
          `${this.basePath}?subpath=${encodeURIComponent(path)}` :
          this.basePath;

        const response = await api.get(endpoint);
        if (response.success) {
          this.files = response.files || [];
          this.currentPath = response.currentPath || path;
          this.sortFiles();
        }
      } catch (error) {
        notify.error('Failed to load files');
      } finally {
        this.isLoading = false;
      }
    },

    // Navigate to folder
    async navigateToFolder(folder) {
      if (!this.allowNavigation || !folder.isDirectory) return;

      const newPath = this.currentPath ?
        `${this.currentPath}/${folder.name}` :
        folder.name;
      await this.loadFiles(newPath);
    },

    // Navigate up
    async navigateUp() {
      if (!this.allowNavigation || !this.currentPath) return;

      const parts = this.currentPath.split('/');
      parts.pop();
      await this.loadFiles(parts.join('/'));
    },

    // Sort files
    sortFiles() {
      this.files.sort((a, b) => {
        // Directories first
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;

        let aVal, bVal;
        switch (this.sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'date':
          aVal = new Date(a.modified || a.created);
          bVal = new Date(b.modified || b.created);
          break;
        case 'size':
          aVal = a.size || 0;
          bVal = b.size || 0;
          break;
        case 'type':
          aVal = a.extension || '';
          bVal = b.extension || '';
          break;
        default:
          aVal = a.name;
          bVal = b.name;
        }

        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    },

    // Change sort
    changeSort(field) {
      if (this.sortBy === field) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortBy = field;
        this.sortDirection = 'asc';
      }
      this.sortFiles();
    },

    // Get filtered files
    filteredFiles() {
      if (!this.searchQuery) return this.files;

      const query = this.searchQuery.toLowerCase();
      return this.files.filter(file =>
        file.name.toLowerCase().includes(query)
      );
    },

    // View file
    viewFile(file) {
      if (file.isDirectory) {
        this.navigateToFolder(file);
      } else {
        // Navigate to viewer with file path
        const fullPath = this.currentPath ?
          `${this.currentPath}/${file.name}` :
          file.name;
        window.location.hash = `#/viewer?path=${encodeURIComponent(fullPath)}`;
      }
    },

    // Edit file
    editFile(file) {
      if (file.isDirectory) return;

      const fullPath = this.currentPath ?
        `${this.currentPath}/${file.name}` :
        file.name;
      window.location.hash = `#/editor?path=${encodeURIComponent(fullPath)}`;
    },

    // Delete file
    async deleteFile(file) {
      if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
        return;
      }

      try {
        const fullPath = this.currentPath ?
          `${this.currentPath}/${file.name}` :
          file.name;

        const endpoint = this.basePath ?
          `${this.basePath}/${encodeURIComponent(fullPath)}` :
          `/file/${encodeURIComponent(fullPath)}`;

        const response = await api.delete(endpoint);
        if (response.success) {
          notify.success('File deleted successfully');
          await this.loadFiles(this.currentPath);
        }
      } catch (error) {
        notify.error('Failed to delete file');
      }
    },

    // Get file icon
    getFileIcon(file) {
      if (file.isDirectory) return '📁';

      const ext = file.extension?.toLowerCase() || '';
      switch (ext) {
      case '.json': return '📄';
      case '.txt': return '📝';
      case '.md': return '📑';
      case '.csv': return '📊';
      case '.xml': return '📋';
      case '.html': return '🌐';
      case '.js': return '💻';
      case '.py': return '🐍';
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif': return '🖼️';
      default: return '📄';
      }
    },

    // Format file size
    formatFileSize(bytes) {
      if (!bytes) return '0 B';

      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    },

    // Format date
    formatDate(date) {
      if (!date) return '';
      return new Date(date).toLocaleDateString();
    },

    // Get breadcrumbs
    breadcrumbs() {
      if (!this.currentPath) return [];

      const parts = this.currentPath.split('/');
      const crumbs = [{ name: 'Home', path: '' }];

      let path = '';
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        crumbs.push({ name: part, path });
      }

      return crumbs;
    }
  };
}
