// API Client
class APIClient {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('token');
    this.isCloud = null; // Will be set by checkMode
  }

  async request(method, path, data) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(this.baseURL + path, options);

      if (response.status === 401) {
        // Only redirect to login in cloud mode
        // Skip redirect for /mode endpoint to avoid infinite loop
        if (this.isCloud !== false && path !== '/mode') {
          localStorage.removeItem('token');
          window.location.href = '/login.html';
          return;
        }
      }

      const result = await response.json();

      if (!response.ok) {
        // Create error with response data
        const error = new Error(result.error || 'Request failed');
        error.response = { data: result };
        throw error;
      }

      return result;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, data) {
    return this.request('POST', path, data);
  }

  put(path, data) {
    return this.request('PUT', path, data);
  }

  delete(path) {
    return this.request('DELETE', path);
  }
}

export const api = new APIClient();
