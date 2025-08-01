// Authentication Store
import { api } from '../api.js';

class AuthStore {
  constructor() {
    this.isAuthenticated = false;
    this.user = null;
    this.isAdmin = false;
    this.isCloud = false;
  }

  async checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.isAuthenticated = false;
      return false;
    }

    // If we have a token, assume we're authenticated
    // The server will reject requests if the token is invalid
    this.isAuthenticated = true;
    api.token = token;

    // Try to get user info from localStorage if saved during login
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        this.user = JSON.parse(savedUser);
        this.isAdmin = this.user?.role === 'admin';
      } catch (e) {
        // Invalid user data
      }
    }

    return true;
  }

  async login(email, password) {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.success) {
        localStorage.setItem('token', response.token);
        api.token = response.token;
        this.isAuthenticated = true;
        this.user = response.user;
        this.isAdmin = response.user?.role === 'admin';

        // Save user info to localStorage
        if (response.user) {
          localStorage.setItem('user', JSON.stringify(response.user));
        }

        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    api.token = null;
    this.isAuthenticated = false;
    this.user = null;
    this.isAdmin = false;
  }
}

export const authStore = new AuthStore();
