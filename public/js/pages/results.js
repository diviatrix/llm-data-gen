// Results Page Component
import { createFileExplorer } from '../components/fileExplorer.js';

export function resultsPage() {
  return {
    // Create file explorer as a property
    fileExplorer: null,

    // Initialize
    async init() {
      // Create file explorer instance for user's root directory
      this.fileExplorer = createFileExplorer({
        basePath: '/output-files', // Use the existing API endpoint
        showActions: true,
        allowNavigation: true,
        viewMode: 'cards'
      });

      // Initialize the file explorer
      await this.fileExplorer.init();
    }
  };
}
