// Chat Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';
import { createModelSelector } from '../components/modelSelector.js';

export function chatPage() {
  const modelSelector = createModelSelector({
    showFilters: true,
    showSearch: true,
    showOnlineToggle: true,
    defaultFilter: 'all'
  });

  return {
    ...modelSelector,
    messages: [],
    newMessage: '',
    isLoading: false,
    chatStarted: false,
    showModelSelector: true,
    lastChat: null,

    async init() {
      // Initialize model selector functionality
      if (modelSelector.init) {
        await modelSelector.init.call(this);
      }
      // Load last chat from localStorage
      this.loadLastChat();
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
          modelId: this.finalModelId(),
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
      if (this.messages.length === 0 && this.lastChat && this.lastChat.modelId === this.finalModelId()) {
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
        content: this.newMessage
      };

      this.messages.push(userMessage);
      this.newMessage = '';
      this.isLoading = true;

      try {
        const response = await api.post('/chat', {
          model: this.finalModelId(),
          messages: this.messages
        });

        if (response.success) {
          this.messages.push({
            role: 'assistant',
            content: response.message,
            metadata: {
              model: this.selectedModel.name,
              modelId: this.finalModelId(),
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
