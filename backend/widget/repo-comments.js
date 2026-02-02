/**
 * RepoComments Embeddable Widget
 *
 * Usage:
 * <script src="https://your-api.com/widget/repo-comments.js"
 *         data-api="https://your-api.com"
 *         data-repo="owner/repo"
 *         data-branch="main"></script>
 */

(function() {
    'use strict';

    // Environment detection for auto-configuration
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Auto-detect API URL based on environment
    function detectApiUrl() {
        // Check for explicit configuration first
        const explicitUrl = currentScript?.getAttribute('data-api') || window.REPO_COMMENTS_API_URL;
        if (explicitUrl) return explicitUrl;

        // Auto-detect based on environment
        if (isLocalhost) {
            return 'http://localhost:3000';
        }

        // Production default
        return 'https://repo-comments-system-production.up.railway.app';
    }

    // Auto-detect repo from URL patterns
    function detectRepo() {
        const explicitRepo = currentScript?.getAttribute('data-repo') || window.REPO_COMMENTS_REPO;
        if (explicitRepo) return explicitRepo;

        // Try to detect from GitHub Pages URL
        if (hostname.endsWith('.github.io')) {
            const username = hostname.replace('.github.io', '');
            const pathParts = window.location.pathname.split('/').filter(p => p);
            const repoName = pathParts[0] || 'website';
            return `${username}/${repoName}`;
        }

        // Vercel pattern: project-name-git-branch-team.vercel.app
        const vercelMatch = hostname.match(/^([^-]+)-.*\.vercel\.app$/);
        if (vercelMatch) {
            return `vercel/${vercelMatch[1]}`;
        }

        // Netlify pattern: site-name.netlify.app
        const netlifyMatch = hostname.match(/^([^.]+)\.netlify\.app$/);
        if (netlifyMatch) {
            return `netlify/${netlifyMatch[1]}`;
        }

        return null;
    }

    // Get configuration from script tag with auto-detection fallbacks
    const currentScript = document.currentScript;
    const config = {
        apiUrl: detectApiUrl(),
        repo: detectRepo(),
        branch: currentScript?.getAttribute('data-branch') || window.REPO_COMMENTS_BRANCH || 'main',
    };

    // Validate configuration
    if (!config.apiUrl) {
        console.error('[RepoComments] Missing API URL. Set data-api attribute or window.REPO_COMMENTS_API_URL');
        return;
    }

    if (!config.repo) {
        console.warn('[RepoComments] Could not auto-detect repository. Set data-repo attribute or window.REPO_COMMENTS_REPO');
        // Don't return - try to look it up via URL pattern in the API
    }

    // Load Socket.IO if not already loaded
    function loadSocketIO(callback) {
        if (typeof io !== 'undefined') {
            callback();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        script.onload = callback;
        script.onerror = () => console.warn('[RepoComments] Failed to load Socket.IO, real-time updates disabled');
        document.head.appendChild(script);
    }

    // Load html2canvas for screenshot capture (lazy loaded on first use)
    let html2canvasLoaded = false;
    let html2canvasLoading = false;
    const html2canvasCallbacks = [];

    function loadHtml2Canvas(callback) {
        if (html2canvasLoaded && typeof html2canvas !== 'undefined') {
            callback();
            return;
        }

        html2canvasCallbacks.push(callback);

        if (html2canvasLoading) return;
        html2canvasLoading = true;

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = () => {
            html2canvasLoaded = true;
            html2canvasCallbacks.forEach(cb => cb());
            html2canvasCallbacks.length = 0;
        };
        script.onerror = () => {
            console.warn('[RepoComments] Failed to load html2canvas, screenshots disabled');
            html2canvasCallbacks.forEach(cb => cb());
            html2canvasCallbacks.length = 0;
        };
        document.head.appendChild(script);
    }

    // Capture element screenshot using html2canvas
    async function captureElementScreenshot(element) {
        if (typeof html2canvas === 'undefined') {
            return null;
        }

        try {
            const canvas = await html2canvas(element, {
                backgroundColor: null,
                scale: window.devicePixelRatio || 1,
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: Math.min(element.offsetWidth, 400),
                height: Math.min(element.offsetHeight, 300)
            });

            // Scale down if too large
            const maxWidth = 400;
            const maxHeight = 300;
            if (canvas.width > maxWidth || canvas.height > maxHeight) {
                const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
                const scaledCanvas = document.createElement('canvas');
                scaledCanvas.width = canvas.width * scale;
                scaledCanvas.height = canvas.height * scale;
                const ctx = scaledCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
                return scaledCanvas.toDataURL('image/png', 0.8);
            }

            return canvas.toDataURL('image/png', 0.8);
        } catch (err) {
            console.warn('[RepoComments] Screenshot capture failed:', err);
            return null;
        }
    }

    // Get meaningful text from element
    function getElementText(element) {
        if (!element) return null;
        const text = element.innerText?.trim() || element.value || element.placeholder || element.alt || '';
        if (text.length > 0) return text.substring(0, 100);
        return element.getAttribute('aria-label') || element.getAttribute('title') || null;
    }

    // Main RepoComments class
    class RepoComments {
        constructor(config) {
            this.apiUrl = config.apiUrl;
            this.repo = config.repo;
            this.branch = config.branch;
            this.token = localStorage.getItem('repo-comments-token');
            this.threads = [];
            this.isAddingComment = false;
            this.isPanelOpen = false;
            this.selectedThread = null;
            this.renderTimeout = null;
            this.draggedMarker = null;
            this.dragOffset = { x: 0, y: 0 };
            this.socket = null;
            this.collapsedThreads = new Set();

            this.init();
        }

        async init() {
            // Check for token in URL (OAuth callback)
            this.handleOAuthCallback();

            if (!this.token) {
                console.log('[RepoComments] No token found. User needs to authenticate.');
                this.injectStyles();
                this.injectLoginUI();
                return;
            }

            // Inject UI
            this.injectStyles();
            this.injectUI();

            // Load threads
            await this.loadThreads();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize WebSocket
            this.initWebSocket();

            console.log('[RepoComments] Initialized for', this.repo);
        }

        handleOAuthCallback() {
            const params = new URLSearchParams(window.location.search);
            const tokenFromUrl = params.get('token');
            if (tokenFromUrl) {
                localStorage.setItem('repo-comments-token', tokenFromUrl);
                this.token = tokenFromUrl;
                // Clean URL
                params.delete('token');
                const newUrl = params.toString()
                    ? `${window.location.pathname}?${params.toString()}`
                    : window.location.pathname;
                window.history.replaceState({}, '', newUrl);
            }
        }

        initWebSocket() {
            if (typeof io === 'undefined') {
                console.warn('[RepoComments] Socket.IO not loaded');
                return;
            }

            try {
                this.socket = io(this.apiUrl, {
                    auth: { token: this.token },
                    transports: ['websocket', 'polling']
                });

                this.socket.on('connect', () => {
                    this.socket.emit('subscribe', { repo: this.repo, branch: this.branch });
                });

                this.socket.on('message:added', (data) => this.handleMessageAdded(data));
                this.socket.on('message:edited', (data) => this.handleMessageEdited(data));
                this.socket.on('message:deleted', (data) => this.handleMessageDeleted(data));
                this.socket.on('reaction:added', (data) => this.handleReactionAdded(data));
                this.socket.on('reaction:removed', (data) => this.handleReactionRemoved(data));
                this.socket.on('thread:created', () => this.loadThreads());
                this.socket.on('thread:updated', () => this.loadThreads());
            } catch (error) {
                console.error('[RepoComments] WebSocket error:', error);
            }
        }

        handleMessageAdded(data) {
            const { threadId, message } = data;
            if (this.selectedThread && this.selectedThread.id === threadId) {
                if (!this.selectedThread.messages.find(m => m.id === message.id)) {
                    this.selectedThread.messages.push(message);
                    this.renderThreadModal(this.selectedThread);
                    this.showToast(`${message.author_name} added a comment`);
                }
            }
            this.loadThreads();
        }

        handleMessageEdited(data) {
            const { threadId, messageId, content } = data;
            if (this.selectedThread && this.selectedThread.id === threadId) {
                const msg = this.selectedThread.messages.find(m => m.id === messageId);
                if (msg) {
                    msg.content = content;
                    msg.edited = true;
                    this.renderThreadModal(this.selectedThread);
                }
            }
        }

        handleMessageDeleted(data) {
            const { threadId, messageId } = data;
            if (this.selectedThread && this.selectedThread.id === threadId) {
                this.selectedThread.messages = this.selectedThread.messages.filter(m => m.id !== messageId);
                this.renderThreadModal(this.selectedThread);
            }
            this.loadThreads();
        }

        handleReactionAdded(data) {
            const { messageId, reaction } = data;
            if (this.selectedThread) {
                const msg = this.selectedThread.messages.find(m => m.id === messageId);
                if (msg) {
                    if (!msg.reactions) msg.reactions = [];
                    if (!msg.reactions.find(r => r.user_id === reaction.user_id && r.emoji === reaction.emoji)) {
                        msg.reactions.push(reaction);
                        this.renderThreadModal(this.selectedThread);
                    }
                }
            }
        }

        handleReactionRemoved(data) {
            const { messageId, emoji, userId } = data;
            if (this.selectedThread) {
                const msg = this.selectedThread.messages.find(m => m.id === messageId);
                if (msg && msg.reactions) {
                    msg.reactions = msg.reactions.filter(r => !(r.user_id === userId && r.emoji === emoji));
                    this.renderThreadModal(this.selectedThread);
                }
            }
        }

        showToast(message, duration = 3000) {
            const existingToast = document.getElementById('rc-toast');
            if (existingToast) existingToast.remove();

            const toast = document.createElement('div');
            toast.id = 'rc-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 100px;
                right: 24px;
                background: #1a1a1a;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.2);
                z-index: 1000005;
                animation: rc-toast-in 0.3s ease;
            `;
            toast.textContent = message;

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        injectStyles() {
            const style = document.createElement('style');
            style.id = 'repo-comments-styles';
            style.textContent = `
                .rc-root { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                .rc-fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: #7B61FF; color: white; border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.15); pointer-events: auto; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 1000001; }
                .rc-fab:hover { background: #6852E8; transform: scale(1.05); }
                .rc-fab svg { width: 24px; height: 24px; }
                .rc-fab-badge { position: absolute; top: -4px; right: -4px; background: #FF4757; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: 600; }
                .rc-marker { position: absolute; width: 32px; height: 32px; border-radius: 50%; background: #7B61FF; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; cursor: grab; pointer-events: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.12); transition: box-shadow 0.15s; z-index: 1000000; user-select: none; }
                .rc-marker:hover { box-shadow: 0 4px 16px rgba(123, 97, 255, 0.4); }
                .rc-marker.resolved { background: #00C853; opacity: 0.6; }
                .rc-marker.dragging { cursor: grabbing; box-shadow: 0 8px 24px rgba(123, 97, 255, 0.6); transform: scale(1.15); z-index: 1000001; }
                .rc-panel { position: fixed; top: 0; right: 0; width: 360px; height: 100vh; background: white; border-left: 1px solid #E5E5E5; box-shadow: -8px 0 24px rgba(0,0,0,0.15); pointer-events: auto; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1000002; }
                .rc-panel.open { transform: translateX(0); }
                .rc-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #E5E5E5; }
                .rc-panel-title { font-size: 14px; font-weight: 600; margin: 0; }
                .rc-panel-close { background: none; border: none; padding: 4px; cursor: pointer; border-radius: 4px; font-size: 18px; }
                .rc-panel-close:hover { background: #F5F5F5; }
                .rc-panel-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
                .rc-thread { background: white; border: 1px solid #E5E5E5; border-radius: 8px; padding: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.15s; }
                .rc-thread:hover { border-color: #7B61FF; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
                .rc-thread-content { color: #000; font-size: 13px; margin-bottom: 8px; }
                .rc-thread-meta { font-size: 12px; color: #6F6F6F; }
                .rc-button { background: #7B61FF; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 16px; width: 100%; }
                .rc-button:hover { background: #6852E8; }
                .rc-empty { text-align: center; padding: 48px 24px; color: #6F6F6F; }
                .rc-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); pointer-events: auto; display: none; align-items: center; justify-content: center; z-index: 1000003; }
                .rc-modal-overlay.open { display: flex; }
                .rc-modal { background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); width: 90%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; }
                .rc-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #E5E5E5; }
                .rc-modal-title { font-size: 16px; font-weight: 600; margin: 0; }
                .rc-modal-close { background: none; border: none; padding: 4px; cursor: pointer; border-radius: 4px; font-size: 20px; }
                .rc-modal-close:hover { background: #F5F5F5; }
                .rc-modal-body { flex: 1; overflow-y: auto; padding: 24px; }
                .rc-modal-footer { padding: 16px 24px; border-top: 1px solid #E5E5E5; display: flex; gap: 8px; }
                .rc-messages-container { display: flex; flex-direction: column; gap: 2px; }
                .rc-message { display: flex; gap: 12px; padding: 8px 12px; position: relative; border-radius: 6px; transition: background 0.15s; }
                .rc-message:hover { background: rgba(123, 97, 255, 0.04); }
                .rc-message-avatar-col { flex-shrink: 0; width: 36px; }
                .rc-message-avatar { width: 36px; height: 36px; border-radius: 6px; background: #7B61FF; background-size: cover; background-position: center; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
                .rc-message-gutter { width: 36px; flex-shrink: 0; }
                .rc-message-body { flex: 1; min-width: 0; }
                .rc-message-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
                .rc-message-author { font-weight: 700; font-size: 14px; color: #1a1a1a; }
                .rc-message-time { font-size: 11px; color: #6F6F6F; }
                .rc-message-edited { font-size: 11px; color: #6F6F6F; font-style: italic; }
                .rc-message-content { font-size: 14px; line-height: 1.5; color: #1a1a1a; word-wrap: break-word; white-space: pre-wrap; }
                .rc-message.rc-consecutive { padding-top: 2px; padding-bottom: 2px; }
                .rc-message-actions { position: absolute; top: -12px; right: 12px; background: white; border: 1px solid #E5E5E5; border-radius: 6px; padding: 2px; display: none; gap: 2px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10; }
                .rc-message:hover .rc-message-actions { display: flex; }
                .rc-action-btn { width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #6F6F6F; font-size: 14px; }
                .rc-action-btn:hover { background: #F5F5F5; color: #7B61FF; }
                .rc-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
                .rc-reaction { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid #E5E5E5; border-radius: 12px; background: white; cursor: pointer; font-size: 13px; }
                .rc-reaction:hover { border-color: #7B61FF; background: rgba(123, 97, 255, 0.08); }
                .rc-reaction.rc-reaction-active { border-color: #7B61FF; background: rgba(123, 97, 255, 0.08); }
                .rc-reaction-count { font-size: 12px; color: #6F6F6F; font-weight: 500; }
                .rc-add-reaction { opacity: 0; }
                .rc-message:hover .rc-add-reaction, .rc-reactions:hover .rc-add-reaction { opacity: 1; }
                .rc-emoji-picker { position: absolute; background: white; border: 1px solid #E5E5E5; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 8px; z-index: 1000004; }
                .rc-emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
                .rc-emoji-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 18px; }
                .rc-emoji-btn:hover { background: #F5F5F5; }
                .rc-reply-form { display: flex; flex-direction: column; gap: 8px; }
                .rc-reply-input { border: 1px solid #E5E5E5; border-radius: 6px; padding: 10px 12px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 80px; }
                .rc-reply-input:focus { outline: none; border-color: #7B61FF; }
                .rc-button-group { display: flex; gap: 8px; }
                .rc-button-primary { background: #7B61FF; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; }
                .rc-button-primary:hover { background: #6852E8; }
                .rc-button-secondary { background: white; color: #6F6F6F; border: 1px solid #E5E5E5; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; }
                .rc-button-secondary:hover { background: #F5F5F5; }
                .rc-button-resolve { background: #00C853; }
                .rc-button-resolve:hover { background: #00A843; }
                .rc-thread-replies { margin-left: 48px; border-left: 2px solid #E5E5E5; padding-left: 12px; }
                .rc-thread-replies.rc-collapsed { display: none; }
                .rc-replies-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 12px; margin-left: 48px; background: none; border: none; color: #7B61FF; font-size: 13px; font-weight: 500; cursor: pointer; border-radius: 4px; }
                .rc-replies-toggle:hover { background: rgba(123, 97, 255, 0.08); }
                .rc-inline-reply { margin-left: 48px; margin-top: 8px; padding: 12px; background: #F8F9FA; border-radius: 8px; display: none; }
                .rc-inline-reply.rc-active { display: block; }
                .rc-inline-reply-input { width: 100%; border: 1px solid #E5E5E5; border-radius: 6px; padding: 8px 12px; font-size: 13px; font-family: inherit; resize: none; min-height: 60px; box-sizing: border-box; }
                .rc-inline-reply-input:focus { outline: none; border-color: #7B61FF; }
                .rc-inline-reply-actions { display: flex; gap: 8px; margin-top: 8px; }
                body.rc-adding-comment { cursor: crosshair !important; }
                body.rc-adding-comment * { cursor: crosshair !important; }
                .rc-login-prompt { text-align: center; padding: 24px; }
                .rc-login-btn { background: #24292e; color: white; border: none; border-radius: 6px; padding: 12px 24px; font-size: 14px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
                .rc-login-btn:hover { background: #1a1e22; }
                @keyframes rc-toast-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        injectLoginUI() {
            const root = document.createElement('div');
            root.className = 'rc-root';
            root.innerHTML = `
                <button class="rc-fab" id="rc-fab">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </button>
                <div class="rc-panel" id="rc-panel">
                    <div class="rc-panel-header">
                        <h3 class="rc-panel-title">Comments</h3>
                        <button class="rc-panel-close" id="rc-panel-close">&times;</button>
                    </div>
                    <div class="rc-panel-body">
                        <div class="rc-login-prompt">
                            <p style="margin-bottom: 16px; color: #6F6F6F;">Sign in with GitHub to leave comments</p>
                            <button class="rc-login-btn" id="rc-login-btn">
                                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                                </svg>
                                Sign in with GitHub
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(root);

            document.getElementById('rc-fab').addEventListener('click', () => {
                document.getElementById('rc-panel').classList.toggle('open');
            });
            document.getElementById('rc-panel-close').addEventListener('click', () => {
                document.getElementById('rc-panel').classList.remove('open');
            });

            // Login redirect
            document.getElementById('rc-login-btn').addEventListener('click', () => {
                const redirectUri = window.location.href;
                const state = btoa(JSON.stringify({ redirect_uri: redirectUri }));
                window.location.href = `${this.apiUrl}/api/v1/auth/github?state=${encodeURIComponent(state)}`;
            });
        }

        injectUI() {
            const root = document.createElement('div');
            root.className = 'rc-root';
            root.innerHTML = `
                <button class="rc-fab" id="rc-fab">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span class="rc-fab-badge" id="rc-badge">0</span>
                </button>
                <div class="rc-panel" id="rc-panel">
                    <div class="rc-panel-header">
                        <h3 class="rc-panel-title">Comments</h3>
                        <button class="rc-panel-close" id="rc-panel-close">&times;</button>
                    </div>
                    <div class="rc-panel-body" id="rc-panel-body">
                        <button class="rc-button" id="rc-add-comment-btn">+ Add Comment</button>
                        <div class="rc-thread-list" id="rc-thread-list"></div>
                    </div>
                </div>
                <div class="rc-modal-overlay" id="rc-modal-overlay">
                    <div class="rc-modal">
                        <div class="rc-modal-header">
                            <h3 class="rc-modal-title">Comment Thread</h3>
                            <button class="rc-modal-close" id="rc-modal-close">&times;</button>
                        </div>
                        <div class="rc-modal-body" id="rc-modal-body"></div>
                        <div class="rc-modal-footer">
                            <button class="rc-button-resolve" id="rc-resolve-btn">Resolve</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(root);
        }

        setupEventListeners() {
            document.getElementById('rc-fab').addEventListener('click', () => this.togglePanel());
            document.getElementById('rc-panel-close').addEventListener('click', () => this.togglePanel());
            document.getElementById('rc-add-comment-btn').addEventListener('click', () => this.startAddingComment());
            document.getElementById('rc-modal-close').addEventListener('click', () => this.closeModal());
            document.getElementById('rc-modal-overlay').addEventListener('click', (e) => {
                if (e.target.id === 'rc-modal-overlay') this.closeModal();
            });

            document.addEventListener('click', (e) => this.handleDocumentClick(e));
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (this.isAddingComment) this.cancelAddingComment();
                    this.closeModal();
                }
            });

            const observer = new MutationObserver(() => {
                clearTimeout(this.renderTimeout);
                this.renderTimeout = setTimeout(() => this.renderMarkers(), 100);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
            window.addEventListener('scroll', () => this.renderMarkers());
        }

        togglePanel() {
            this.isPanelOpen = !this.isPanelOpen;
            document.getElementById('rc-panel').classList.toggle('open', this.isPanelOpen);
        }

        async loadThreads() {
            try {
                const response = await fetch(`${this.apiUrl}/api/v1/threads?repo=${this.repo}&branch=${this.branch}&status=open`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (!response.ok) throw new Error('Failed to load threads');
                this.threads = await response.json();
                this.renderThreads();
                this.renderMarkers();
                document.getElementById('rc-badge').textContent = this.threads.length;
            } catch (error) {
                console.error('[RepoComments] Error loading threads:', error);
            }
        }

        renderThreads() {
            const list = document.getElementById('rc-thread-list');
            if (this.threads.length === 0) {
                list.innerHTML = '<div class="rc-empty">No comments yet</div>';
                return;
            }
            list.innerHTML = this.threads.map((thread, i) => `
                <div class="rc-thread" data-thread-id="${thread.id}">
                    <div class="rc-thread-content">${this.escapeHtml(thread.first_message_content) || 'No content'}</div>
                    <div class="rc-thread-meta">Comment #${i + 1} - ${thread.message_count || 1} message${thread.message_count !== 1 ? 's' : ''}</div>
                </div>
            `).join('');
            document.querySelectorAll('.rc-thread').forEach((el, i) => {
                el.addEventListener('click', () => this.showThreadDetails(this.threads[i]));
            });
        }

        renderMarkers() {
            document.querySelectorAll('.rc-marker').forEach(m => m.remove());
            this.threads.forEach((thread, i) => {
                let x, y, shouldRender = false;
                if (thread.selector) {
                    try {
                        const element = document.querySelector(thread.selector);
                        if (element && this.isElementVisible(element)) {
                            const pos = this.getElementPosition(element);
                            x = pos.x; y = pos.y;
                            shouldRender = true;
                        }
                    } catch (e) { }
                }
                if (!shouldRender && thread.coordinates) {
                    x = thread.coordinates.x; y = thread.coordinates.y;
                    shouldRender = true;
                }
                if (shouldRender) {
                    const marker = document.createElement('div');
                    marker.className = 'rc-marker' + (thread.status === 'resolved' ? ' resolved' : '');
                    marker.textContent = i + 1;
                    marker.style.left = `${x}px`;
                    marker.style.top = `${y}px`;
                    marker.style.transform = 'translate(-50%, -50%)';
                    marker.dataset.threadId = thread.id;
                    marker.addEventListener('mousedown', (e) => this.handleMarkerMouseDown(e, thread));
                    document.querySelector('.rc-root').appendChild(marker);
                }
            });
        }

        async showThreadDetails(thread) {
            try {
                const response = await fetch(`${this.apiUrl}/api/v1/threads/${thread.id}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (!response.ok) throw new Error('Failed to load thread');
                const fullThread = await response.json();
                this.selectedThread = fullThread;
                this.renderThreadModal(fullThread);
                this.openModal();
            } catch (error) {
                console.error('[RepoComments] Error:', error);
            }
        }

        renderThreadModal(thread) {
            const modalBody = document.getElementById('rc-modal-body');
            const messages = thread.messages || [];
            modalBody.innerHTML = `
                <div class="rc-messages-container">${this.renderMessages(messages)}</div>
                <div class="rc-reply-form" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #E5E5E5;">
                    <textarea class="rc-reply-input" id="rc-reply-input" placeholder="Reply to this thread..."></textarea>
                    <div class="rc-button-group">
                        <button class="rc-button-primary" id="rc-send-reply">Send</button>
                        <button class="rc-button-secondary" id="rc-cancel-reply">Cancel</button>
                    </div>
                </div>
            `;
            document.getElementById('rc-send-reply').addEventListener('click', () => this.sendReply());
            document.getElementById('rc-cancel-reply').addEventListener('click', () => { document.getElementById('rc-reply-input').value = ''; });
            this.attachMessageActionListeners();
            const resolveBtn = document.getElementById('rc-resolve-btn');
            resolveBtn.textContent = thread.status === 'resolved' ? 'Reopen' : 'Resolve';
            resolveBtn.onclick = () => this.toggleResolve();
        }

        attachMessageActionListeners() {
            document.querySelectorAll('.rc-reaction[data-emoji]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleReaction(btn.dataset.messageId, btn.dataset.emoji, btn.classList.contains('rc-reaction-active'));
                });
            });
            document.querySelectorAll('[data-action="add-reaction"], [data-action="react"]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.showEmojiPicker(btn.dataset.messageId, btn); });
            });
            document.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.startEditingMessage(btn.dataset.messageId); });
            });
            document.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteMessage(btn.dataset.messageId); });
            });
            document.querySelectorAll('[data-action="reply"]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.showInlineReply(btn.dataset.messageId); });
            });
            document.querySelectorAll('.rc-replies-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleRepliesThread(btn.dataset.parentId); });
            });
            document.querySelectorAll('.rc-inline-send').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const form = btn.closest('.rc-inline-reply');
                    this.sendInlineReply(form.dataset.parentId, form.querySelector('.rc-inline-reply-input').value);
                });
            });
            document.querySelectorAll('.rc-inline-cancel').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const form = btn.closest('.rc-inline-reply');
                    form.classList.remove('rc-active');
                    form.querySelector('.rc-inline-reply-input').value = '';
                });
            });
        }

        toggleRepliesThread(parentId) {
            if (this.collapsedThreads.has(parentId)) this.collapsedThreads.delete(parentId);
            else this.collapsedThreads.add(parentId);
            this.renderThreadModal(this.selectedThread);
        }

        showInlineReply(messageId) {
            document.querySelectorAll('.rc-inline-reply').forEach(f => f.classList.remove('rc-active'));
            const form = document.querySelector(`.rc-inline-reply[data-parent-id="${messageId}"]`);
            if (form) { form.classList.add('rc-active'); form.querySelector('.rc-inline-reply-input').focus(); }
        }

        async sendInlineReply(parentId, content) {
            content = content.trim();
            if (!content || !this.selectedThread) return;
            try {
                const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repo: this.repo, content, parent_message_id: parentId })
                });
                if (!response.ok) throw new Error('Failed');
                await this.showThreadDetails(this.selectedThread);
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async sendReply() {
            const input = document.getElementById('rc-reply-input');
            const content = input.value.trim();
            if (!content) return;
            try {
                const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repo: this.repo, content })
                });
                if (!response.ok) throw new Error('Failed');
                input.value = '';
                await this.showThreadDetails(this.selectedThread);
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async toggleResolve() {
            if (!this.selectedThread) return;
            const newStatus = this.selectedThread.status === 'resolved' ? 'open' : 'resolved';
            try {
                const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus, repo: this.repo })
                });
                if (!response.ok) throw new Error('Failed');
                this.selectedThread.status = newStatus;
                this.renderThreadModal(this.selectedThread);
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        static QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀', '🔥', '✅'];

        showEmojiPicker(messageId, triggerElement) {
            this.hideEmojiPicker();
            const picker = document.createElement('div');
            picker.className = 'rc-emoji-picker';
            picker.id = 'rc-emoji-picker';
            picker.innerHTML = `<div class="rc-emoji-grid">${RepoComments.QUICK_EMOJIS.map(e => `<button class="rc-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}</div>`;
            const rect = triggerElement.getBoundingClientRect();
            picker.style.position = 'fixed';
            picker.style.top = `${rect.bottom + 8}px`;
            picker.style.left = `${Math.max(8, rect.left - 100)}px`;
            document.body.appendChild(picker);
            picker.addEventListener('click', async (e) => {
                const btn = e.target.closest('.rc-emoji-btn');
                if (btn) { await this.addReaction(messageId, btn.dataset.emoji); this.hideEmojiPicker(); }
            });
            setTimeout(() => {
                document.addEventListener('click', this.handlePickerOutsideClick = (e) => {
                    if (!picker.contains(e.target) && e.target !== triggerElement) this.hideEmojiPicker();
                });
            }, 10);
        }

        hideEmojiPicker() {
            document.getElementById('rc-emoji-picker')?.remove();
            if (this.handlePickerOutsideClick) document.removeEventListener('click', this.handlePickerOutsideClick);
        }

        async addReaction(messageId, emoji) {
            if (!this.selectedThread) return;
            try {
                await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}/reactions`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emoji, repo: this.repo })
                });
                await this.showThreadDetails(this.selectedThread);
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async removeReaction(messageId, emoji) {
            if (!this.selectedThread) return;
            try {
                await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                await this.showThreadDetails(this.selectedThread);
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async toggleReaction(messageId, emoji, hasCurrentUser) {
            if (hasCurrentUser) await this.removeReaction(messageId, emoji);
            else await this.addReaction(messageId, emoji);
        }

        startEditingMessage(messageId) {
            const msg = this.selectedThread?.messages?.find(m => m.id === messageId);
            if (!msg) return;
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            const contentEl = messageEl?.querySelector('.rc-message-content');
            if (!contentEl) return;
            const original = msg.content;
            contentEl.innerHTML = `
                <div class="rc-edit-form">
                    <textarea class="rc-reply-input" id="rc-edit-input" style="min-height:60px;">${this.escapeHtml(original)}</textarea>
                    <div class="rc-button-group" style="margin-top:8px;">
                        <button class="rc-button-primary" id="rc-save-edit">Save</button>
                        <button class="rc-button-secondary" id="rc-cancel-edit">Cancel</button>
                    </div>
                </div>
            `;
            const input = document.getElementById('rc-edit-input');
            input.focus();
            document.getElementById('rc-save-edit').addEventListener('click', async () => {
                const newContent = input.value.trim();
                if (newContent && newContent !== original) await this.saveMessageEdit(messageId, newContent);
                else this.renderThreadModal(this.selectedThread);
            });
            document.getElementById('rc-cancel-edit').addEventListener('click', () => this.renderThreadModal(this.selectedThread));
        }

        async saveMessageEdit(messageId, newContent) {
            try {
                await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent, repo: this.repo })
                });
                await this.showThreadDetails(this.selectedThread);
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async deleteMessage(messageId) {
            if (!confirm('Delete this message?')) return;
            try {
                await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                await this.showThreadDetails(this.selectedThread);
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        openModal() { document.getElementById('rc-modal-overlay').classList.add('open'); }
        closeModal() { document.getElementById('rc-modal-overlay').classList.remove('open'); this.selectedThread = null; }

        formatTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            if (seconds < 60) return 'just now';
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
            if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
            if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
            return date.toLocaleDateString();
        }

        getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'; }
        escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
        getCurrentUserId() {
            if (!this.token) return null;
            try { return JSON.parse(atob(this.token.split('.')[1])).id; } catch { return null; }
        }

        renderMessage(msg, options = {}) {
            const { isConsecutive = false, showActions = true } = options;
            const initials = this.getInitials(msg.author_name);
            const timeAgo = this.formatTimeAgo(new Date(msg.created_at));
            const fullTime = new Date(msg.created_at).toLocaleString();
            const isOwnMessage = msg.author_id === this.getCurrentUserId();
            const avatarStyle = msg.author_avatar ? `background-image: url('${this.escapeHtml(msg.author_avatar)}'); color: transparent;` : '';
            const reactionsHtml = this.renderReactions(msg);
            const actionsHtml = showActions ? `
                <div class="rc-message-actions">
                    <button class="rc-action-btn" data-action="react" data-message-id="${msg.id}">😀</button>
                    <button class="rc-action-btn" data-action="reply" data-message-id="${msg.id}">↩</button>
                    ${isOwnMessage ? `<button class="rc-action-btn" data-action="edit" data-message-id="${msg.id}">✏️</button><button class="rc-action-btn" data-action="delete" data-message-id="${msg.id}">🗑️</button>` : ''}
                </div>` : '';

            if (isConsecutive) return `
                <div class="rc-message rc-consecutive" data-message-id="${msg.id}">
                    <div class="rc-message-gutter"></div>
                    <div class="rc-message-body"><div class="rc-message-content">${this.escapeHtml(msg.content)}</div>${reactionsHtml}</div>
                    ${actionsHtml}
                </div>`;
            return `
                <div class="rc-message" data-message-id="${msg.id}">
                    <div class="rc-message-avatar-col"><div class="rc-message-avatar" style="${avatarStyle}">${initials}</div></div>
                    <div class="rc-message-body">
                        <div class="rc-message-header">
                            <span class="rc-message-author">${this.escapeHtml(msg.author_name || 'Unknown')}</span>
                            <span class="rc-message-time" title="${fullTime}">${timeAgo}</span>
                            ${msg.edited ? '<span class="rc-message-edited">(edited)</span>' : ''}
                        </div>
                        <div class="rc-message-content">${this.escapeHtml(msg.content)}</div>
                        ${reactionsHtml}
                    </div>
                    ${actionsHtml}
                </div>`;
        }

        renderReactions(msg) {
            if (!msg.reactions || msg.reactions.length === 0) return '';
            const currentUserId = this.getCurrentUserId();
            const grouped = {};
            msg.reactions.forEach(r => {
                if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], hasCurrentUser: false };
                grouped[r.emoji].count++;
                grouped[r.emoji].users.push(r.user_name || 'User');
                if (r.user_id === currentUserId) grouped[r.emoji].hasCurrentUser = true;
            });
            return `<div class="rc-reactions">${Object.entries(grouped).map(([emoji, data]) => `
                <button class="rc-reaction ${data.hasCurrentUser ? 'rc-reaction-active' : ''}" data-emoji="${this.escapeHtml(emoji)}" data-message-id="${msg.id}" title="${data.users.join(', ')}">
                    <span class="rc-reaction-emoji">${emoji}</span><span class="rc-reaction-count">${data.count}</span>
                </button>`).join('')}
                <button class="rc-reaction rc-add-reaction" data-action="add-reaction" data-message-id="${msg.id}"><span class="rc-reaction-emoji">+</span></button>
            </div>`;
        }

        renderMessages(messages) {
            if (!messages || messages.length === 0) return '<div class="rc-empty">No messages yet</div>';
            const topLevel = messages.filter(m => !m.parent_message_id);
            const replies = messages.filter(m => m.parent_message_id);
            const repliesByParent = {};
            replies.forEach(r => { if (!repliesByParent[r.parent_message_id]) repliesByParent[r.parent_message_id] = []; repliesByParent[r.parent_message_id].push(r); });
            let html = '';
            for (let i = 0; i < topLevel.length; i++) {
                const msg = topLevel[i], prev = topLevel[i - 1];
                const isConsecutive = prev && prev.author_id === msg.author_id && !prev.parent_message_id && (new Date(msg.created_at) - new Date(prev.created_at)) < 300000;
                html += this.renderMessage(msg, { isConsecutive });
                const msgReplies = repliesByParent[msg.id];
                if (msgReplies && msgReplies.length > 0) html += this.renderRepliesThread(msg.id, msgReplies);
                html += `<div class="rc-inline-reply" data-parent-id="${msg.id}"><textarea class="rc-inline-reply-input" placeholder="Reply..."></textarea><div class="rc-inline-reply-actions"><button class="rc-button-primary rc-inline-send">Send</button><button class="rc-button-secondary rc-inline-cancel">Cancel</button></div></div>`;
            }
            return html;
        }

        renderRepliesThread(parentId, replies) {
            const isCollapsed = this.collapsedThreads.has(parentId);
            let html = '';
            for (let i = 0; i < replies.length; i++) {
                const r = replies[i], prev = replies[i - 1];
                const isConsec = prev && prev.author_id === r.author_id && (new Date(r.created_at) - new Date(prev.created_at)) < 300000;
                html += this.renderMessage(r, { isConsecutive: isConsec });
            }
            return `<button class="rc-replies-toggle" data-parent-id="${parentId}"><span>${isCollapsed ? '▶' : '▼'}</span><span>${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}</span></button><div class="rc-thread-replies ${isCollapsed ? 'rc-collapsed' : ''}">${html}</div>`;
        }

        startAddingComment() { this.isAddingComment = true; document.body.classList.add('rc-adding-comment'); this.togglePanel(); }
        cancelAddingComment() { this.isAddingComment = false; document.body.classList.remove('rc-adding-comment'); }

        getElementSelector(element) {
            if (!element) return null;
            if (element.id) return `#${element.id}`;
            const path = [];
            let current = element;
            while (current && current.tagName !== 'BODY') {
                let selector = current.tagName.toLowerCase();
                if (current.className && typeof current.className === 'string') {
                    const classes = current.className.split(' ').filter(c => c && !c.startsWith('rc-')).join('.');
                    if (classes) selector += '.' + classes;
                }
                if (current.parentElement) {
                    const siblings = Array.from(current.parentElement.children).filter(el => el.tagName === current.tagName);
                    if (siblings.length > 1) selector += `:nth-child(${siblings.indexOf(current) + 1})`;
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        }

        isElementVisible(element) {
            if (!element) return false;
            const style = getComputedStyle(element);
            return element.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        getElementPosition(element) {
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width / 2 + window.scrollX, y: rect.top + rect.height / 2 + window.scrollY };
        }

        handleMarkerMouseDown(e, thread) {
            e.stopPropagation();
            const marker = e.target, startX = e.clientX, startY = e.clientY;
            let hasMoved = false;
            const rect = marker.getBoundingClientRect();
            this.dragOffset = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
            const onMove = (ev) => {
                if (!hasMoved && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
                    hasMoved = true; marker.classList.add('dragging'); this.draggedMarker = { marker, thread };
                }
                if (hasMoved) {
                    marker.style.left = `${ev.clientX - this.dragOffset.x + window.scrollX}px`;
                    marker.style.top = `${ev.clientY - this.dragOffset.y + window.scrollY}px`;
                }
            };
            const onUp = async (ev) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (hasMoved) {
                    marker.classList.remove('dragging');
                    const x = parseFloat(marker.style.left), y = parseFloat(marker.style.top);
                    marker.style.pointerEvents = 'none';
                    const el = document.elementFromPoint(ev.clientX, ev.clientY);
                    marker.style.pointerEvents = 'auto';
                    await this.updateMarkerPosition(thread.id, x, y, this.getElementSelector(el));
                    this.draggedMarker = null;
                } else this.showThreadDetails(thread);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        async updateMarkerPosition(threadId, x, y, selector) {
            try {
                await fetch(`${this.apiUrl}/api/v1/threads/${threadId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repo: this.repo, coordinates: { x, y }, selector })
                });
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }

        async handleDocumentClick(e) {
            if (!this.isAddingComment) return;
            if (e.target.closest('.rc-root') || e.target.closest('.rc-panel') || this.draggedMarker) return;
            this.cancelAddingComment();

            const x = e.clientX + window.scrollX, y = e.clientY + window.scrollY;
            const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
            const selector = this.getElementSelector(clickedElement);

            // Get element metadata
            const elementTag = clickedElement?.tagName?.toLowerCase() || '';
            const elementText = getElementText(clickedElement);

            // Capture screenshot BEFORE showing prompt (so element is still visible)
            let screenshot = null;
            if (clickedElement && typeof html2canvas !== 'undefined') {
                try {
                    console.log('[RepoComments] Capturing screenshot...');
                    screenshot = await captureElementScreenshot(clickedElement);
                    console.log('[RepoComments] Screenshot captured:', screenshot ? `${screenshot.length} chars` : 'null');
                } catch (err) {
                    console.warn('[RepoComments] Screenshot capture failed:', err);
                }
            }

            // Now show the prompt
            const message = prompt('Enter your comment:');
            if (!message) return;

            try {
                await fetch(`${this.apiUrl}/api/v1/threads`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        repo: this.repo,
                        branch: this.branch,
                        context_type: 'ui',
                        coordinates: { x, y },
                        selector,
                        element_tag: elementTag,
                        element_text: elementText,
                        screenshot,
                        message
                    })
                });
                await this.loadThreads();
            } catch (error) { console.error('[RepoComments] Error:', error); }
        }
    }

    // Initialize when DOM is ready
    function initialize() {
        // Load dependencies in parallel
        loadSocketIO(() => {});
        loadHtml2Canvas(() => {
            console.log('[RepoComments] html2canvas loaded for screenshot capture');
        });

        // Initialize widget
        window.repoComments = new RepoComments(config);
        console.log('[RepoComments] Initialized for', config.repo, '/', config.branch);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
