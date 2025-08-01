// Generate Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';
import { createModelSelector } from '../components/modelSelector.js';

export function generatePage() {
  // Create model selector instance
  const modelSelector = createModelSelector({
    showFilters: true,
    showSearch: false,
    showOnlineToggle: true,
    defaultFilter: 'all'
  });

  return {
    // State
    ...modelSelector,
    config: { showFilters: true }, // Add config for template
    step: 1, // 1: select config, 2: review config, 3: select model, 4: confirm, 5: generating
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
    progress: {
      current: 0,
      total: 0,
      percentage: 0,
      currentItem: null
    },

    // Initialize
    async init() {
      await modelSelector.init.call(this);

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

      this.isGenerating = true;
      this.step = 4; // Generating step
      this.progress = {
        current: 0,
        total: this.parameters.count,
        percentage: 0,
        currentItem: null
      };

      try {
        // Prepare configuration with model settings
        const config = {
          ...this.configContent,
          api: {
            ...this.configContent.api,
            model: this.finalModelId,
            temperature: this.parameters.temperature,
            maxTokens: this.parameters.maxTokens
          },
          output: {
            ...this.configContent.output,
            count: this.parameters.count
          }
        };

        // Use fetch with SSE for streaming updates (POST request)
        const response = await fetch('/api/generate-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ config })
        });

        if (!response.ok) {
          throw new Error('Failed to start generation');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'progress') {
                this.progress = data.progress;
              } else if (data.type === 'complete') {
                this.isGenerating = false;
                notify.success('Generation completed successfully!');
                // Navigate to results
                setTimeout(() => window.location.hash = '#/results', 2000);
              } else if (data.type === 'error') {
                this.isGenerating = false;
                notify.error(data.error);
              }
            }
          }
        }

      } catch (error) {
        this.isGenerating = false;
        notify.error('Failed to start generation: ' + error.message);
      }
    },

    // Override selectModel to move to next step
    selectModel(model) {
      modelSelector.selectModel.call(this, model);
      this.step = 3; // Go to Confirm step
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
