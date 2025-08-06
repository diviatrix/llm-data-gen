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
    enableOnlineSearch: false,
    isLoading: false,
    showDetailedFilters: false,
    initialized: false, // Prevent multiple init calls

    // Active filters (multiple selection)
    activeFilters: {
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
      console.log('ModelSelector init called, initialized:', this.initialized);
      // Prevent multiple init calls
      if (this.initialized) return;
      this.initialized = true;
      
      console.log('Calling loadModels...');
      await this.loadModels.call(this);
      console.log('After loadModels - models:', this.models?.length);

      // Pre-select model if provided
      if (config.selectedModelId) {
        const baseModelId = config.selectedModelId.replace(':online', '');
        this.enableOnlineSearch = config.selectedModelId.endsWith(':online');
        this.selectedModel = this.models.find(m =>
          m.id === config.selectedModelId || m.id === baseModelId
        );
      }
    },

    // Load available models
    async loadModels() {
      try {
        this.isLoading = true;
        const response = await api.get('/models');
        if (response.success) {
          this.models = response.models;
          console.log('Loaded models:', this.models.length);
          this.updateFilterCounts();
          this.updateFilteredModels();
          console.log('Filtered models:', this.filteredModels.length);
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

      // Apply active filters
      const hasActiveFilters = Object.values(this.activeFilters).some(filters => filters.length > 0);

      if (config.showFilters && hasActiveFilters) {
        filtered = filtered.filter(model => {
          // Check each filter group - model must match at least one filter in each active group
          for (const [, activeValues] of Object.entries(this.activeFilters)) {
            if (activeValues.length === 0) continue;

            const matchesGroup = activeValues.some(filterValue => {
              switch (filterValue) {
              // Capabilities
              case 'multimodal':
                return model.input_modalities?.includes('image') || model.input_modalities?.includes('audio');
              case 'vision':
                return model.input_modalities?.includes('image');
              case 'audio':
                return model.input_modalities?.includes('audio');
              case 'has-tools':
                return model.supported_parameters?.includes('tools');
              case 'structured-output':
                return model.supported_parameters?.includes('response_format');
              case 'web-search':
                return model.supports_web_search === true;
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

    // Clear all filters
    clearAllFilters() {
      Object.keys(this.activeFilters).forEach(key => {
        this.activeFilters[key] = [];
      });
      this.updateFilteredModels();
    },

    // Check if filter is active
    isFilterActive(groupKey, filterValue) {
      return this.activeFilters[groupKey].includes(filterValue);
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
