// Generate Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';
import { createModelSelector } from '../components/modelSelector.js';

export function generatePage() {
  // Create model selector instance
  const modelSelector = createModelSelector({
    showFilters: true,
    showSearch: false,
    showOnlineToggle: false, // We handle it separately in the template
    defaultFilter: 'all'
  });

  return {
    // State
    ...modelSelector,
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

      // Create generation object
      const generation = {
        id: Date.now().toString(),
        configName: this.selectedConfig.name,
        config: config,
        model: this.selectedModel.name,
        estimatedCost: this.getEstimatedCost()?.total,
        startTime: Date.now(),
        status: 'active',
        logs: []
      };
      
      // Save to localStorage
      const stored = localStorage.getItem('generations');
      let data = { active: [], completed: [] };
      if (stored) {
        try {
          data = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse stored generations:', e);
        }
      }
      
      data.active.push(generation);
      localStorage.setItem('generations', JSON.stringify(data));
      
      // Start the generation stream immediately
      this.isGenerating = true;
      this.startGenerationStream(generation);
      
      // Navigate to queue after a short delay
      setTimeout(() => {
        window.location.hash = '#/queue';
      }, 1000);
    },
    
    // Start generation stream and update localStorage with progress
    async startGenerationStream(generation) {
      try {
        const response = await fetch('/api/generate-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ 
            config: generation.config,
            estimatedCost: generation.estimatedCost
          })
        });

        if (!response.ok) {
          throw new Error('Failed to start generation');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Process stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              // Update generation in localStorage
              const stored = localStorage.getItem('generations');
              if (stored) {
                const genData = JSON.parse(stored);
                const gen = genData.active.find(g => g.id === generation.id);
                
                if (gen) {
                  if (data.type === 'log') {
                    // Add backend log entry
                    const logEntry = {
                      time: new Date(data.timestamp).toLocaleTimeString(),
                      message: data.message,
                      level: data.level
                    };
                    gen.logs.push(logEntry);
                  } else if (data.type === 'progress') {
                    // Add progress log entry
                    const logEntry = {
                      time: new Date().toLocaleTimeString(),
                      message: `Generating item ${data.progress.current}/${data.progress.total}: ${data.progress.currentItem || 'Processing...'}`,
                      level: 'info'
                    };
                    gen.logs.push(logEntry);
                  } else if (data.type === 'complete') {
                    gen.status = 'completed';
                    gen.endTime = Date.now();
                    gen.stats = data.stats;
                    gen.logs.push({
                      time: new Date().toLocaleTimeString(),
                      message: `✅ Generation completed! Generated ${data.stats?.totalGenerated || 0} items`
                    });
                    // Remove from active after 5 seconds
                    setTimeout(() => {
                      const stored = localStorage.getItem('generations');
                      if (stored) {
                        const d = JSON.parse(stored);
                        d.active = d.active.filter(g => g.id !== generation.id);
                        localStorage.setItem('generations', JSON.stringify(d));
                      }
                    }, 5000);
                    notify.success('Generation completed successfully!');
                  } else if (data.type === 'error') {
                    gen.status = 'failed';
                    gen.error = data.error;
                    gen.logs.push({
                      time: new Date().toLocaleTimeString(),
                      message: `❌ Error: ${data.error}`
                    });
                    notify.error('Generation failed: ' + data.error);
                  } else if (data.type === 'start') {
                    gen.logs.push({
                      time: new Date().toLocaleTimeString(),
                      message: '🚀 Generation started'
                    });
                  }
                  
                  localStorage.setItem('generations', JSON.stringify(genData));
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Stream error:', error);
        notify.error('Generation failed: ' + error.message);
        
        // Update status in localStorage
        const stored = localStorage.getItem('generations');
        if (stored) {
          const data = JSON.parse(stored);
          const gen = data.active.find(g => g.id === generation.id);
          if (gen) {
            gen.status = 'failed';
            gen.error = error.message;
            localStorage.setItem('generations', JSON.stringify(data));
          }
        }
      }
    },

    // Override selectModel to move to next step
    selectModel(model) {
      modelSelector.selectModel.call(this, model);
      // Don't auto-enable online search when selecting a model
      // Only enable it if it was specified in config or user toggles it
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
