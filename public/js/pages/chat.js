// Chat Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';
import { createModelSelector } from '../components/modelSelector.js';

export function chatPage() {
  // Create model selector instance
  const modelSelector = createModelSelector({
    showFilters: true,
    showSearch: true,
    showOnlineToggle: true,
    defaultFilter: 'all',
    onSelect: (model, modelId) => {
      console.log('Model selected:', model.name, modelId);
    }
  });

  return {
    // Spread model selector properties and methods
    ...modelSelector,
    // Chat-specific properties
    messages: [],
    newMessage: '',
    chatStarted: false,
    showModelSelector: true,
    lastChat: null,
    messageFormats: {},

    // File attachment properties
    showFilePicker: false,
    filePickerTab: 'uploads',
    availableFiles: [],
    selectedFiles: [],
    attachedFiles: [],
    isLoadingFiles: false,
    isUploading: false,
    storageInfo: null,

    async init() {
      // Initialize model selector
      await modelSelector.init.call(this);

      // Load other chat-specific data
      this.loadLastChat();
      await this.loadStorageInfo();
    },

    // Load user storage info
    async loadStorageInfo() {
      try {
        const response = await api.get('/user/storage-info');
        if (response.success) {
          this.storageInfo = response.storage;
        }
      } catch (e) {
        console.error('Failed to load storage info:', e);
      }
    },

    // Load files for current tab
    async loadFilesForTab() {
      this.isLoadingFiles = true;
      this.availableFiles = [];

      try {
        let endpoint;
        switch (this.filePickerTab) {
        case 'uploads':
          endpoint = '/user-files';
          break;
        case 'configs':
          endpoint = '/files/list?type=configs';
          break;
        case 'outputs':
          endpoint = '/files/list?type=output';
          break;
        default:
          return;
        }

        const response = await api.get(endpoint);
        if (response.success) {
          this.availableFiles = response.files || [];
        }
      } catch (e) {
        console.error('Failed to load files:', e);
        notify.error('Failed to load files');
      } finally {
        this.isLoadingFiles = false;
      }
    },

    // Handle file upload
    async handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      // Check file size against quota
      if (this.storageInfo) {
        const available = this.storageInfo.quota - this.storageInfo.used;
        if (file.size > available) {
          notify.error(`File too large. You have ${this.formatBytes(available)} available.`);
          event.target.value = '';
          return;
        }
      }

      this.isUploading = true;
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/api/upload-file', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        const result = await response.json();
        if (result.success) {
          notify.success('File uploaded successfully');
          await this.loadFilesForTab();
          await this.loadStorageInfo();
          event.target.value = '';
        } else {
          notify.error(result.error || 'Failed to upload file');
        }
      } catch (e) {
        console.error('Upload error:', e);
        notify.error('Failed to upload file');
      } finally {
        this.isUploading = false;
      }
    },

    // Toggle file selection
    toggleFileSelection(file) {
      const index = this.selectedFiles.findIndex(f => f.path === file.path);
      if (index >= 0) {
        this.selectedFiles.splice(index, 1);
      } else {
        this.selectedFiles.push(file);
      }
    },

    // Check if file is selected
    isFileSelected(file) {
      return this.selectedFiles.some(f => f.path === file.path);
    },

    // Attach selected files
    attachSelectedFiles() {
      this.attachedFiles = [...this.attachedFiles, ...this.selectedFiles];
      this.selectedFiles = [];
      this.showFilePicker = false;
    },

    // Remove attachment
    removeAttachment(index) {
      this.attachedFiles.splice(index, 1);
    },

    // Format bytes
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    toggleMessageFormat(messageIndex) {
      const messageId = `msg-${messageIndex}`;
      this.messageFormats[messageId] = !this.messageFormats[messageId];
    },

    isRawFormat(messageIndex) {
      return this.messageFormats[`msg-${messageIndex}`] || false;
    },

    renderMarkdown(content) {
      if (typeof marked === 'undefined') return content;
      const html = marked.parse(content);
      if (typeof window.DOMPurify !== 'undefined') {
        return window.DOMPurify.sanitize(html);
      }
      return html;
    },

    // Load last chat from localStorage
    loadLastChat() {
      try {
        const saved = localStorage.getItem('llm-chat-history');
        if (saved) {
          this.lastChat = JSON.parse(saved);
        }
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    },

    // Save current chat to localStorage
    saveChat() {
      try {
        const chatData = {
          model: this.selectedModel?.name,
          modelId: modelSelector.finalModelId.call(this),
          messages: this.messages,
          timestamp: new Date().toISOString(),
          enableOnlineSearch: this.enableOnlineSearch
        };
        localStorage.setItem('llm-chat-history', JSON.stringify(chatData));
        this.lastChat = chatData;
      } catch (e) {
        console.error('Failed to save chat history:', e);
      }
    },

    // Start or change chat
    startOrChangeChat() {
      if (!this.selectedModel) return;

      this.chatStarted = true;
      this.showModelSelector = false;

      // If changing model, keep the messages
      if (this.messages.length === 0 && this.lastChat && this.lastChat.modelId === modelSelector.finalModelId.call(this)) {
        // Restore last chat if same model
        this.messages = this.lastChat.messages;
      }
    },

    // Resume last chat
    resumeLastChat() {
      if (!this.lastChat) return;

      // Set the model from last chat
      const baseModelId = this.lastChat.modelId.replace(':online', '');
      this.enableOnlineSearch = this.lastChat.modelId.endsWith(':online');
      this.selectedModel = this.models.find(m => m.id === baseModelId);

      // Restore messages
      this.messages = this.lastChat.messages;
      this.chatStarted = true;
      this.showModelSelector = false;
    },

    async sendMessage() {
      if (!this.newMessage.trim() || !this.selectedModel) {
        return;
      }

      const userMessage = {
        role: 'user',
        content: this.newMessage,
        attachments: this.attachedFiles.map(f => ({
          name: f.name,
          path: f.path
        }))
      };

      this.messages.push(userMessage);
      this.newMessage = '';
      const currentAttachments = [...this.attachedFiles];
      this.attachedFiles = [];
      this.isLoading = true;

      try {
        const response = await api.post('/chat', {
          model: modelSelector.finalModelId.call(this),
          messages: this.messages,
          attachments: currentAttachments
        });

        if (response.success) {
          this.messages.push({
            role: 'assistant',
            content: response.message,
            metadata: {
              model: this.selectedModel.name,
              modelId: modelSelector.finalModelId.call(this),
              cost: response.usage?.total_cost || 0,
              tokens: response.usage?.total_tokens || 0,
              timestamp: new Date().toISOString(),
              online: this.enableOnlineSearch
            }
          });

          // Save chat to localStorage
          this.saveChat();
        }
      } catch (error) {
        notify.error('Failed to send message');
        // Remove the user message if request failed
        this.messages.pop();
        this.newMessage = userMessage.content;
        this.attachedFiles = currentAttachments;
      } finally {
        this.isLoading = false;
      }
    },

    clearChat() {
      if (confirm('Are you sure you want to clear the chat history?')) {
        this.messages = [];
        localStorage.removeItem('llm-chat-history');
        this.lastChat = null;
        this.chatStarted = false;
        this.showModelSelector = true;
      }
    },

    // Toggle model selector visibility
    toggleModelSelector() {
      this.showModelSelector = !this.showModelSelector;
    }
  };
}
