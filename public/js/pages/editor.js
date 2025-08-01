// Data Editor Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function editorPage() {
  return {
    fileName: '',
    filePath: '',
    content: null,
    editableContent: '',
    fileType: 'text',
    isLoading: false,
    error: null,
    hasChanges: false,
    visualMode: false,
    parsedJson: null,
    jsonError: null,

    // Initialize
    async init() {
      // Get file path from URL
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      this.filePath = params.get('path');

      if (this.filePath) {
        this.fileName = this.filePath.split('/').pop();
        await this.loadFile();
      }

      // Listen for beforeunload to warn about unsaved changes
      window.addEventListener('beforeunload', (e) => {
        if (this.hasChanges) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    },

    // Load file content
    async loadFile() {
      try {
        this.isLoading = true;
        this.error = null;

        // Determine file type from extension
        const ext = this.fileName.split('.').pop().toLowerCase();
        switch (ext) {
        case 'json':
          this.fileType = 'json';
          break;
        case 'md':
        case 'markdown':
          this.fileType = 'markdown';
          break;
        default:
          this.fileType = 'text';
        }

        // Determine the right endpoint based on type parameter
        let response;
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const fileType = params.get('type');

        if (fileType === 'configs') {
          // For config files
          response = await api.get(`/config-file/${encodeURIComponent(this.filePath)}`);
        } else {
          // For output files
          response = await api.get(`/result-file/${encodeURIComponent(this.filePath)}`);
        }

        if (response.success) {
          this.content = response.content;
          if (this.fileType === 'json') {
            this.editableContent = JSON.stringify(this.content, null, 2);
            this.parsedJson = JSON.parse(this.editableContent);

            // Auto-switch to visual mode for config files
            if (this.parsedJson.meta && this.parsedJson.generation) {
              this.visualMode = true;
            }
          } else {
            this.editableContent = this.content;
          }
        } else {
          throw new Error(response.error || 'Failed to load file');
        }
      } catch (error) {
        this.error = error.message || 'Failed to load file';
        notify.error(this.error);
      } finally {
        this.isLoading = false;
      }
    },

    // Save file
    async saveFile() {
      if (!this.hasChanges) return;

      try {
        let contentToSave;

        if (this.fileType === 'json') {
          // Validate JSON before saving
          try {
            contentToSave = JSON.parse(this.editableContent);
          } catch (e) {
            notify.error('Invalid JSON: ' + e.message);
            return;
          }
        } else {
          contentToSave = this.editableContent;
        }

        // Determine API endpoint based on type parameter
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const fileType = params.get('type');
        const isConfig = fileType === 'configs';
        const endpoint = isConfig ? '/config-files' : '/output-files';

        const response = await api.post(endpoint, {
          filename: this.fileName,
          content: contentToSave,
          path: this.filePath
        });

        if (response.success) {
          notify.success('File saved successfully');
          this.hasChanges = false;
          this.content = contentToSave;
        } else {
          throw new Error(response.error || 'Failed to save file');
        }
      } catch (error) {
        notify.error('Failed to save file: ' + error.message);
      }
    },

    // Format JSON
    formatJson() {
      try {
        const parsed = JSON.parse(this.editableContent);
        this.editableContent = JSON.stringify(parsed, null, 2);
        this.jsonError = null;
      } catch (e) {
        this.jsonError = 'Invalid JSON: ' + e.message;
      }
    },

    // Validate JSON
    validateJson() {
      try {
        JSON.parse(this.editableContent);
        this.jsonError = null;
        return true;
      } catch (e) {
        this.jsonError = 'Invalid JSON: ' + e.message;
        return false;
      }
    },

    // Switch to visual editor
    switchToVisualEditor() {
      if (this.validateJson()) {
        this.parsedJson = JSON.parse(this.editableContent);
        this.visualMode = true;
      }
    },

    // Switch to code editor
    switchToCodeEditor() {
      this.editableContent = JSON.stringify(this.parsedJson, null, 2);
      this.visualMode = false;
    },

    // Update from visual editor
    updateFromVisual() {
      this.editableContent = JSON.stringify(this.parsedJson, null, 2);
      this.hasChanges = true;
    },

    // Add task
    addTask() {
      if (!this.parsedJson.generation) {
        this.parsedJson.generation = { tasks: [] };
      }
      if (!this.parsedJson.generation.tasks) {
        this.parsedJson.generation.tasks = [];
      }

      this.parsedJson.generation.tasks.push({
        theme: 'New Task',
        count: 10
      });

      this.updateFromVisual();
    },

    // Remove task
    removeTask(index) {
      this.parsedJson.generation.tasks.splice(index, 1);
      this.updateFromVisual();
    },

    // Render markdown content
    renderMarkdownContent(text) {
      if (!text) return '';

      // Use marked.js if available
      if (window.marked) {
        try {
          // Configure marked options
          marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
          });

          return marked.parse(text);
        } catch (e) {
          console.error('Markdown parsing error:', e);
        }
      }

      // Fallback to basic rendering if marked.js is not available
      let html = this.escapeHtml(text);

      // Headers
      html = html.replace(/^### (.*?)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
      html = html.replace(/^## (.*?)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
      html = html.replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

      // Bold and italic
      html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

      // Links
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank">$1</a>');

      // Lists
      html = html.replace(/^\* (.*?)$/gm, '<li class="ml-4">$1</li>');
      html = html.replace(/^- (.*?)$/gm, '<li class="ml-4">$1</li>');
      html = html.replace(/^\d+\. (.*?)$/gm, '<li class="ml-4">$1</li>');

      // Code
      html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>');

      // Line breaks
      html = html.replace(/\n/g, '<br>');

      return html;
    },

    // Escape HTML
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Go back
    goBack() {
      if (this.hasChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
          return;
        }
      }
      window.history.back();
    }
  };
}
