import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import RepoComments from '../../client/src/index';
import './app.css';

/**
 * Example Application - Design Prototype with Comments
 *
 * This demonstrates how to integrate @repo-comments/client
 * into any web application or prototype.
 */

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Initialize RepoComments
    RepoComments.init({
      apiUrl: 'http://localhost:3000',
      repo: 'acme-corp/design-system',
      branch: 'feature/new-dashboard',
      enableUIComments: true,
      enableCodeComments: false,
      mode: 'full',
      position: 'right',
      theme: 'light',

      // Event handlers
      onThreadCreated: (thread) => {
        console.log('Thread created:', thread);
      },
      onThreadResolved: (thread) => {
        console.log('Thread resolved:', thread);
      },
      onMessageAdded: (message) => {
        console.log('Message added:', message);
      },
    });

    // Check if user has a token (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      RepoComments.setToken(token);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Try to get current user
    RepoComments.getCurrentUser()
      .then((user) => {
        setUser(user);
        setIsAuthenticated(true);
      })
      .catch((error) => {
        console.log('Not authenticated');
        setIsAuthenticated(false);
      });

    return () => {
      // Cleanup on unmount
      RepoComments.destroy();
    };
  }, []);

  const handleLogin = () => {
    // Redirect to OAuth login
    window.location.href = 'http://localhost:3000/api/v1/auth/github';
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>Design Prototype</h1>
          <div className="header-actions">
            {isAuthenticated && user ? (
              <div className="user-info">
                <img
                  src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.name}`}
                  alt={user.name}
                  className="user-avatar"
                />
                <span>{user.name}</span>
              </div>
            ) : (
              <button className="login-button" onClick={handleLogin}>
                Login with GitHub
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Example Prototype */}
      <main className="main-content">
        <section className="hero-section">
          <h2>Welcome to Our New Dashboard</h2>
          <p>This is a design prototype with integrated commenting</p>
          <button className="primary-cta">Get Started</button>
        </section>

        <section className="features-section">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Analytics</h3>
            <p>Track your metrics in real-time with beautiful dashboards</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>Performance</h3>
            <p>Optimized for speed and efficiency</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Security</h3>
            <p>Enterprise-grade security and compliance</p>
          </div>
        </section>

        <section className="demo-section">
          <h2>Interactive Components</h2>
          <div className="component-showcase">
            <nav className="main-header">
              <div>Home</div>
              <div>Products</div>
              <div>Pricing</div>
              <div>About</div>
            </nav>

            <div className="form-example">
              <h3>Contact Form</h3>
              <input type="email" placeholder="Your email" className="form-input" />
              <textarea placeholder="Your message" className="form-textarea" rows={4} />
              <button className="submit-button">Send Message</button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>&copy; 2024 Acme Corp. This is a design prototype with RepoComments.</p>
        <p className="footer-hint">
          {isAuthenticated
            ? '💡 Click anywhere on the page to add a comment (Figma-style)'
            : '💡 Login to start adding comments'}
        </p>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
