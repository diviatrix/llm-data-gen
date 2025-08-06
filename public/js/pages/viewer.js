// Data Viewer Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function viewerPage() {
  return {
    fileName: '',
    filePath: '',
    content: null,
    fileType: 'text',
    isLoading: false,
    error: null,
    renderMarkdown: false, // Disabled by default
    expandedNodes: new Set(),

    // Initialize
    async init() {
      // Get file path from URL
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      this.filePath = params.get('path');

      if (this.filePath) {
        this.fileName = this.filePath.split('/').pop();
        await this.loadFile();
      }
    },

    // Load file content
    async loadFile() {
      try {
        this.isLoading = true;
        this.error = null;

        // Determine file type from extension FIRST
        const ext = this.fileName.split('.').pop().toLowerCase();
        console.log('File extension:', ext);

        switch (ext) {
        case 'json':
          this.fileType = 'json';
          break;
        case 'md':
        case 'markdown':
          this.fileType = 'markdown';
          break;
        case 'js':
        case 'ts':
        case 'jsx':
        case 'tsx':
          this.fileType = 'javascript';
          break;
        case 'py':
          this.fileType = 'python';
          break;
        case 'sql':
          this.fileType = 'sql';
          break;
        case 'css':
          this.fileType = 'css';
          break;
        case 'html':
          this.fileType = 'html';
          break;
        case 'xml':
          this.fileType = 'xml';
          break;
        case 'csv':
          this.fileType = 'csv';
          break;
        case 'txt':
        case 'log':
        default:
          this.fileType = 'text';
        }

        console.log('Determined file type:', this.fileType);

        // Determine which endpoint to use based on the path or type parameter
        let response;
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const pathType = params.get('type');

        if (pathType === 'configs') {
          // For config files
          response = await api.get(`/config-file/${encodeURIComponent(this.filePath)}`);
        } else {
          // For result files
          response = await api.get(`/result-file/${encodeURIComponent(this.filePath)}`);
        }

        if (response.success) {
          console.log('File loaded successfully, content type:', typeof response.content);

          // Handle content based on file type
          if (this.fileType === 'json') {
            try {
              // Try to parse as JSON only for .json files
              this.content = typeof response.content === 'string'
                ? JSON.parse(response.content)
                : response.content;
            } catch (jsonError) {
              // If JSON parsing fails, treat as text
              this.fileType = 'text';
              this.content = response.content;
              this.error = 'File contains invalid JSON, displaying as text';
            }
          } else {
            // For all non-JSON files, keep as raw text
            this.content = response.content;
          }

          // Apply syntax highlighting after content is loaded
          this.$nextTick(() => {
            if (window.Prism && ['javascript', 'python', 'sql', 'css', 'html', 'xml', 'csv'].includes(this.fileType)) {
              Prism.highlightAll();
            }
          });
        } else {
          throw new Error(response.error || 'Failed to load file');
        }
      } catch (error) {
        console.error('Load file error:', error);
        this.error = error.message || 'Failed to load file';
        notify.error(this.error);
      } finally {
        this.isLoading = false;
      }
    },

    // Render JSON with tree view
    renderJson(obj, path = '', level = 0) {
      if (obj === null) return '<span class="text-gray-500">null</span>';
      if (typeof obj !== 'object') {
        // Check if value might be markdown
        if (this.renderMarkdown && typeof obj === 'string' && (obj.includes('#') || obj.includes('*') || obj.includes('['))) {
          return `<span class="markdown-content">${this.renderMarkdownContent(obj)}</span>`;
        }
        // Render primitive values
        if (typeof obj === 'string') return `<span class="text-green-600">"${this.escapeHtml(obj)}"</span>`;
        if (typeof obj === 'number') return `<span class="text-blue-600">${obj}</span>`;
        if (typeof obj === 'boolean') return `<span class="text-purple-600">${obj}</span>`;
        return this.escapeHtml(String(obj));
      }

      const isArray = Array.isArray(obj);
      const entries = isArray ? obj.map((v, i) => [i, v]) : Object.entries(obj);
      const isExpanded = this.expandedNodes.has(path) || level === 0;

      if (entries.length === 0) {
        return isArray ? '[]' : '{}';
      }

      let html = '';
      const toggle = `<button @click="toggleNode('${path}')" class="text-gray-500 hover:text-gray-700 font-mono">
        ${isExpanded ? '▼' : '▶'}
      </button>`;

      html += `<div class="inline">${toggle} ${isArray ? '[' : '{'}</div>`;

      if (isExpanded) {
        html += '<div class="ml-4">';
        entries.forEach(([key, value], index) => {
          const keyPath = path ? `${path}.${key}` : String(key);
          const comma = index < entries.length - 1 ? ',' : '';

          html += '<div class="my-1">';
          if (!isArray) {
            html += `<span class="text-gray-600">"${key}"</span>: `;
          }
          html += this.renderJson(value, keyPath, level + 1) + comma;
          html += '</div>';
        });
        html += '</div>';
        html += `<div>${isArray ? ']' : '}'}</div>`;
      } else {
        html += `<span class="text-gray-500">... ${entries.length} items</span>`;
        html += `<div class="inline">${isArray ? ']' : '}'}</div>`;
      }

      return html;
    },

    // Toggle node expansion
    toggleNode(path) {
      if (this.expandedNodes.has(path)) {
        this.expandedNodes.delete(path);
      } else {
        this.expandedNodes.add(path);
      }
    },

    // Expand all nodes
    expandAll() {
      const addNodes = (obj, path = '') => {
        if (obj && typeof obj === 'object') {
          this.expandedNodes.add(path);
          if (Array.isArray(obj)) {
            obj.forEach((item, i) => addNodes(item, path ? `${path}.${i}` : String(i)));
          } else {
            Object.entries(obj).forEach(([key, value]) => {
              addNodes(value, path ? `${path}.${key}` : key);
            });
          }
        }
      };
      addNodes(this.content);
    },

    // Collapse all nodes
    collapseAll() {
      this.expandedNodes.clear();
    },

    // Render markdown content
    renderMarkdownContent(text) {
      if (!text) return '';

      // Ensure text is a string
      if (typeof text !== 'string') {
        text = String(text);
      }

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

    // Get syntax highlighting language
    getSyntaxLanguage() {
      switch (this.fileType) {
      case 'javascript': return 'javascript';
      case 'python': return 'python';
      case 'sql': return 'sql';
      case 'css': return 'css';
      case 'html': return 'html';
      case 'xml': return 'xml';
      case 'json': return 'json';
      case 'csv': return 'csv';
      default: return 'text';
      }
    },

    // Format content for display
    formatContent() {
      if (!this.content) return '';

      if (this.fileType === 'json') {
        return this.renderJson(this.content);
      } else if (this.fileType === 'markdown') {
        return this.renderMarkdownContent(this.content);
      } else {
        // For code files, return as preformatted text with language hint
        return this.escapeHtml(this.content);
      }
    },

    // Escape HTML
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Go back
    goBack() {
      window.history.back();
    },

    // Edit file
    editFile() {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const fileType = params.get('type');
      window.location.hash = `#/editor?path=${encodeURIComponent(this.filePath)}${fileType ? '&type=' + fileType : ''}`;
    },

    // Download file
    async downloadFile() {
      try {
        let content;
        let type;

        if (this.fileType === 'json') {
          content = JSON.stringify(this.content, null, 2);
          type = 'application/json';
        } else {
          content = this.content;
          type = 'text/plain';
        }

        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notify.success('File downloaded successfully');
      } catch (error) {
        notify.error('Failed to download file');
      }
    }
  };
}
