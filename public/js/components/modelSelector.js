// Reusable Model Selector Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function createModelSelector(options = {}) {
  const defaults = {
    showFilters: true,
    showSearch: true,
    showOnlineToggle: false,
    defaultFilter: 'all',
    onSelect: null,
    selectedModelId: null
  };

  const config = { ...defaults, ...options };

  return {
    // State
    models: [],
    selectedModel: null,
    modelSearch: '',
    modelFilter: config.defaultFilter, // Quick filter used by template
    enableOnlineSearch: false,
    isLoading: false,
    showFilters: config.showFilters,
    showSearch: config.showSearch,
    showOnlineToggle: config.showOnlineToggle,
    showDetailedFilters: false,
    initialized: false,

    // Active filters (multiple selection for detailed filters)
    activeFilters: {
      provider: [],
      capabilities: [],
      pricing: [],
      context: [],
      moderation: []
    },

    // Filter groups with counts
    filterGroups: {
      capabilities: {
        label: 'Capabilities',
        filters: [
          { value: 'multimodal', label: 'Multimodal', count: 0, icon: '🖼️' },
          { value: 'has-tools', label: 'Tools', count: 0, icon: '🔧' },
          { value: 'structured-output', label: 'JSON Output', count: 0, icon: '📋' },
          { value: 'vision', label: 'Vision', count: 0, icon: '👁️' },
          { value: 'audio', label: 'Audio', count: 0, icon: '🎵' },
          { value: 'web-search', label: 'Web Search', count: 0, icon: '🌐' },
          { value: 'native-web-search', label: 'Native Search', count: 0, icon: '🔍' }
        ]
      },
      pricing: {
        label: 'Pricing',
        filters: [
          { value: 'free', label: 'Free', count: 0, icon: '🆓' },
          { value: 'cheap', label: 'Low Cost', count: 0, icon: '💰' },
          { value: 'premium', label: 'Premium', count: 0, icon: '💎' }
        ]
      },
      context: {
        label: 'Context Size',
        filters: [
          { value: 'small-context', label: '< 10K', count: 0, icon: '📄' },
          { value: 'medium-context', label: '10K - 100K', count: 0, icon: '📚' },
          { value: 'large-context', label: '> 100K', count: 0, icon: '📖' }
        ]
      },
      moderation: {
        label: 'Safety',
        filters: [
          { value: 'moderated', label: 'Moderated', count: 0, icon: '🛡️' },
          { value: 'unmoderated', label: 'Unmoderated', count: 0, icon: '⚡' }
        ]
      }
    },

    // Initialize
    async init() {
      // Prevent multiple init calls
      if (this.initialized) return;
      this.initialized = true;

      await this.loadModels.call(this);

      // Pre-select model if provided
      if (config.selectedModelId) {
        const baseModelId = config.selectedModelId.replace(':online', '');
        this.enableOnlineSearch = config.selectedModelId.endsWith(':online');
        this.selectedModel = this.models.find(m =>
          m.id === config.selectedModelId || m.id === baseModelId
        );
      }

      // Set up watchers for auto-updating filtered models
      this._setupWatchers();
    },

    // Set up reactive watchers
    _setupWatchers() {
      // Watch modelSearch
      let modelSearchValue = this.modelSearch;
      Object.defineProperty(this, 'modelSearch', {
        get() {
          return modelSearchValue;
        },
        set(value) {
          modelSearchValue = value;
          this.updateFilteredModels();
        }
      });

      // Watch modelFilter
      let modelFilterValue = this.modelFilter;
      Object.defineProperty(this, 'modelFilter', {
        get() {
          return modelFilterValue;
        },
        set(value) {
          modelFilterValue = value;
          this.updateFilteredModels();
        }
      });
    },

    // Load available models
    async loadModels() {
      try {
        this.isLoading = true;
        const response = await api.get('/models');
        if (response.success) {
          this.models = response.models;
          this.updateFilterCounts();
          this.updateFilteredModels();
        }
      } catch (error) {
        notify.error('Failed to load models');
      } finally {
        this.isLoading = false;
      }
    },

    // Update filter counts
    updateFilterCounts() {
      // Reset counts
      Object.values(this.filterGroups).forEach(group => {
        group.filters.forEach(filter => {
          filter.count = 0;
        });
      });

      // Count models for each filter
      this.models.forEach(model => {
        // Capabilities
        if (model.input_modalities?.includes('image') || model.input_modalities?.includes('audio')) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'multimodal').count++;
        }
        if (model.input_modalities?.includes('image')) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'vision').count++;
        }
        if (model.input_modalities?.includes('audio')) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'audio').count++;
        }
        if (model.supported_parameters?.includes('tools')) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'has-tools').count++;
        }
        if (model.supported_parameters?.includes('response_format')) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'structured-output').count++;
        }
        if (model.supports_web_search) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'web-search').count++;
        }
        if (model.has_native_web_search) {
          this.filterGroups.capabilities.filters.find(f => f.value === 'native-web-search').count++;
        }

        // Pricing
        const promptPrice = parseFloat(model.pricing?.prompt || 0);
        const completionPrice = parseFloat(model.pricing?.completion || 0);
        if (promptPrice === 0 && completionPrice === 0) {
          this.filterGroups.pricing.filters.find(f => f.value === 'free').count++;
        } else if (promptPrice <= 0.000001 && completionPrice <= 0.000003) {
          this.filterGroups.pricing.filters.find(f => f.value === 'cheap').count++;
        } else {
          this.filterGroups.pricing.filters.find(f => f.value === 'premium').count++;
        }

        // Context
        const contextLength = model.context_length || 0;
        if (contextLength < 10000) {
          this.filterGroups.context.filters.find(f => f.value === 'small-context').count++;
        } else if (contextLength >= 10000 && contextLength < 100000) {
          this.filterGroups.context.filters.find(f => f.value === 'medium-context').count++;
        } else {
          this.filterGroups.context.filters.find(f => f.value === 'large-context').count++;
        }

        // Moderation
        if (model.is_moderated) {
          this.filterGroups.moderation.filters.find(f => f.value === 'moderated').count++;
        } else {
          this.filterGroups.moderation.filters.find(f => f.value === 'unmoderated').count++;
        }
      });
    },

    // Computed property for filtered models
    filteredModels: [],

    // Update filtered models
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

      // Apply quick filter first (from template buttons)
      if (this.modelFilter && this.modelFilter !== 'all') {
        filtered = filtered.filter(model => {
          switch (this.modelFilter) {
          case 'free':
            return !model.pricing || (parseFloat(model.pricing.prompt || 0) === 0 && parseFloat(model.pricing.completion || 0) === 0);
          case 'cheap': {
            const promptPrice = parseFloat(model.pricing?.prompt || 0);
            const completionPrice = parseFloat(model.pricing?.completion || 0);
            return promptPrice > 0 && promptPrice < 0.000001 && completionPrice < 0.000003;
          }
          case 'fast':
            // Consider models with small size or known fast models
            return model.id.includes('gpt-3.5') || model.id.includes('mistral-7b') ||
                   model.id.includes('llama-3.1-8b') || model.id.includes('llama-3.2') ||
                   model.id.includes('gemini-flash') || model.id.includes('claude-3-haiku');
          case 'smart':
            // Top tier models
            return model.id.includes('gpt-4') || model.id.includes('claude-3-opus') ||
                   model.id.includes('claude-3.5') || model.id.includes('gemini-pro') ||
                   model.id.includes('o1-preview') || model.id.includes('o1-mini');
          case 'coding':
            // Models good for coding
            return model.id.includes('codestral') || model.id.includes('code') ||
                   model.id.includes('gpt-4') || model.id.includes('claude') ||
                   model.id.includes('deepseek');
          case 'multimodal':
            return model.input_modalities?.includes('image') || model.input_modalities?.includes('audio') ||
                   model.architecture?.modality === 'multimodal' || model.architecture?.modality === 'text&image->text';
          case 'large-context':
            return (model.context_length || 0) >= 100000;
          default:
            return true;
          }
        });
      }

      // Apply detailed active filters
      const hasActiveFilters = Object.values(this.activeFilters).some(filters => filters.length > 0);

      if (config.showFilters && hasActiveFilters) {
        filtered = filtered.filter(model => {
          // Check each filter group - model must match at least one filter in each active group
          for (const [, activeValues] of Object.entries(this.activeFilters)) {
            if (activeValues.length === 0) continue;

            const matchesGroup = activeValues.some(filterValue => {
              switch (filterValue) {
              // Provider filters
              case 'openai':
                return model.id.includes('gpt') || model.id.includes('o1-');
              case 'anthropic':
                return model.id.includes('claude');
              case 'google':
                return model.id.includes('gemini') || model.id.includes('palm');
              case 'meta':
                return model.id.includes('llama');
              case 'mistral':
                return model.id.includes('mistral') || model.id.includes('mixtral');
              case 'perplexity':
                return model.id.includes('perplexity');

              // Capabilities
              case 'multimodal':
                return model.input_modalities?.includes('image') || model.input_modalities?.includes('audio');
              case 'vision':
                return model.input_modalities?.includes('image');
              case 'audio':
                return model.input_modalities?.includes('audio');
              case 'function-calling':
              case 'has-tools':
                return model.supported_parameters?.includes('tools');
              case 'json-mode':
              case 'structured-output':
                return model.supported_parameters?.includes('response_format');
              case 'web-search':
                return model.supports_web_search === true || model.id.includes('perplexity');
              case 'native-web-search':
                return model.has_native_web_search === true;

                // Pricing
              case 'free':
                return !model.pricing || (parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0);
              case 'cheap':
                return parseFloat(model.pricing?.prompt || 0) <= 0.000001 && parseFloat(model.pricing?.completion || 0) <= 0.000003;
              case 'premium':
                return parseFloat(model.pricing?.prompt || 0) > 0.000001 || parseFloat(model.pricing?.completion || 0) > 0.000003;

                // Context
              case '4k':
                return model.context_length >= 4000 && model.context_length < 8000;
              case '8k':
                return model.context_length >= 8000 && model.context_length < 16000;
              case '16k':
                return model.context_length >= 16000 && model.context_length < 32000;
              case '32k':
                return model.context_length >= 32000 && model.context_length < 128000;
              case '128k+':
                return model.context_length >= 128000;
              case 'small-context':
                return model.context_length < 10000;
              case 'medium-context':
                return model.context_length >= 10000 && model.context_length < 100000;
              case 'large-context':
                return model.context_length >= 100000;

                // Moderation
              case 'moderated':
                return model.is_moderated === true;
              case 'unmoderated':
                return model.is_moderated !== true;

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

    // Set quick model filter
    setModelFilter(filter) {
      this.modelFilter = filter;
      this.updateFilteredModels();
    },

    // Clear all filters
    clearAllFilters() {
      Object.keys(this.activeFilters).forEach(key => {
        this.activeFilters[key] = [];
      });
      this.modelFilter = 'all';
      this.updateFilteredModels();
    },

    // Check if any filters are active
    hasActiveFilters() {
      return Object.values(this.activeFilters).some(filters => filters.length > 0);
    },

    // Check if filter is active
    isFilterActive(groupKey, filterValue) {
      return this.activeFilters[groupKey]?.includes(filterValue) || false;
    },

    // Get active filter count
    getActiveFilterCount() {
      return Object.values(this.activeFilters).reduce((count, filters) => count + filters.length, 0);
    },

    // Select model
    selectModel(model) {
      this.selectedModel = model;
      if (config.onSelect) {
        const modelId = model.id + (this.enableOnlineSearch ? ':online' : '');
        config.onSelect(model, modelId);
      }
    },

    // Get final model ID with online suffix if needed
    finalModelId() {
      if (!this.selectedModel) return null;
      return this.selectedModel.id + (this.enableOnlineSearch ? ':online' : '');
    },

    // Format price
    formatPrice(pricing) {
      if (!pricing || typeof pricing !== 'object') return 'Free';

      try {
        const prompt = parseFloat(pricing.prompt) || 0;
        const completion = parseFloat(pricing.completion) || 0;

        if (prompt === 0 && completion === 0) {
          return 'Free';
        }

        const promptPrice = (prompt * 1000000).toFixed(2);
        const completionPrice = (completion * 1000000).toFixed(2);
        return `$${promptPrice}/$${completionPrice}`;
      } catch (error) {
        return 'Price unknown';
      }
    },

    // Format context length
    formatContext(length) {
      if (!length) return 'Unknown';
      if (length >= 1000000) {
        return Math.round(length / 1000000) + 'M';
      } else if (length >= 1000) {
        return Math.round(length / 1000) + 'k';
      }
      return length.toString();
    },

    // Get provider name
    getProviderName(model) {
      if (model?.top_provider?.name) {
        return model.top_provider.name;
      }
      if (model?.id) {
        const providerMatch = model.id.match(/^([^/]+)\//);
        if (providerMatch) {
          const provider = providerMatch[1];
          return provider.charAt(0).toUpperCase() + provider.slice(1);
        }
      }
      return 'Unknown';
    },

    // Get web search pricing details
    getWebSearchPricing(model) {
      if (!model?.web_search_pricing) return null;

      if (model.has_native_web_search && model.web_search_pricing.native) {
        return {
          type: 'native',
          price: model.web_search_pricing.native.medium * 1000, // Convert to per 1K
          label: 'Native Search'
        };
      }

      return {
        type: 'plugin',
        price: model.web_search_pricing.plugin * 1000, // Convert to per 1K
        label: 'Web Search'
      };
    },

    // Check if model supports online search
    supportsOnlineSearch(model) {
      return model?.supports_web_search === true;
    },

    // Get model badges/tags
    getModelBadges(model) {
      const badges = [];

      if (!model.pricing || (model.pricing.prompt === 0 && model.pricing.completion === 0)) {
        badges.push({ label: 'Free', class: 'badge-success' });
      }

      if (model.is_moderated) {
        badges.push({ label: 'Moderated', class: 'badge-warning' });
      }

      if (model.input_modalities?.includes('image')) {
        badges.push({ label: 'Vision', class: 'badge-primary' });
      }

      if (model.input_modalities?.includes('audio')) {
        badges.push({ label: 'Audio', class: 'badge-primary' });
      }

      if (model.supported_parameters?.includes('tools')) {
        badges.push({ label: 'Tools', class: 'badge-secondary' });
      }

      if (model.has_native_web_search) {
        badges.push({ label: '🔍 Native Search', class: 'badge-info' });
      } else if (model.supports_web_search) {
        badges.push({ label: '🌐 Web Search', class: 'badge-info' });
      }

      if (model.supported_parameters?.includes('response_format')) {
        badges.push({ label: 'JSON', class: 'badge-secondary' });
      }

      if (model.context_length >= 100000) {
        badges.push({ label: `${this.formatContext(model.context_length)}`, class: 'badge' });
      }

      return badges;
    },

    // Format modalities
    formatModalities(input, output) {
      const parts = [];

      if (input && input.length > 0) {
        parts.push(`In: ${input.join(', ')}`);
      }

      if (output && output.length > 0) {
        parts.push(`Out: ${output.join(', ')}`);
      }

      return parts.join(' • ');
    },

    // Get detailed pricing info
    getDetailedPricing(pricing) {
      if (!pricing) return null;

      const details = [];

      if (pricing.prompt !== undefined && pricing.completion !== undefined) {
        const prompt = parseFloat(pricing.prompt) || 0;
        const completion = parseFloat(pricing.completion) || 0;

        if (prompt === 0 && completion === 0) {
          details.push({ label: 'Free', value: 'Free' });
        } else {
          details.push({
            label: 'Input',
            value: `$${(prompt * 1000000).toFixed(2)}/M`
          });
          details.push({
            label: 'Output',
            value: `$${(completion * 1000000).toFixed(2)}/M`
          });
        }
      }

      if (pricing.image && parseFloat(pricing.image) > 0) {
        details.push({
          label: 'Image',
          value: `$${parseFloat(pricing.image).toFixed(4)}`
        });
      }

      if (pricing.web_search && parseFloat(pricing.web_search) > 0) {
        details.push({
          label: 'Search',
          value: `$${parseFloat(pricing.web_search).toFixed(4)}`
        });
      }

      return details;
    }
  };
}
