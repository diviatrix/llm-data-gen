// Reusable File Uploader Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export class FileUploader {
  constructor(options = {}) {
    this.onUploadComplete = options.onUploadComplete || (() => {});
    this.onQuotaExceeded = options.onQuotaExceeded || (() => {});
    this.maxFileSize = options.maxFileSize || 100 * 1024 * 1024; // 100MB default
    this.allowMultiple = options.allowMultiple !== false;
    this.acceptTypes = options.acceptTypes || '*/*';
    this.uploadPath = options.uploadPath || '';
  }

  // Create file input element
  createFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.acceptTypes;
    input.multiple = this.allowMultiple;
    input.style.display = 'none';
    return input;
  }

  // Open file picker dialog
  selectFiles() {
    return new Promise((resolve) => {
      const input = this.createFileInput();
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files);
        resolve(files);
        input.remove();
      };
      
      document.body.appendChild(input);
      input.click();
    });
  }

  // Check if files can be uploaded within quota
  async checkQuota(files) {
    try {
      const response = await api.get('/user/storage-info');
      if (!response.success) return false;
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const availableSpace = response.storage.available;
      
      if (totalSize > availableSpace) {
        const usedMB = (response.storage.used / 1024 / 1024).toFixed(2);
        const quotaMB = (response.storage.quota / 1024 / 1024).toFixed(2);
        const neededMB = (totalSize / 1024 / 1024).toFixed(2);
        const availableMB = (availableSpace / 1024 / 1024).toFixed(2);
        
        notify.error(`Недостаточно места. Требуется: ${neededMB}MB, доступно: ${availableMB}MB (${usedMB}/${quotaMB}MB использовано)`);
        this.onQuotaExceeded({ 
          needed: totalSize, 
          available: availableSpace,
          storage: response.storage 
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Quota check failed:', error);
      return true; // Allow upload if quota check fails
    }
  }

  // Upload single file
  async uploadFile(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (this.uploadPath) {
      formData.append('path', this.uploadPath);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Progress tracking
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid server response'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error'));
      
      // Get auth token
      const token = localStorage.getItem('token');
      
      xhr.open('POST', '/api/upload-file');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }

  // Upload multiple files with progress
  async uploadFiles(files, onTotalProgress) {
    // Check quota first
    const canUpload = await this.checkQuota(files);
    if (!canUpload) return [];
    
    const results = [];
    const totalFiles = files.length;
    let completedFiles = 0;
    
    for (const file of files) {
      try {
        // Check individual file size
        if (file.size > this.maxFileSize) {
          notify.error(`Файл ${file.name} слишком большой (максимум ${this.maxFileSize / 1024 / 1024}MB)`);
          continue;
        }
        
        const result = await this.uploadFile(file, (fileProgress) => {
          if (onTotalProgress) {
            const totalProgress = ((completedFiles + fileProgress / 100) / totalFiles) * 100;
            onTotalProgress(totalProgress, file.name);
          }
        });
        
        if (result.success) {
          results.push(result);
          notify.success(`Файл ${file.name} загружен`);
        } else {
          notify.error(`Ошибка загрузки ${file.name}: ${result.error}`);
        }
        
        completedFiles++;
      } catch (error) {
        notify.error(`Ошибка загрузки ${file.name}: ${error.message}`);
        completedFiles++;
      }
    }
    
    this.onUploadComplete(results);
    return results;
  }

  // Setup drag and drop zone
  setupDropZone(element) {
    let dragCounter = 0;
    
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleDragEnter = (e) => {
      preventDefaults(e);
      dragCounter++;
      element.classList.add('drag-over');
    };
    
    const handleDragLeave = (e) => {
      preventDefaults(e);
      dragCounter--;
      if (dragCounter === 0) {
        element.classList.remove('drag-over');
      }
    };
    
    const handleDrop = async (e) => {
      preventDefaults(e);
      dragCounter = 0;
      element.classList.remove('drag-over');
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await this.uploadFiles(files);
      }
    };
    
    // Add event listeners
    ['dragenter', 'dragover'].forEach(eventName => {
      element.addEventListener(eventName, preventDefaults);
    });
    
    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
    
    // Return cleanup function
    return () => {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        element.removeEventListener(eventName, preventDefaults);
      });
      element.removeEventListener('dragenter', handleDragEnter);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('drop', handleDrop);
    };
  }

  // Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Alpine.js data component
export function fileUploaderComponent(options = {}) {
  return {
    isUploading: false,
    uploadProgress: 0,
    uploadingFileName: '',
    storageInfo: null,
    uploader: null,
    
    init() {
      this.uploader = new FileUploader({
        ...options,
        onUploadComplete: (results) => {
          this.isUploading = false;
          this.uploadProgress = 0;
          this.uploadingFileName = '';
          this.loadStorageInfo();
          
          if (options.onUploadComplete) {
            options.onUploadComplete(results);
          }
        },
        onQuotaExceeded: (info) => {
          this.storageInfo = info.storage;
          if (options.onQuotaExceeded) {
            options.onQuotaExceeded(info);
          }
        }
      });
      
      this.loadStorageInfo();
    },
    
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
    
    async selectAndUpload() {
      const files = await this.uploader.selectFiles();
      if (files.length > 0) {
        await this.uploadFiles(files);
      }
    },
    
    async uploadFiles(files) {
      this.isUploading = true;
      this.uploadProgress = 0;
      
      await this.uploader.uploadFiles(files, (progress, fileName) => {
        this.uploadProgress = Math.round(progress);
        this.uploadingFileName = fileName;
      });
      
      this.isUploading = false;
    },
    
    setupDropZone(element) {
      return this.uploader.setupDropZone(element);
    },
    
    formatBytes(bytes) {
      return this.uploader.formatBytes(bytes);
    },
    
    get storagePercentage() {
      if (!this.storageInfo) return 0;
      return Math.round((this.storageInfo.used / this.storageInfo.quota) * 100);
    }
  };
}