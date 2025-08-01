// Configuration Page Component
import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function configPage() {
  return {
    configs: [],
    selectedConfig: null,
    isLoading: false,
    showCreateWizard: false,
    showExampleModal: false,
    examples: [],
    editingConfig: {
      name: '',
      content: {
        meta: {
          name: '',
          version: '',
          description: ''
        },
        generation: {
          tasks: [{ theme: '', count: 10 }]
        }
      }
    },

    async init() {
      await this.loadConfigs();
    },

    async loadConfigs() {
      try {
        this.isLoading = true;
        const response = await api.get('/config-files');
        if (response.success) {
          this.configs = response.files;
        }
      } catch (error) {
        notify.error('Failed to load configurations');
      } finally {
        this.isLoading = false;
      }
    },

    async deleteConfig(config) {
      if (!confirm(`Are you sure you want to delete "${config.name}"?`)) {
        return;
      }

      try {
        const response = await api.delete(`/config-file/${encodeURIComponent(config.name)}`);
        if (response.success) {
          notify.success('Configuration deleted');
          await this.loadConfigs();
        }
      } catch (error) {
        notify.error('Failed to delete configuration');
      }
    },

    navigateToGenerate(config) {
      const configName = config.relativePath || config.name;
      window.location.hash = `#/generate?config=${encodeURIComponent(configName)}`;
    },

    createNewConfig() {
      // Reset form with default values
      this.editingConfig.name = '';
      this.editingConfig.content = {
        meta: {
          name: 'New Configuration',
          version: '1.0',
          description: 'Generated data configuration'
        },
        api: {
          provider: 'openrouter',
          model: 'openrouter/auto',
          temperature: 0.7,
          maxTokens: 2000
        },
        output: {
          format: 'json',
          count: 10
        },
        generation: {
          tasks: [{ theme: 'Default', count: 10 }]
        }
      };
      this.showCreateWizard = true;
    },

    async loadExample() {
      try {
        const response = await api.get('/examples');
        if (response.success) {
          this.examples = Object.entries(response.examples).map(([name, content]) => ({
            name: name.replace('.json', ''),
            content
          }));
          this.showExampleModal = true;
        }
      } catch (error) {
        notify.error('Failed to load examples');
      }
    },

    selectExample(example) {
      this.editingConfig.name = example.name + '_copy';
      this.editingConfig.content = example.content;
      this.showExampleModal = false;
      this.showCreateWizard = true;
    },

    editConfig(config) {
      // Navigate to editor with config file path
      window.location.hash = `#/editor?path=${encodeURIComponent('configs/' + config.name)}`;
    },

    async saveConfig() {
      if (!this.editingConfig.name || !this.editingConfig.content) {
        notify.error('Please provide a configuration name');
        return;
      }

      try {
        const filename = this.editingConfig.name.endsWith('.json')
          ? this.editingConfig.name
          : this.editingConfig.name + '.json';

        const response = await api.post('/config-files', {
          filename,
          content: this.editingConfig.content
        });

        if (response.success) {
          notify.success(this.editingConfig.isEdit ? 'Configuration updated' : 'Configuration created');
          this.showCreateWizard = false;
          // Reset editing config to initial state
          this.editingConfig = {
            name: '',
            content: {
              meta: {
                name: '',
                version: '',
                description: ''
              },
              generation: {
                tasks: [{ theme: '', count: 10 }]
              }
            }
          };
          await this.loadConfigs();
        }
      } catch (error) {
        notify.error('Failed to save configuration');
      }
    }
  };
}
