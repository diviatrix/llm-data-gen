// File Manager Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';
import { FileUploader } from '../components/fileUploader.js';

export function fileManagerPage() {
  return {
    // State
    allFiles: [],
    isLoading: false,
    selectedFile: null,
    currentPath: '',
    
    // New state for file management
    storageInfo: null,
    showFolderModal: false,
    newFolderName: '',
    isCreatingFolder: false,
    showConfigModal: false,
    newConfigName: '',
    isCreatingConfig: false,
    uploader: null,
    isUploading: false,
    uploadProgress: 0,
    uploadingFileName: '',

    // Initialize
    async init() {
      // Initialize file uploader
      this.uploader = new FileUploader({
        onUploadComplete: () => {
          this.loadFiles();
          this.loadStorageInfo();
        },
        onQuotaExceeded: (info) => {
          this.storageInfo = info.storage;
        }
      });
      
      // Load storage info
      await this.loadStorageInfo();
      
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const path = params.get('path') || '';
      const file = params.get('file');
      
      this.currentPath = path;
      this.highlightFile = file;

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

    // Load all files from both configs and results directories
    async loadFiles() {
      try {
        this.isLoading = true;
        
        // Use unified files endpoint
        const response = await api.get(this.currentPath 
          ? `/files?subpath=${encodeURIComponent(this.currentPath)}`
          : '/files');
        
        if (response.success && response.files) {
          this.allFiles = response.files;
        } else {
          this.allFiles = [];
        }
        
      } catch (error) {
        notify.error('Failed to load files');
        this.allFiles = [];
      } finally {
        this.isLoading = false;
      }
    },

    // Navigate to folder
    navigateToFolder(folder) {
      if (folder.isDirectory) {
        const newPath = folder.relativePath || folder.name;
        this.currentPath = newPath;
        window.location.hash = `#/files?path=${encodeURIComponent(this.currentPath)}`;
        this.loadFiles();
      }
    },

    // Navigate up
    navigateUp() {
      const parts = this.currentPath.split('/');
      parts.pop();
      this.currentPath = parts.join('/');
      window.location.hash = `#/files${this.currentPath ? '?path=' + encodeURIComponent(this.currentPath) : ''}`;
      this.loadFiles();
    },

    // Get breadcrumbs
    getBreadcrumbs() {
      if (!this.currentPath) return [];

      const parts = this.currentPath.split('/');
      const crumbs = [{ name: 'Files', path: '' }];

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
      this.currentPath = path;
      window.location.hash = `#/files${path ? '?path=' + encodeURIComponent(path) : ''}`;
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
        window.location.hash = `#/viewer?path=${encodeURIComponent(path)}`;
      }
    },

    // Edit file
    editFile(file) {
      const path = file.relativePath || file.name;
      window.location.hash = `#/editor?path=${encodeURIComponent(path)}`;
    },

    // Generate from config - now validates if file is a valid config
    async generateFromConfig(file) {
      try {
        // First, try to load and validate the file
        const path = file.relativePath || file.name;
        const endpoint = `/file/${encodeURIComponent(path)}`;
          
        const content = await api.getFile(endpoint);
        
        // Parse and validate JSON
        let config;
        try {
          config = JSON.parse(content);
        } catch (e) {
          notify.error('File is not valid JSON');
          return;
        }
        
        // Check if it's a valid config
        // Minimum requirements: must have either api.model or model, and some generation instructions
        const hasModel = config.api?.model || config.model;
        const hasGenerationInstructions = config.schema || config.prompts || config.tasks || config.generation?.tasks;
        
        if (!hasModel) {
          notify.error('Не найдена модель. Добавьте поле api.model или model в конфигурацию');
          return;
        }
        
        if (!hasGenerationInstructions) {
          notify.error('Не найдены инструкции генерации. Добавьте schema, prompts или tasks');
          return;
        }
        
        // If valid, navigate to generate page
        window.location.hash = `#/generate?config=${encodeURIComponent(path)}`;
        
      } catch (error) {
        notify.error('Failed to validate config: ' + error.message);
      }
    },

    // Check if file can be used for generation (is valid JSON config)
    canGenerateFromFile(file) {
      // Only JSON files can be configs
      if (file.isDirectory || !file.name.endsWith('.json')) {
        return false;
      }
      return true; // Will validate on click
    },

    // Delete file
    async deleteFile(file) {
      if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
        return;
      }

      try {
        const path = file.relativePath || file.name;
        const endpoint = `/file/${encodeURIComponent(path)}`;

        const response = await api.delete(endpoint);

        if (response.success) {
          notify.success('File deleted successfully');
          await this.loadFiles();
          await this.loadStorageInfo();
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
        const url = `/api/file/${encodeURIComponent(path)}`;

        // Get token from localStorage
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Fetch file with authorization
        const response = await fetch(url, {
          method: 'GET',
          headers
        });

        if (!response.ok) {
          throw new Error('Failed to download file');
        }

        // Get blob from response
        const blob = await response.blob();
        
        // Create download link
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up
        URL.revokeObjectURL(blobUrl);

        notify.success('Download started');
      } catch (error) {
        notify.error('Failed to download file: ' + error.message);
      }
    },

    // Show create config modal
    createNewConfig() {
      this.showConfigModal = true;
      this.newConfigName = 'new-config.json';
    },
    
    // Create new config file
    async createConfigFile() {
      if (!this.newConfigName.trim()) {
        notify.error('Please enter a config name');
        return;
      }
      
      // Ensure .json extension
      if (!this.newConfigName.endsWith('.json')) {
        this.newConfigName += '.json';
      }
      
      this.isCreatingConfig = true;
      
      try {
        // Default config template
        const defaultConfig = {
          "meta": {
            "name": "New Configuration",
            "version": "1.0",
            "description": "Configuration created from file manager"
          },
          "api": {
            "provider": "openrouter",
            "model": "openrouter/auto",
            "temperature": 0.7,
            "maxTokens": 2000
          },
          "output": {
            "type": "array",
            "itemsPerBatch": 10
          },
          "schema": {
            "type": "object",
            "properties": {
              "example": {
                "type": "string"
              }
            }
          },
          "prompts": {
            "system": "You are a helpful assistant."
          },
          "generation": {
            "tasks": [
              {"theme": "Example", "count": 10}
            ]
          }
        };
        
        const configPath = this.currentPath 
          ? `${this.currentPath}/${this.newConfigName}`
          : this.newConfigName;
          
        const response = await api.post('/config-files', {
          filename: configPath,
          content: defaultConfig
        });
        
        if (response.success) {
          notify.success('Config created successfully');
          this.showConfigModal = false;
          this.newConfigName = '';
          await this.loadFiles();
          
          // Open in editor
          window.location.hash = `#/editor?path=${encodeURIComponent(configPath)}`;
        } else {
          throw new Error(response.error || 'Failed to create config');
        }
      } catch (error) {
        notify.error('Failed to create config: ' + error.message);
      } finally {
        this.isCreatingConfig = false;
      }
    },

    // Get current files
    get currentFiles() {
      return this.allFiles;
    },
    
    // Storage percentage for progress bar
    get storagePercentage() {
      if (!this.storageInfo) return 0;
      return Math.round((this.storageInfo.used / this.storageInfo.quota) * 100);
    },
    
    // Load storage info
    async loadStorageInfo() {
      try {
        const response = await api.get('/user/storage-info');
        if (response.success) {
          this.storageInfo = response.storage;
        }
      } catch (error) {
        console.error('Failed to load storage info:', error);
      }
    },
    
    // Show create folder modal
    showCreateFolderModal() {
      this.showFolderModal = true;
      this.newFolderName = '';
    },
    
    // Create new folder
    async createFolder() {
      if (!this.newFolderName.trim()) {
        notify.error('Please enter a folder name');
        return;
      }
      
      this.isCreatingFolder = true;
      
      try {
        const folderPath = this.currentPath 
          ? `${this.currentPath}/${this.newFolderName}`
          : this.newFolderName;
          
        // Create folder in user files directory
        const endpoint = '/api/files/folder';
          
        const response = await api.post(endpoint, {
          path: folderPath
        });
        
        if (response.success) {
          notify.success('Folder created successfully');
          this.showFolderModal = false;
          this.newFolderName = '';
          await this.loadFiles();
        } else {
          throw new Error(response.error || 'Failed to create folder');
        }
      } catch (error) {
        notify.error('Failed to create folder: ' + error.message);
      } finally {
        this.isCreatingFolder = false;
      }
    },
    
    // Delete folder
    async deleteFolder(folder) {
      if (!confirm(`Are you sure you want to delete the folder "${folder.name}" and all its contents?`)) {
        return;
      }
      
      try {
        const folderPath = folder.relativePath || folder.name;
        const endpoint = `/api/files/folder`;
          
        const response = await api.delete(endpoint + '?path=' + encodeURIComponent(folderPath));
        
        if (response.success) {
          notify.success('Folder deleted successfully');
          await this.loadFiles();
          await this.loadStorageInfo();
        } else {
          throw new Error(response.error || 'Failed to delete folder');
        }
      } catch (error) {
        notify.error('Failed to delete folder: ' + error.message);
      }
    },
    
    // Select and upload files
    async selectAndUploadFiles() {
      const files = await this.uploader.selectFiles();
      if (files.length > 0) {
        await this.uploadFiles(files);
      }
    },
    
    // Upload files
    async uploadFiles(files) {
      this.isUploading = true;
      this.uploadProgress = 0;
      
      // Set upload path based on current location
      this.uploader.uploadPath = this.currentPath;
      
      await this.uploader.uploadFiles(files, (progress, fileName) => {
        this.uploadProgress = Math.round(progress);
        this.uploadingFileName = fileName;
      });
      
      this.isUploading = false;
      await this.loadFiles();
      await this.loadStorageInfo();
    },
    
    // Handle file drop for upload
    async handleDrop(event) {
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        await this.uploadFiles(files);
      }
    },
    
    // Drag and drop for moving files
    draggedFile: null,
    
    // Handle drag start
    handleDragStart(event, file) {
      if (!file.isDirectory) {
        this.draggedFile = file;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', file.name);
        event.target.style.opacity = '0.5';
      }
    },
    
    // Handle drag end
    handleDragEnd(event) {
      // Reset opacity regardless of whether drop was successful
      event.target.style.opacity = '1';
      // Remove drag-over class from all folders and buttons
      document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
      this.draggedFile = null;
    },
    
    // Handle drop on Up button
    async handleDropOnUpButton(event) {
      event.currentTarget.classList.remove('drag-over');
      
      if (!this.draggedFile || !this.currentPath) return;
      
      // Save file name before it gets cleared
      const fileName = this.draggedFile.name;
      
      try {
        const sourcePath = this.draggedFile.relativePath || this.draggedFile.name;
        
        // Get parent path
        const parentPath = this.currentPath.split('/').slice(0, -1).join('/');
        const targetPath = parentPath ? `${parentPath}/${fileName}` : fileName;
        
        // Don't move if already at target location
        if (sourcePath === targetPath) {
          return;
        }
        
        const response = await api.post('/files/move', {
          sourcePath,
          targetPath
        });
        
        if (response.success) {
          notify.success(`Moved ${fileName} up`);
          await this.loadFiles();
        } else {
          throw new Error(response.error || 'Failed to move file');
        }
      } catch (error) {
        notify.error('Failed to move file: ' + error.message);
      }
    },
    
    // Handle drop on folder
    async handleDropOnFolder(event, targetFolder) {
      event.currentTarget.classList.remove('drag-over');
      
      if (!this.draggedFile || !targetFolder.isDirectory) return;
      
      // Save file name before it gets cleared
      const fileName = this.draggedFile.name;
      
      try {
        const sourcePath = this.draggedFile.relativePath || this.draggedFile.name;
        const targetPath = targetFolder.relativePath || targetFolder.name;
        
        // Don't move to same location
        if (sourcePath === targetPath) {
          return;
        }
        
        const response = await api.post('/files/move', {
          sourcePath,
          targetPath: `${targetPath}/${fileName}`
        });
        
        if (response.success) {
          notify.success(`Moved ${fileName} to ${targetFolder.name}`);
          await this.loadFiles();
        } else {
          throw new Error(response.error || 'Failed to move file');
        }
      } catch (error) {
        notify.error('Failed to move file: ' + error.message);
      }
    }
  };
}
