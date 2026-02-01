// Users Management

class UsersManager {
  static async loadUsers() {
    const usersTableBody = document.getElementById('users-table-body');

    try {
      const users = await api.getUsers();

      if (users.length === 0) {
        usersTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 3rem; color: #a0aec0;">
              No users yet. Users will appear here after they login.
            </td>
          </tr>
        `;
        return;
      }

      usersTableBody.innerHTML = users.map(user => this.renderUserRow(user)).join('');

      // Attach event listeners
      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading users:', error);
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 3rem; color: #f56565;">
            Error loading users. Please try again.
          </td>
        </tr>
      `;
    }
  }

  static renderUserRow(user) {
    const joinedDate = new Date(user.created_at).toLocaleDateString();
    const teams = user.teams || [];

    return `
      <tr data-user-id="${user.id}">
        <td>
          <strong>${user.name || 'Unknown'}</strong>
        </td>
        <td>${user.email}</td>
        <td>
          <span class="user-badge badge-${user.provider}">
            ${user.provider}
          </span>
        </td>
        <td>${joinedDate}</td>
        <td>
          ${teams.length > 0
            ? teams.map(t => `<span class="user-badge badge-member">${t}</span>`).join(' ')
            : '<span style="color: #a0aec0;">No teams</span>'
          }
        </td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-small btn-secondary btn-manage-user">Manage</button>
          </div>
        </td>
      </tr>
    `;
  }

  static attachEventListeners() {
    document.querySelectorAll('.btn-manage-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const userId = row.dataset.userId;
        this.manageUser(userId);
      });
    });

    // Invite user button
    document.getElementById('btn-invite-user').addEventListener('click', () => {
      this.inviteUser();
    });
  }

  static async manageUser(userId) {
    // Simple implementation - show user details and allow team assignment
    try {
      const user = await api.getUser(userId);
      const teams = await api.getTeams();

      const teamOptions = teams.map(t =>
        `<option value="${t.id}">${t.name}</option>`
      ).join('');

      const teamId = prompt(`Assign ${user.name} to a team:\n\nAvailable teams:\n${teams.map((t, i) => `${i + 1}. ${t.name}`).join('\n')}\n\nEnter team number:`);

      if (teamId) {
        const selectedTeam = teams[parseInt(teamId) - 1];
        if (selectedTeam) {
          await api.addTeamMember(selectedTeam.id, userId);
          this.loadUsers();
          app.showNotification(`Added ${user.name} to ${selectedTeam.name}`);
        }
      }
    } catch (error) {
      app.showNotification('Failed to manage user: ' + error.message, 'error');
    }
  }

  static inviteUser() {
    alert('User invitation coming soon!\n\nFor now, users can sign up by logging in with GitHub through the Chrome extension.');
  }
}

window.UsersManager = UsersManager;
