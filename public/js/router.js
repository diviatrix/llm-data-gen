// Simple Router
class Router {
  constructor() {
    this.routes = {
      '/': 'dashboard',
      '/generate': 'generate',
      '/config': 'config',
      '/results': 'results',
      '/files': 'files',
      '/viewer': 'viewer',
      '/editor': 'editor',
      '/chat': 'chat',
      '/settings': 'settings',
      '/admin': 'admin'
    };
    this.currentRoute = '/';
    this.onRouteChange = null;
  }

  init(onRouteChange) {
    this.onRouteChange = onRouteChange;

    // Handle initial route
    this.handleRoute();

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen for popstate
    window.addEventListener('popstate', () => this.handleRoute());
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    // Extract route without query string
    const route = hash.split('?')[0];
    this.currentRoute = route;

    if (this.onRouteChange) {
      this.onRouteChange(route);
    }

    // Load the appropriate page component
    this.loadPageContent(route);
  }

  navigate(path) {
    window.location.hash = path;
  }

  async loadPageContent(route) {
    const contentDiv = document.getElementById('page-content');
    if (!contentDiv) return;

    // Clear content
    contentDiv.innerHTML = '';

    // Map routes to Alpine.js components
    const pageComponents = {
      '/': 'dashboardPage',
      '/generate': 'generatePage',
      '/config': 'configPage',
      '/results': 'resultsPage',
      '/files': 'fileManagerPage',
      '/viewer': 'viewerPage',
      '/editor': 'editorPage',
      '/chat': 'chatPage',
      '/settings': 'settingsPage',
      '/admin': 'adminPage'
    };

    const componentName = pageComponents[route];

    if (!componentName || (route !== '/' && route !== '/settings' && !window[componentName])) {
      contentDiv.innerHTML = '<div class="text-center py-6"><h2 class="text-2xl font-bold text-gray-500">Page not found</h2></div>';
      return;
    }

    // Create Alpine component wrapper
    const wrapper = document.createElement('div');
    wrapper.setAttribute('x-data', `${componentName}()`);
    wrapper.setAttribute('x-init', 'init');
    wrapper.id = `${route.slice(1)}-page`;

    contentDiv.appendChild(wrapper);

    // Load template content
    if (route !== '/') {
      await this.loadTemplate(route, wrapper);
    } else {
      // Inline content for dashboard
      wrapper.innerHTML = '<div class="text-center py-6"><h2 class="text-3xl font-bold mb-4">Welcome to LLM Data Generator</h2><p class="text-gray-600 mb-6">Generate AI-powered data using various language models</p><div class="grid-3 max-w-4xl mx-auto"><a href="#/generate" class="card-interactive"><div class="text-3xl mb-3">🚀</div><h3 class="text-lg font-semibold mb-2">Generate Data</h3><p class="text-sm text-gray-600">Create data using your configurations</p></a><a href="#/files" class="card-interactive"><div class="text-3xl mb-3">📁</div><h3 class="text-lg font-semibold mb-2">File Manager</h3><p class="text-sm text-gray-600">Manage configurations and results</p></a><a href="#/chat" class="card-interactive"><div class="text-3xl mb-3">💬</div><h3 class="text-lg font-semibold mb-2">Chat</h3><p class="text-sm text-gray-600">Interact with AI models</p></a></div></div>';
    }

    // Re-evaluate Alpine components
    if (window.Alpine) {
      window.Alpine.initTree(contentDiv);
    }
  }

  async loadTemplate(route, wrapper) {
    const templateMap = {
      '/generate': 'generate.html',
      '/config': 'config.html',
      '/results': 'results.html',
      '/files': 'files.html',
      '/viewer': 'viewer.html',
      '/editor': 'editor.html',
      '/chat': 'chat.html',
      '/settings': 'settings.html',
      '/admin': 'admin.html'
    };

    const templateFile = templateMap[route];
    if (!templateFile) return;

    try {
      const response = await fetch(`/pages/${templateFile}`);
      if (response.ok) {
        const html = await response.text();
        wrapper.innerHTML = html;
      } else {
        console.error(`Template not found: ${templateFile}`);
        wrapper.innerHTML = '<div class="text-center p-6"><p class="text-gray-600">Loading...</p></div>';
      }
    } catch (error) {
      console.error('Error loading template:', error);
      wrapper.innerHTML = '<div class="text-center p-6"><p class="text-error">Error loading page</p></div>';
    }
  }
}

export const router = new Router();
