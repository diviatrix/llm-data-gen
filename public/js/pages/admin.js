import { api } from '../api.js';
import { notify } from '../utils/notifications.js';

export function adminPage() {
  return {
    users: [],
    roles: [],
    stats: {
      total: 0,
      active: 0,
      inactive: 0
    },
    isLoading: false,
    showCreateModal: false,
    showResetModal: false,
    showRoleModal: false,
    selectedUser: null,
    newUser: {
      email: '',
      password: ''
    },
    resetPasswordData: {
      newPassword: ''
    },
    roleChangeData: {
      userId: null,
      roleId: null
    },

    async init() {
      await Promise.all([
        this.loadUsers(),
        this.loadRoles()
      ]);
    },

    async loadRoles() {
      try {
        const response = await api.get('/roles');
        if (response.success) {
          this.roles = response.roles;
        }
      } catch (error) {
        notify.error('Failed to load roles');
      }
    },

    async loadUsers() {
      try {
        this.isLoading = true;
        const response = await api.get('/admin/users');
        if (response.success) {
          this.users = response.users;
          this.calculateStats();
        }
      } catch (error) {
        notify.error('Failed to load users');
      } finally {
        this.isLoading = false;
      }
    },

    calculateStats() {
      this.stats.total = this.users.length;
      this.stats.active = this.users.filter(u => u.is_active).length;
      this.stats.inactive = this.users.filter(u => !u.is_active).length;
    },

    async createUser() {
      try {
        const response = await api.post('/admin/users', {
          email: this.newUser.email,
          password: this.newUser.password
        });

        if (response.success) {
          notify.success('User created successfully');
          this.showCreateModal = false;
          this.newUser = { email: '', password: '' };
          await this.loadUsers();
        }
      } catch (error) {
        notify.error(error.response?.data?.error || 'Failed to create user');
      }
    },

    async toggleUserStatus(user) {
      try {
        const response = await api.put(`/admin/users/${user.id}/toggle`);
        if (response.success) {
          notify.success(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`);
          await this.loadUsers();
        }
      } catch (error) {
        notify.error('Failed to toggle user status');
      }
    },

    resetPassword(user) {
      this.selectedUser = user;
      this.resetPasswordData.newPassword = '';
      this.showResetModal = true;
    },

    async confirmResetPassword() {
      try {
        const response = await api.post(`/admin/users/${this.selectedUser.id}/reset-password`, {
          newPassword: this.resetPasswordData.newPassword
        });

        if (response.success) {
          notify.success('Password reset successfully');
          this.showResetModal = false;
          this.resetPasswordData.newPassword = '';
          this.selectedUser = null;
        }
      } catch (error) {
        notify.error('Failed to reset password');
      }
    },

    async deleteUser(user) {
      if (!confirm(`Are you sure you want to delete user "${user.email}"?`)) {
        return;
      }

      try {
        const response = await api.delete(`/admin/users/${user.id}`);
        if (response.success) {
          notify.success('User deleted successfully');
          await this.loadUsers();
        }
      } catch (error) {
        notify.error('Failed to delete user');
      }
    },

    formatDate(dateString) {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString();
    },

    showChangeRole(user) {
      this.selectedUser = user;
      this.roleChangeData.userId = user.id;
      this.roleChangeData.roleId = user.role_id;
      this.showRoleModal = true;
    },

    async changeUserRole() {
      try {
        const response = await api.put(`/admin/users/${this.roleChangeData.userId}/role`, {
          roleId: parseInt(this.roleChangeData.roleId)
        });

        if (response.success) {
          notify.success('User role updated');
          this.showRoleModal = false;
          await this.loadUsers();
        }
      } catch (error) {
        notify.error('Failed to update user role');
      }
    }
  };
}
