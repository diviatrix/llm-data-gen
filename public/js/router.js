class Router {
  constructor() {
    this.routes = {
      '/': 'chat',
      '/generate': 'generate',
      '/queue': 'queue',
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

    this.handleRoute();

    window.addEventListener('hashchange', () => this.handleRoute());

    window.addEventListener('popstate', () => this.handleRoute());
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const route = hash.split('?')[0];
    this.currentRoute = route;

    if (this.onRouteChange) {
      this.onRouteChange(route);
    }

    this.loadPageContent(route);
  }

  navigate(path) {
    window.location.hash = path;
  }

  async loadPageContent(route) {
    const contentDiv = document.getElementById('page-content');
    if (!contentDiv) return;

    // Clean up previous page component
    const existingComponent = contentDiv.querySelector('[x-data]');
    if (existingComponent && existingComponent._x_dataStack) {
      const componentData = existingComponent._x_dataStack[0];
      if (componentData && typeof componentData.destroy === 'function') {
        componentData.destroy();
      }
    }

    contentDiv.innerHTML = '';

    const pageComponents = {
      '/': 'chatPage',
      '/generate': 'generatePage',
      '/queue': 'queuePage',
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

    const wrapper = document.createElement('div');
    wrapper.setAttribute('x-data', `${componentName}()`);
    wrapper.setAttribute('x-init', 'init');
    wrapper.id = `${route.slice(1)}-page`;

    contentDiv.appendChild(wrapper);

    await this.loadTemplate(route, wrapper);

    if (window.Alpine) {
      window.Alpine.initTree(wrapper);
    }
  }

  async loadTemplate(route, wrapper) {
    const templateMap = {
      '/': 'chat.html',
      '/generate': 'generate.html',
      '/queue': 'queue.html',
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
