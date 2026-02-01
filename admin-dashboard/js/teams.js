// Teams Management

class TeamsManager {
  static async loadTeams() {
    const teamsList = document.getElementById('teams-list');

    try {
      const teams = await api.getTeams();

      if (teams.length === 0) {
        teamsList.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #a0aec0;">
            <p>No teams yet. Create your first team to get started.</p>
          </div>
        `;
        return;
      }

      teamsList.innerHTML = teams.map(team => this.renderTeamCard(team)).join('');

      // Attach event listeners
      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading teams:', error);
      teamsList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #f56565;">
          <p>Error loading teams. Please try again.</p>
        </div>
      `;
    }
  }

  static renderTeamCard(team) {
    const memberCount = team.member_count || 0;

    return `
      <div class="team-card" data-team-id="${team.id}">
        <h3>${team.name}</h3>
        <p>${team.description || 'No description'}</p>
        <div class="team-meta">
          <span class="team-members">${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
          <div class="team-actions">
            <button class="btn-small btn-secondary btn-edit-team">Edit</button>
            <button class="btn-small btn-secondary btn-manage-members">Members</button>
            <button class="btn-small btn-secondary btn-delete-team">Delete</button>
          </div>
        </div>
      </div>
    `;
  }

  static attachEventListeners() {
    // Edit team
    document.querySelectorAll('.btn-edit-team').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const teamCard = e.target.closest('.team-card');
        const teamId = teamCard.dataset.teamId;
        this.editTeam(teamId);
      });
    });

    // Manage members
    document.querySelectorAll('.btn-manage-members').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const teamCard = e.target.closest('.team-card');
        const teamId = teamCard.dataset.teamId;
        this.manageMembers(teamId);
      });
    });

    // Delete team
    document.querySelectorAll('.btn-delete-team').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const teamCard = e.target.closest('.team-card');
        const teamId = teamCard.dataset.teamId;
        this.deleteTeam(teamId);
      });
    });
  }

  static async editTeam(teamId) {
    const name = prompt('Enter new team name:');
    if (!name) return;

    try {
      await api.updateTeam(teamId, { name });
      this.loadTeams();
      app.showNotification('Team updated successfully');
    } catch (error) {
      app.showNotification('Failed to update team: ' + error.message, 'error');
    }
  }

  static async manageMembers(teamId) {
    // Simple implementation - could be enhanced with a modal
    alert('Member management coming soon! You can add members via the Users page.');
  }

  static async deleteTeam(teamId) {
    if (!confirm('Are you sure you want to delete this team?')) return;

    try {
      await api.deleteTeam(teamId);
      this.loadTeams();
      app.showNotification('Team deleted successfully');
    } catch (error) {
      app.showNotification('Failed to delete team: ' + error.message, 'error');
    }
  }
}

window.TeamsManager = TeamsManager;
