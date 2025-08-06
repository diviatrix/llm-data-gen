import { api } from '../api.js';

class AuthStore {
  constructor() {
    this.isAuthenticated = false;
    this.user = null;
    this.token = null;
  }

  init() {
    this.token = localStorage.getItem('token');
    if (this.token) {
      api.token = this.token;
      this.isAuthenticated = true;

      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          this.user = JSON.parse(savedUser);
        } catch (e) {
          console.error('Failed to parse user data');
        }
      }
    }
    return this.isAuthenticated;
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.token = null;
    this.user = null;
    this.isAuthenticated = false;
    api.token = null;
  }
}

export const authStore = new AuthStore();
