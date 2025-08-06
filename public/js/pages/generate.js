// Generate Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function generatePage() {
  return {
    // Model selection properties (replacing broken modelSelector)
    models: [],
    filteredModels: [],
    selectedModel: null,
    modelSearch: '',
    enableOnlineSearch: false,
    isLoading: false,

    // Active filters for model selection
    activeFilters: {
      capabilities: [],
      pricing: [],
      context: [],
      moderation: []
    },

    // State
    config: { showFilters: true }, // Add config for template
    step: 1, // 1: select config, 2: select model, 3: confirm
    configs: [],
    selectedConfig: null,
    configContent: null,
    configModel: null, // Model specified in config
    hasConfigParam: false, // Track if config was passed via URL
    parameters: {
      count: 10,
      temperature: 0.7,
      maxTokens: 1000,
      prompt: ''
    },
    isGenerating: false,

    // Computed property for config model object
    get configModelObject() {
      if (!this.configModel || !this.models) return null;
      const baseModelId = this.configModel.replace(':online', '');
      return this.models.find(m => m.id === baseModelId);
    },

    // Initialize
    async init() {
      // Check if config was passed via URL parameter
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const configName = params.get('config');

      if (configName) {
        this.hasConfigParam = true;
        // Don't load all configs, just load the specific one
        try {
          const response = await api.get(`/config-file/${encodeURIComponent(configName)}`);
          if (response.success) {
            this.selectedConfig = { name: configName };
            this.configContent = response.content;

            // Load parameters from config
            if (this.configContent.api) {
              this.parameters.temperature = this.configContent.api.temperature || 0.7;
              this.parameters.maxTokens = this.configContent.api.maxTokens || 1000;

              // Pre-select model from config if specified
              if (this.configContent.api.model) {
                this.configModel = this.configContent.api.model;
                // Handle :online suffix in model ID
                const baseModelId = this.configModel.replace(':online', '');
                const isOnlineSearch = this.configModel.endsWith(':online');

                // Find and pre-select the model in the selector
                const model = this.models.find(m => m.id === baseModelId);
                if (model) {
                  this.selectedModel = model;
                  if (isOnlineSearch) {
                    this.enableOnlineSearch = true;
                  }
                }
              }
            }

            // Calculate total count from generation.tasks
            let totalCount = 10; // default
            if (this.configContent.generation?.tasks && Array.isArray(this.configContent.generation.tasks)) {
              totalCount = this.configContent.generation.tasks.reduce((sum, task) => sum + (task.count || 1), 0);
            } else if (this.configContent.output?.count) {
              totalCount = this.configContent.output.count;
            }
            this.parameters.count = totalCount;

            if (this.configContent.prompt) {
              this.parameters.prompt = this.configContent.prompt;
            }

            // Skip to step 2 (Select Model) directly
            this.step = 2;
            // Load models only when we need them
            await this.loadModels();
          } else {
            notify.error(`Configuration "${configName}" not found`);
            this.hasConfigParam = false;
          }
        } catch (error) {
          notify.error(`Failed to load configuration: ${error.message}`);
          this.hasConfigParam = false;
        }
      } else {
        // No config parameter - load all configs for selection
        await this.loadConfigs();
      }
    },

    // Load user configurations
    async loadConfigs() {
      try {
        const response = await api.get('/config-files');
        if (response.success) {
          this.configs = response.files;
        }
      } catch (error) {
        notify.error('Failed to load configurations');
      }
    },

    // Select configuration (for manual selection from list)
    async selectConfig(config) {
      this.selectedConfig = config;

      // Load config content
      try {
        const response = await api.get(`/config-file/${encodeURIComponent(config.name)}`);
        if (response.success) {
          this.configContent = response.content;

          // Load parameters from config
          if (this.configContent.api) {
            this.parameters.temperature = this.configContent.api.temperature || 0.7;
            this.parameters.maxTokens = this.configContent.api.maxTokens || 1000;

            // Pre-select model from config if specified
            if (this.configContent.api.model) {
              this.configModel = this.configContent.api.model;
              // Handle :online suffix in model ID
              const baseModelId = this.configModel.replace(':online', '');
              const isOnlineSearch = this.configModel.endsWith(':online');

              // Find and pre-select the model in the selector
              const model = this.models.find(m => m.id === baseModelId);
              if (model) {
                this.selectedModel = model;
                if (isOnlineSearch) {
                  this.enableOnlineSearch = true;
                }
              }
            }
          }

          // Calculate total count from generation.tasks
          let totalCount = 10; // default
          if (this.configContent.generation?.tasks && Array.isArray(this.configContent.generation.tasks)) {
            totalCount = this.configContent.generation.tasks.reduce((sum, task) => sum + (task.count || 1), 0);
          } else if (this.configContent.output?.count) {
            totalCount = this.configContent.output.count;
          }
          this.parameters.count = totalCount;

          if (this.configContent.prompt) {
            this.parameters.prompt = this.configContent.prompt;
          }

          this.step = 2; // Go to Select Model
          // Load models only when we need them
          if (!this.models || this.models.length === 0) {
            await this.loadModels();
          }
        }
      } catch (error) {
        notify.error('Failed to load configuration content');
      }
    },

    // Navigate to next step
    nextStep() {
      if (this.step < 3) {
        this.step++;
      }
    },

    // Navigate to previous step
    prevStep() {
      if (this.step > 1) {
        this.step--;
      }
    },

    // Start generation
    async startGeneration() {
      if (!this.selectedModel || !this.selectedConfig) {
        notify.error('Please select a model and configuration');
        return;
      }

      // Prepare configuration with model settings
      const modelId = this.selectedModel ? this.selectedModel.id + (this.enableOnlineSearch ? ':online' : '') : null;
      console.log('Starting generation with model:', modelId, 'Online search enabled:', this.enableOnlineSearch);

      const config = {
        ...this.configContent,
        meta: {
          ...this.configContent.meta,
          name: this.selectedConfig.name
        },
        api: {
          ...this.configContent.api,
          model: modelId,
          temperature: this.parameters.temperature,
          maxTokens: this.parameters.maxTokens
        },
        output: {
          ...this.configContent.output,
          count: this.parameters.count
        }
      };

      console.log('Full config being sent:', JSON.stringify(config, null, 2));

      // Create generation ID
      const generationId = crypto.randomUUID();

      // Start the generation stream immediately
      this.isGenerating = true;
      this.startGenerationStream(config, generationId);

      // Navigate to queue after a short delay
      setTimeout(() => {
        window.location.hash = '#/queue';
      }, 1000);
    },

    // Start generation stream
    async startGenerationStream(config, generationId) {
      try {
        const response = await fetch('/api/generate-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            config,
            generationId,
            estimatedCost: this.getEstimatedCost()?.total
          })
        });

        if (!response.ok) {
          throw new Error('Failed to start generation');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Process stream
        let isDone = false;
        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) {
            isDone = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              // Handle completion and error notifications
              if (data.type === 'complete') {
                notify.success('Generation completed successfully!');
              } else if (data.type === 'error') {
                notify.error('Generation failed: ' + data.error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Stream error:', error);
        notify.error('Generation failed: ' + error.message);

      }
    },

    // Load models
    async loadModels() {
      try {
        this.isLoading = true;
        const response = await api.get('/models');
        if (response.success && response.models) {
          this.models = response.models;
          this.filteredModels = response.models;
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        notify.error('Failed to load models');
      } finally {
        this.isLoading = false;
      }
    },

    // Update filtered models based on search and filters
    updateFilteredModels() {
      let filtered = this.models;

      // Apply search filter
      if (this.modelSearch.trim()) {
        const search = this.modelSearch.toLowerCase();
        filtered = filtered.filter(model =>
          model.name.toLowerCase().includes(search) ||
          model.id.toLowerCase().includes(search)
        );
      }

      // Apply active filters
      const hasActiveFilters = Object.values(this.activeFilters).some(filters => filters.length > 0);

      if (hasActiveFilters) {
        filtered = filtered.filter(model => {
          // Check each filter group
          for (const [, activeValues] of Object.entries(this.activeFilters)) {
            if (activeValues.length === 0) continue;

            const matchesGroup = activeValues.some(filterValue => {
              switch (filterValue) {
              case 'free':
                return !model.pricing || (parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0);
              case 'web-search':
                return model.supports_web_search === true;
              case 'vision':
                return model.input_modalities?.includes('image');
              case 'large-context':
                return model.context_length >= 100000;
              default:
                return false;
              }
            });

            if (!matchesGroup) return false;
          }

          return true;
        });
      }

      this.filteredModels = filtered;
    },

    // Toggle filter
    toggleFilter(groupKey, filterValue) {
      const group = this.activeFilters[groupKey];
      const index = group.indexOf(filterValue);

      if (index === -1) {
        group.push(filterValue);
      } else {
        group.splice(index, 1);
      }

      this.updateFilteredModels();
    },

    // Check if filter is active
    isFilterActive(groupKey, filterValue) {
      return this.activeFilters[groupKey].includes(filterValue);
    },

    // Select model and move to next step
    selectModel(model) {
      this.selectedModel = model;
      this.step = 3; // Go to Confirm step
    },

    // Format price
    formatPrice(pricing) {
      if (!pricing) return 'N/A';
      if (pricing.prompt === 0 && pricing.completion === 0) return 'Free';
      return `$${pricing.prompt}/$${pricing.completion}`;
    },

    // Format context length
    formatContext(length) {
      if (!length) return 'N/A';
      if (length >= 1000000) return `${Math.round(length/1000000)}M`;
      if (length >= 1000) return `${Math.round(length/1000)}K`;
      return length.toString();
    },

    // Get model badges
    getModelBadges(model) {
      const badges = [];
      if (model.pricing?.prompt === 0) badges.push({ label: 'Free', class: 'badge-success' });
      if (model.context_length >= 100000) badges.push({ label: '100K+', class: 'badge-info' });
      if (model.supports_web_search) badges.push({ label: '🌐 Web', class: 'badge-info' });
      if (model.input_modalities?.includes('image')) badges.push({ label: '👁️ Vision', class: 'badge-primary' });
      return badges;
    },

    // Check if model supports online search
    supportsOnlineSearch(model) {
      return model?.supports_web_search === true;
    },

    // Get web search pricing
    getWebSearchPricing(model) {
      if (!model?.web_search_pricing) return null;

      if (model.has_native_web_search && model.web_search_pricing.native) {
        return {
          type: 'native',
          price: model.web_search_pricing.native.medium * 1000,
          label: 'Native Search'
        };
      }

      return {
        type: 'plugin',
        price: model.web_search_pricing.plugin * 1000,
        label: 'Web Search'
      };
    },

    // Get provider name from model
    getProviderName(model) {
      if (!model) return '';
      // Extract provider from model ID (e.g., "openai/gpt-4" -> "OpenAI")
      const provider = model.id.split('/')[0];
      return provider.charAt(0).toUpperCase() + provider.slice(1);
    },

    // Format model modalities
    formatModalities(input, output) {
      const parts = [];
      if (input && input.length > 0) {
        parts.push(input.join(', '));
      }
      if (output && output.length > 0) {
        parts.push('→ ' + output.join(', '));
      }
      return parts.join(' ');
    },

    // Filter groups for model selection
    filterGroups: {
      capabilities: [
        { value: 'web-search', label: '🌐 Web Search' },
        { value: 'vision', label: '👁️ Vision' }
      ],
      pricing: [
        { value: 'free', label: 'Free' }
      ],
      context: [
        { value: 'large-context', label: '100K+ Context' }
      ]
    },

    // Get active filter count
    getActiveFilterCount() {
      return Object.values(this.activeFilters).reduce((sum, filters) => sum + filters.length, 0);
    },

    // Clear all filters
    clearAllFilters() {
      this.activeFilters = {
        capabilities: [],
        pricing: [],
        context: [],
        moderation: []
      };
      this.updateFilteredModels();
    },

    // Get estimated cost
    getEstimatedCost() {
      if (!this.selectedModel || !this.parameters.count) return null;

      const pricing = this.selectedModel.pricing;
      if (!pricing) return { prompt: 0, completion: 0, webSearch: 0, total: 0 };

      // Estimate tokens per item (rough estimate)
      const tokensPerItem = this.parameters.maxTokens || 1000;
      const promptTokens = 500; // Rough estimate for prompt

      const totalPromptTokens = promptTokens * this.parameters.count;
      const totalCompletionTokens = tokensPerItem * this.parameters.count;

      const promptCost = (totalPromptTokens / 1000000) * pricing.prompt;
      const completionCost = (totalCompletionTokens / 1000000) * pricing.completion;

      // Calculate web search cost if enabled
      let webSearchCost = 0;
      if (this.enableOnlineSearch && this.selectedModel.supports_web_search) {
        // Get web search pricing
        const webSearchPricing = this.getWebSearchPricing(this.selectedModel);
        if (webSearchPricing) {
          // Estimate 1 web search per generation item
          webSearchCost = (this.parameters.count / 1000) * webSearchPricing.price;
        }
      }

      return {
        prompt: promptCost.toFixed(4),
        completion: completionCost.toFixed(4),
        webSearch: webSearchCost.toFixed(4),
        total: (promptCost + completionCost + webSearchCost).toFixed(4)
      };
    }
  };
}
