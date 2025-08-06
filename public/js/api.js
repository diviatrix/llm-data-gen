class APIClient {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('token');
  }

  async request(method, path, data) {
    // Always check localStorage for current token
    this.token = localStorage.getItem('token');
    
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

    const response = await fetch(path.startsWith('/api') ? path : this.baseURL + path, options);
    
    // Check if response is JSON or text based on content-type
    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // For non-JSON responses, get text and wrap in success object
      const text = await response.text();
      result = { success: response.ok, content: text };
    }

    if (!response.ok) {
      // Log errors with details for debugging
      console.error(`API Error [${response.status}] ${method} ${path}:`, {
        status: response.status,
        error: result.error || result.content,
        response: result,
        token: this.token ? 'present' : 'missing'
      });
      
      const error = new Error(result.error || result.content || 'Request failed');
      error.status = response.status;
      error.response = result;
      throw error;
    }

    return result;
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