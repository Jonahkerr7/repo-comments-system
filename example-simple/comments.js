// RepoComments - Vanilla JS Implementation
// Figma-like commenting system

class RepoComments {
    constructor(config) {
        this.apiUrl = config.apiUrl;
        this.repo = config.repo;
        this.branch = config.branch;
        // Check both token keys - demo app uses 'repo-comments-token', admin dashboard uses 'admin_token'
        this.token = localStorage.getItem('repo-comments-token') || localStorage.getItem('admin_token');
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
        if (!this.token) {
            console.log('[RepoComments] No token found, user not logged in');
            return;
        }

        // Inject UI
        this.injectStyles();
        this.injectUI();

        // Load threads
        await this.loadThreads();

        // Setup event listeners
        this.setupEventListeners();

        // Initialize WebSocket for real-time updates
        this.initWebSocket();

        console.log('[RepoComments] Initialized successfully');
    }

    // Initialize WebSocket connection
    initWebSocket() {
        if (typeof io === 'undefined') {
            console.warn('[RepoComments] Socket.IO not loaded, real-time updates disabled');
            return;
        }

        try {
            this.socket = io(this.apiUrl, {
                auth: { token: this.token },
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                console.log('[RepoComments] WebSocket connected');
                // Subscribe to the repository room
                this.socket.emit('subscribe', { repo: this.repo, branch: this.branch });
            });

            this.socket.on('subscribed', (data) => {
                console.log('[RepoComments] Subscribed to', data.repo);
            });

            this.socket.on('disconnect', () => {
                console.log('[RepoComments] WebSocket disconnected');
            });

            this.socket.on('error', (err) => {
                console.error('[RepoComments] WebSocket error:', err);
            });

            // Real-time event handlers
            this.socket.on('message:added', (data) => this.handleMessageAdded(data));
            this.socket.on('message:edited', (data) => this.handleMessageEdited(data));
            this.socket.on('message:deleted', (data) => this.handleMessageDeleted(data));
            this.socket.on('reaction:added', (data) => this.handleReactionAdded(data));
            this.socket.on('reaction:removed', (data) => this.handleReactionRemoved(data));
            this.socket.on('thread:created', (data) => this.handleThreadCreated(data));
            this.socket.on('thread:updated', (data) => this.handleThreadUpdated(data));

        } catch (error) {
            console.error('[RepoComments] Failed to initialize WebSocket:', error);
        }
    }

    // Handle new message added in real-time
    handleMessageAdded(data) {
        const { threadId, message } = data;

        // If we're viewing this thread, add the message to the UI
        if (this.selectedThread && this.selectedThread.id === threadId) {
            // Check if message already exists (avoid duplicates from own messages)
            if (!this.selectedThread.messages.find(m => m.id === message.id)) {
                this.selectedThread.messages.push(message);
                this.renderThreadModal(this.selectedThread);
                this.showToast(`${message.author_name} added a comment`);
            }
        }

        // Update thread list
        this.loadThreads();
    }

    // Handle message edited in real-time
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

    // Handle message deleted in real-time
    handleMessageDeleted(data) {
        const { threadId, messageId } = data;

        if (this.selectedThread && this.selectedThread.id === threadId) {
            this.selectedThread.messages = this.selectedThread.messages.filter(m => m.id !== messageId);
            this.renderThreadModal(this.selectedThread);
        }

        this.loadThreads();
    }

    // Handle reaction added in real-time
    handleReactionAdded(data) {
        const { messageId, reaction } = data;

        if (this.selectedThread) {
            const msg = this.selectedThread.messages.find(m => m.id === messageId);
            if (msg) {
                if (!msg.reactions) msg.reactions = [];
                // Check if already exists
                if (!msg.reactions.find(r => r.user_id === reaction.user_id && r.emoji === reaction.emoji)) {
                    msg.reactions.push(reaction);
                    this.renderThreadModal(this.selectedThread);
                }
            }
        }
    }

    // Handle reaction removed in real-time
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

    // Handle new thread created in real-time
    handleThreadCreated(data) {
        this.showToast('New comment added');
        this.loadThreads();
    }

    // Handle thread updated in real-time
    handleThreadUpdated(data) {
        this.loadThreads();
    }

    // Show toast notification
    showToast(message, duration = 3000) {
        // Remove existing toast
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
            pointer-events: auto;
        `;
        toast.textContent = message;

        // Add animation keyframes if not already added
        if (!document.getElementById('rc-toast-style')) {
            const style = document.createElement('style');
            style.id = 'rc-toast-style';
            style.textContent = `
                @keyframes rc-toast-in {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes rc-toast-out {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(20px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'rc-toast-out 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Figma-style commenting system */
            .rc-root { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 999999; }

            /* Floating comment button */
            .rc-fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: #7B61FF; color: white; border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.15); pointer-events: auto; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 1000001; }
            .rc-fab:hover { background: #6852E8; transform: scale(1.05); }
            .rc-fab svg { width: 24px; height: 24px; }
            .rc-fab-badge { position: absolute; top: -4px; right: -4px; background: #FF4757; color: white; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: 600; }

            /* Comment markers */
            .rc-marker { position: absolute; width: 32px; height: 32px; border-radius: 50%; background: #7B61FF; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; cursor: grab; pointer-events: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.12); transition: box-shadow 0.15s; z-index: 1000000; user-select: none; }
            .rc-marker:hover { box-shadow: 0 4px 16px rgba(123, 97, 255, 0.4); }
            .rc-marker.resolved { background: #00C853; opacity: 0.6; }
            .rc-marker.dragging { cursor: grabbing; box-shadow: 0 8px 24px rgba(123, 97, 255, 0.6); transform: scale(1.15); z-index: 1000001; transition: none; }
            .rc-marker.dragging::after { content: ''; position: absolute; width: 48px; height: 48px; border: 2px dashed #7B61FF; border-radius: 50%; opacity: 0.5; }

            /* Side panel */
            .rc-panel { position: fixed; top: 0; right: 0; width: 360px; height: 100vh; background: white; border-left: 1px solid #E5E5E5; box-shadow: -8px 0 24px rgba(0,0,0,0.15); pointer-events: auto; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1000002; }
            .rc-panel.open { transform: translateX(0); }

            .rc-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #E5E5E5; }
            .rc-panel-title { font-size: 14px; font-weight: 600; margin: 0; }
            .rc-panel-close { background: none; border: none; padding: 4px; cursor: pointer; border-radius: 4px; }
            .rc-panel-close:hover { background: #F5F5F5; }

            .rc-panel-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

            .rc-thread-list { }
            .rc-thread { background: white; border: 1px solid #E5E5E5; border-radius: 8px; padding: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.15s; }
            .rc-thread:hover { border-color: #7B61FF; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
            .rc-thread-content { color: #000; font-size: 13px; margin-bottom: 8px; }
            .rc-thread-meta { font-size: 12px; color: #6F6F6F; }

            .rc-button { background: #7B61FF; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 16px; width: 100%; }
            .rc-button:hover { background: #6852E8; }

            .rc-empty { text-align: center; padding: 48px 24px; color: #6F6F6F; }

            /* Thread detail modal */
            .rc-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); pointer-events: auto; display: none; align-items: center; justify-content: center; z-index: 1000003; }
            .rc-modal-overlay.open { display: flex; }
            .rc-modal { background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); width: 90%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; }
            .rc-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #E5E5E5; }
            .rc-modal-title { font-size: 16px; font-weight: 600; margin: 0; }
            .rc-modal-close { background: none; border: none; padding: 4px; cursor: pointer; border-radius: 4px; font-size: 20px; line-height: 1; }
            .rc-modal-close:hover { background: #F5F5F5; }
            .rc-modal-body { flex: 1; overflow-y: auto; padding: 24px; }
            .rc-modal-footer { padding: 16px 24px; border-top: 1px solid #E5E5E5; display: flex; gap: 8px; }

            /* Message thread - Modern Slack-style layout */
            .rc-messages-container { display: flex; flex-direction: column; gap: 2px; }
            .rc-message { display: flex; gap: 12px; padding: 8px 12px; position: relative; border-radius: 6px; transition: background 0.15s; }
            .rc-message:hover { background: rgba(123, 97, 255, 0.04); }
            .rc-message-avatar-col { flex-shrink: 0; width: 36px; }
            .rc-message-avatar { width: 36px; height: 36px; border-radius: 6px; background: #7B61FF; background-size: cover; background-position: center; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
            .rc-message-gutter { width: 36px; flex-shrink: 0; }
            .rc-message-body { flex: 1; min-width: 0; }
            .rc-message-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
            .rc-message-author { font-weight: 700; font-size: 14px; color: #1a1a1a; }
            .rc-message-time { font-size: 11px; color: #6F6F6F; cursor: default; }
            .rc-message-edited { font-size: 11px; color: #6F6F6F; font-style: italic; }
            .rc-message-content { font-size: 14px; line-height: 1.5; color: #1a1a1a; word-wrap: break-word; white-space: pre-wrap; }

            /* Consecutive messages (grouped) */
            .rc-message.rc-consecutive { padding-top: 2px; padding-bottom: 2px; }
            .rc-message.rc-consecutive .rc-message-gutter { position: relative; }
            .rc-message.rc-consecutive:hover .rc-time-tooltip { display: block; }
            .rc-time-tooltip { display: none; position: absolute; left: 0; width: 36px; text-align: center; font-size: 10px; color: #6F6F6F; }

            /* Hover action toolbar */
            .rc-message-actions { position: absolute; top: -12px; right: 12px; background: white; border: 1px solid #E5E5E5; border-radius: 6px; padding: 2px; display: none; gap: 2px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10; }
            .rc-message:hover .rc-message-actions { display: flex; }
            .rc-action-btn { width: 28px; height: 28px; border: none; background: transparent; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #6F6F6F; font-size: 14px; transition: all 0.15s; }
            .rc-action-btn:hover { background: #F5F5F5; color: #7B61FF; }
            .rc-action-btn[title]:hover::after { content: attr(title); position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); background: #1a1a1a; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; white-space: nowrap; }

            /* Reactions */
            .rc-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
            .rc-reaction { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid #E5E5E5; border-radius: 12px; background: white; cursor: pointer; transition: all 0.15s; font-size: 13px; }
            .rc-reaction:hover { border-color: #7B61FF; background: rgba(123, 97, 255, 0.08); }
            .rc-reaction.rc-reaction-active { border-color: #7B61FF; background: rgba(123, 97, 255, 0.08); }
            .rc-reaction-count { font-size: 12px; color: #6F6F6F; font-weight: 500; }
            .rc-add-reaction { opacity: 0; transition: opacity 0.15s; }
            .rc-message:hover .rc-add-reaction, .rc-reactions:hover .rc-add-reaction { opacity: 1; }

            /* Emoji picker */
            .rc-emoji-picker { position: absolute; background: white; border: 1px solid #E5E5E5; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 8px; z-index: 1000004; }
            .rc-emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
            .rc-emoji-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 18px; transition: background 0.15s; }
            .rc-emoji-btn:hover { background: #F5F5F5; }

            /* Reply form */
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

            /* Threading / Nested Replies */
            .rc-thread-container { }
            .rc-thread-replies { margin-left: 48px; border-left: 2px solid #E5E5E5; padding-left: 12px; }
            .rc-thread-replies.rc-collapsed { display: none; }
            .rc-replies-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 12px; margin-left: 48px; background: none; border: none; color: #7B61FF; font-size: 13px; font-weight: 500; cursor: pointer; border-radius: 4px; }
            .rc-replies-toggle:hover { background: rgba(123, 97, 255, 0.08); }
            .rc-replies-count { color: #6F6F6F; }
            .rc-inline-reply { margin-left: 48px; margin-top: 8px; padding: 12px; background: #F8F9FA; border-radius: 8px; display: none; }
            .rc-inline-reply.rc-active { display: block; }
            .rc-inline-reply-input { width: 100%; border: 1px solid #E5E5E5; border-radius: 6px; padding: 8px 12px; font-size: 13px; font-family: inherit; resize: none; min-height: 60px; }
            .rc-inline-reply-input:focus { outline: none; border-color: #7B61FF; }
            .rc-inline-reply-actions { display: flex; gap: 8px; margin-top: 8px; }

            /* Add comment mode */
            body.rc-adding-comment { cursor: crosshair !important; }
            body.rc-adding-comment * { cursor: crosshair !important; }
        `;
        document.head.appendChild(style);
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
                    <button class="rc-panel-close" id="rc-panel-close">✕</button>
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
                        <button class="rc-modal-close" id="rc-modal-close">✕</button>
                    </div>
                    <div class="rc-modal-body" id="rc-modal-body">
                        <!-- Thread messages will be rendered here -->
                    </div>
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
            if (e.target.id === 'rc-modal-overlay') {
                this.closeModal();
            }
        });

        document.addEventListener('click', (e) => this.handleDocumentClick(e));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isAddingComment) {
                this.cancelAddingComment();
            }
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Re-render markers when DOM changes (for tabs, dynamic content)
        const observer = new MutationObserver(() => {
            // Debounce re-rendering to avoid performance issues
            clearTimeout(this.renderTimeout);
            this.renderTimeout = setTimeout(() => {
                this.renderMarkers();
            }, 100);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']  // Watch for visibility changes
        });

        // Re-render on scroll (for fixed positioning)
        window.addEventListener('scroll', () => {
            this.renderMarkers();
        });
    }

    togglePanel() {
        this.isPanelOpen = !this.isPanelOpen;
        const panel = document.getElementById('rc-panel');
        panel.classList.toggle('open', this.isPanelOpen);
    }

    async loadThreads() {
        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads?repo=${this.repo}&branch=${this.branch}&status=open`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
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
                <div class="rc-thread-meta">Comment #${i + 1} · ${thread.message_count || 1} message${thread.message_count !== 1 ? 's' : ''}</div>
            </div>
        `).join('');

        // Add click handlers to open thread details
        document.querySelectorAll('.rc-thread').forEach((el, i) => {
            el.addEventListener('click', () => this.showThreadDetails(this.threads[i]));
        });
    }

    renderMarkers() {
        // Remove old markers
        document.querySelectorAll('.rc-marker').forEach(m => m.remove());

        // Add new markers
        this.threads.forEach((thread, i) => {
            let x, y;
            let shouldRender = false;

            // Try to use selector first (more resilient for tabs/dynamic content)
            if (thread.selector) {
                try {
                    const element = document.querySelector(thread.selector);

                    // Only show marker if element exists and is visible
                    if (element && this.isElementVisible(element)) {
                        const pos = this.getElementPosition(element);
                        x = pos.x;
                        y = pos.y;
                        shouldRender = true;
                    }
                } catch (error) {
                    // Selector failed, fall back to coordinates
                    console.warn(`[RepoComments] Selector failed for thread ${thread.id}, falling back to coordinates`);
                }
            }

            // Fallback to coordinates if selector didn't work
            if (!shouldRender && thread.coordinates) {
                x = thread.coordinates.x;
                y = thread.coordinates.y;
                shouldRender = true;
            }

            // Render the marker
            if (shouldRender) {
                const marker = document.createElement('div');
                marker.className = 'rc-marker';
                if (thread.status === 'resolved') {
                    marker.classList.add('resolved');
                }
                marker.textContent = i + 1;
                marker.style.left = `${x}px`;
                marker.style.top = `${y}px`;
                marker.style.transform = 'translate(-50%, -50%)';
                marker.dataset.threadId = thread.id;

                // Add click handler (with drag detection)
                marker.addEventListener('mousedown', (e) => this.handleMarkerMouseDown(e, thread));

                document.querySelector('.rc-root').appendChild(marker);
            }
        });
    }

    async showThreadDetails(thread) {
        try {
            // Fetch full thread details with all messages
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${thread.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to load thread details');

            const fullThread = await response.json();
            this.selectedThread = fullThread;
            this.renderThreadModal(fullThread);
            this.openModal();
        } catch (error) {
            console.error('[RepoComments] Error loading thread details:', error);
            alert('Failed to load comment thread. Check console for details.');
        }
    }

    renderThreadModal(thread) {
        const modalBody = document.getElementById('rc-modal-body');
        const messages = thread.messages || [];

        // Use the new message rendering with grouping
        const messagesHtml = this.renderMessages(messages);

        modalBody.innerHTML = `
            <div class="rc-messages-container">
                ${messagesHtml}
            </div>
            <div class="rc-reply-form" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #E5E5E5;">
                <textarea class="rc-reply-input" id="rc-reply-input" placeholder="Reply to this thread..."></textarea>
                <div class="rc-button-group">
                    <button class="rc-button-primary" id="rc-send-reply">Send</button>
                    <button class="rc-button-secondary" id="rc-cancel-reply">Cancel</button>
                </div>
            </div>
        `;

        // Add event listeners for reply form
        document.getElementById('rc-send-reply').addEventListener('click', () => this.sendReply());
        document.getElementById('rc-cancel-reply').addEventListener('click', () => {
            document.getElementById('rc-reply-input').value = '';
        });

        // Add event listeners for message actions
        this.attachMessageActionListeners();

        // Update resolve button
        const resolveBtn = document.getElementById('rc-resolve-btn');
        if (thread.status === 'resolved') {
            resolveBtn.textContent = 'Reopen';
            resolveBtn.classList.remove('rc-button-resolve');
        } else {
            resolveBtn.textContent = 'Resolve';
            resolveBtn.classList.add('rc-button-resolve');
        }
        resolveBtn.onclick = () => this.toggleResolve();
    }

    // Attach event listeners for message action buttons
    attachMessageActionListeners() {
        // Reaction buttons (existing reactions)
        document.querySelectorAll('.rc-reaction[data-emoji]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                const emoji = btn.dataset.emoji;
                const isActive = btn.classList.contains('rc-reaction-active');
                this.toggleReaction(messageId, emoji, isActive);
            });
        });

        // Add reaction button
        document.querySelectorAll('[data-action="add-reaction"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                this.showEmojiPicker(messageId, btn);
            });
        });

        // React action button
        document.querySelectorAll('[data-action="react"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                this.showEmojiPicker(messageId, btn);
            });
        });

        // Edit action button
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                this.startEditingMessage(messageId);
            });
        });

        // Delete action button
        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                this.deleteMessage(messageId);
            });
        });

        // Reply action button - show inline reply form
        document.querySelectorAll('[data-action="reply"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageId = btn.dataset.messageId;
                this.showInlineReply(messageId);
            });
        });

        // Thread toggle buttons
        document.querySelectorAll('.rc-replies-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parentId = btn.dataset.parentId;
                this.toggleRepliesThread(parentId);
            });
        });

        // Inline reply send/cancel buttons
        document.querySelectorAll('.rc-inline-send').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const form = btn.closest('.rc-inline-reply');
                const parentId = form.dataset.parentId;
                const input = form.querySelector('.rc-inline-reply-input');
                this.sendInlineReply(parentId, input.value);
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

    // Toggle replies thread visibility
    toggleRepliesThread(parentId) {
        if (this.collapsedThreads.has(parentId)) {
            this.collapsedThreads.delete(parentId);
        } else {
            this.collapsedThreads.add(parentId);
        }
        this.renderThreadModal(this.selectedThread);
    }

    // Show inline reply form for a message
    showInlineReply(messageId) {
        // Hide all other inline reply forms
        document.querySelectorAll('.rc-inline-reply').forEach(form => {
            form.classList.remove('rc-active');
        });

        // Show the form for this message
        const form = document.querySelector(`.rc-inline-reply[data-parent-id="${messageId}"]`);
        if (form) {
            form.classList.add('rc-active');
            form.querySelector('.rc-inline-reply-input').focus();
        }
    }

    // Send inline reply
    async sendInlineReply(parentId, content) {
        content = content.trim();
        if (!content || !this.selectedThread) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repo: this.repo,
                    content,
                    parent_message_id: parentId
                })
            });

            if (!response.ok) throw new Error('Failed to send reply');

            // Refresh thread to show new reply
            await this.showThreadDetails(this.selectedThread);
            await this.loadThreads();
        } catch (error) {
            console.error('[RepoComments] Error sending inline reply:', error);
            alert('Failed to send reply. Check console for details.');
        }
    }

    async sendReply() {
        const input = document.getElementById('rc-reply-input');
        const content = input.value.trim();

        if (!content) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repo: this.repo,
                    content
                })
            });

            if (!response.ok) throw new Error('Failed to send reply');

            input.value = '';

            // Reload thread details to show new message
            await this.showThreadDetails(this.selectedThread);
            await this.loadThreads();
        } catch (error) {
            console.error('[RepoComments] Error sending reply:', error);
            alert('Failed to send reply. Check console for details.');
        }
    }

    async toggleResolve() {
        if (!this.selectedThread) return;

        const newStatus = this.selectedThread.status === 'resolved' ? 'open' : 'resolved';

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: newStatus,
                    repo: this.repo
                })
            });

            if (!response.ok) throw new Error('Failed to update thread status');

            this.selectedThread.status = newStatus;
            this.renderThreadModal(this.selectedThread);
            await this.loadThreads();
        } catch (error) {
            console.error('[RepoComments] Error updating thread status:', error);
            alert('Failed to update thread status. Check console for details.');
        }
    }

    // Quick emoji list for reactions
    static QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀', '🔥', '✅'];

    // Show emoji picker near element
    showEmojiPicker(messageId, triggerElement) {
        this.hideEmojiPicker();

        const picker = document.createElement('div');
        picker.className = 'rc-emoji-picker';
        picker.id = 'rc-emoji-picker';
        picker.innerHTML = `
            <div class="rc-emoji-grid">
                ${RepoComments.QUICK_EMOJIS.map(emoji => `
                    <button class="rc-emoji-btn" data-emoji="${emoji}">${emoji}</button>
                `).join('')}
            </div>
        `;

        // Position near trigger
        const rect = triggerElement.getBoundingClientRect();
        picker.style.position = 'fixed';
        picker.style.top = `${rect.bottom + 8}px`;
        picker.style.left = `${Math.max(8, rect.left - 100)}px`;

        document.body.appendChild(picker);

        // Event handler for emoji selection
        picker.addEventListener('click', async (e) => {
            const emojiBtn = e.target.closest('.rc-emoji-btn');
            if (emojiBtn) {
                await this.addReaction(messageId, emojiBtn.dataset.emoji);
                this.hideEmojiPicker();
            }
        });

        // Close picker when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.handlePickerOutsideClick = (e) => {
                if (!picker.contains(e.target) && e.target !== triggerElement) {
                    this.hideEmojiPicker();
                }
            });
        }, 10);
    }

    hideEmojiPicker() {
        const picker = document.getElementById('rc-emoji-picker');
        if (picker) {
            picker.remove();
        }
        if (this.handlePickerOutsideClick) {
            document.removeEventListener('click', this.handlePickerOutsideClick);
        }
    }

    // Add reaction to message
    async addReaction(messageId, emoji) {
        if (!this.selectedThread) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}/reactions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ emoji, repo: this.repo })
            });

            if (!response.ok) throw new Error('Failed to add reaction');

            // Refresh thread to show new reaction
            await this.showThreadDetails(this.selectedThread);
        } catch (error) {
            console.error('[RepoComments] Error adding reaction:', error);
        }
    }

    // Remove reaction from message
    async removeReaction(messageId, emoji) {
        if (!this.selectedThread) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to remove reaction');

            // Refresh thread
            await this.showThreadDetails(this.selectedThread);
        } catch (error) {
            console.error('[RepoComments] Error removing reaction:', error);
        }
    }

    // Toggle reaction (add if not present, remove if present)
    async toggleReaction(messageId, emoji, hasCurrentUser) {
        if (hasCurrentUser) {
            await this.removeReaction(messageId, emoji);
        } else {
            await this.addReaction(messageId, emoji);
        }
    }

    // Start editing a message
    startEditingMessage(messageId) {
        const msg = this.selectedThread?.messages?.find(m => m.id === messageId);
        if (!msg) return;

        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const contentEl = messageEl.querySelector('.rc-message-content');
        if (!contentEl) return;

        const originalContent = msg.content;

        contentEl.innerHTML = `
            <div class="rc-edit-form">
                <textarea class="rc-reply-input" id="rc-edit-input" style="min-height: 60px;">${this.escapeHtml(originalContent)}</textarea>
                <div class="rc-button-group" style="margin-top: 8px;">
                    <button class="rc-button-primary rc-btn-small" id="rc-save-edit">Save</button>
                    <button class="rc-button-secondary rc-btn-small" id="rc-cancel-edit">Cancel</button>
                </div>
            </div>
        `;

        const input = document.getElementById('rc-edit-input');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);

        document.getElementById('rc-save-edit').addEventListener('click', async () => {
            const newContent = input.value.trim();
            if (newContent && newContent !== originalContent) {
                await this.saveMessageEdit(messageId, newContent);
            } else {
                this.renderThreadModal(this.selectedThread);
            }
        });

        document.getElementById('rc-cancel-edit').addEventListener('click', () => {
            this.renderThreadModal(this.selectedThread);
        });

        // Handle Enter to save, Escape to cancel
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                this.renderThreadModal(this.selectedThread);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const newContent = input.value.trim();
                if (newContent && newContent !== originalContent) {
                    await this.saveMessageEdit(messageId, newContent);
                } else {
                    this.renderThreadModal(this.selectedThread);
                }
            }
        });
    }

    // Save edited message
    async saveMessageEdit(messageId, newContent) {
        if (!this.selectedThread) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newContent, repo: this.repo })
            });

            if (!response.ok) throw new Error('Failed to edit message');

            // Refresh thread
            await this.showThreadDetails(this.selectedThread);
        } catch (error) {
            console.error('[RepoComments] Error editing message:', error);
            alert('Failed to edit message. Check console for details.');
        }
    }

    // Delete a message
    async deleteMessage(messageId) {
        if (!this.selectedThread) return;

        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${this.selectedThread.id}/messages/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to delete message');

            // Refresh thread
            await this.showThreadDetails(this.selectedThread);
            await this.loadThreads();
        } catch (error) {
            console.error('[RepoComments] Error deleting message:', error);
            alert('Failed to delete message. Check console for details.');
        }
    }

    // Set quoted message for reply
    setQuotedMessage(messageId) {
        const msg = this.selectedThread?.messages?.find(m => m.id === messageId);
        if (!msg) return;

        this.quotedMessage = msg;

        // Show quote preview above reply input
        const replyForm = document.querySelector('.rc-reply-form');
        if (!replyForm) return;

        // Remove existing quote preview
        const existingQuote = document.querySelector('.rc-quote-preview');
        if (existingQuote) existingQuote.remove();

        const quotePreview = document.createElement('div');
        quotePreview.className = 'rc-quote-preview';
        quotePreview.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; background: #F5F5F5; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #7B61FF;';
        quotePreview.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 12px; font-weight: 600; color: #7B61FF; margin-bottom: 2px;">${this.escapeHtml(msg.author_name)}</div>
                <div style="font-size: 12px; color: #6F6F6F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(msg.content.slice(0, 100))}${msg.content.length > 100 ? '...' : ''}</div>
            </div>
            <button class="rc-quote-close" style="background: none; border: none; color: #6F6F6F; cursor: pointer; padding: 2px 6px; font-size: 16px;">&times;</button>
        `;

        replyForm.insertBefore(quotePreview, replyForm.firstChild);

        quotePreview.querySelector('.rc-quote-close').addEventListener('click', () => {
            this.quotedMessage = null;
            quotePreview.remove();
        });

        // Focus the reply input
        document.getElementById('rc-reply-input')?.focus();
    }

    openModal() {
        document.getElementById('rc-modal-overlay').classList.add('open');
    }

    closeModal() {
        document.getElementById('rc-modal-overlay').classList.remove('open');
        this.selectedThread = null;
    }

    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    // Get initials from name
    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Get current user ID from token
    getCurrentUserId() {
        if (!this.token) return null;
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            return payload.id;
        } catch (e) {
            return null;
        }
    }

    // Render a single message with modern styling
    renderMessage(msg, options = {}) {
        const { isConsecutive = false, showActions = true, isReply = false } = options;
        const initials = this.getInitials(msg.author_name);
        const timeAgo = this.formatTimeAgo(new Date(msg.created_at));
        const fullTime = new Date(msg.created_at).toLocaleString();
        const currentUserId = this.getCurrentUserId();
        const isOwnMessage = msg.author_id === currentUserId;

        // Avatar with image support
        const avatarStyle = msg.author_avatar
            ? `background-image: url('${this.escapeHtml(msg.author_avatar)}'); color: transparent;`
            : '';

        // Reactions HTML
        const reactionsHtml = this.renderReactions(msg);

        // Action buttons (only show on hover)
        const actionsHtml = showActions ? `
            <div class="rc-message-actions">
                <button class="rc-action-btn" data-action="react" data-message-id="${msg.id}" title="React">😀</button>
                <button class="rc-action-btn" data-action="reply" data-message-id="${msg.id}" title="Reply">↩</button>
                ${isOwnMessage ? `
                    <button class="rc-action-btn" data-action="edit" data-message-id="${msg.id}" title="Edit">✏️</button>
                    <button class="rc-action-btn" data-action="delete" data-message-id="${msg.id}" title="Delete">🗑️</button>
                ` : ''}
            </div>
        ` : '';

        if (isConsecutive) {
            // Compact view for consecutive messages from same author
            return `
                <div class="rc-message rc-consecutive" data-message-id="${msg.id}" data-author-id="${msg.author_id}">
                    <div class="rc-message-gutter">
                        <span class="rc-time-tooltip">${timeAgo}</span>
                    </div>
                    <div class="rc-message-body">
                        <div class="rc-message-content">${this.escapeHtml(msg.content)}</div>
                        ${reactionsHtml}
                    </div>
                    ${actionsHtml}
                </div>
            `;
        }

        // Full message view with avatar and header
        return `
            <div class="rc-message" data-message-id="${msg.id}" data-author-id="${msg.author_id}">
                <div class="rc-message-avatar-col">
                    <div class="rc-message-avatar" style="${avatarStyle}">${initials}</div>
                </div>
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
            </div>
        `;
    }

    // Render reactions for a message
    renderReactions(msg) {
        if (!msg.reactions || msg.reactions.length === 0) {
            return '';
        }

        const currentUserId = this.getCurrentUserId();

        // Group reactions by emoji
        const grouped = {};
        msg.reactions.forEach(r => {
            if (!grouped[r.emoji]) {
                grouped[r.emoji] = { count: 0, users: [], hasCurrentUser: false };
            }
            grouped[r.emoji].count++;
            grouped[r.emoji].users.push(r.user_name || 'User');
            if (r.user_id === currentUserId) {
                grouped[r.emoji].hasCurrentUser = true;
            }
        });

        const reactionButtons = Object.entries(grouped).map(([emoji, data]) => `
            <button class="rc-reaction ${data.hasCurrentUser ? 'rc-reaction-active' : ''}"
                    data-emoji="${this.escapeHtml(emoji)}"
                    data-message-id="${msg.id}"
                    title="${data.users.join(', ')}">
                <span class="rc-reaction-emoji">${emoji}</span>
                <span class="rc-reaction-count">${data.count}</span>
            </button>
        `).join('');

        return `
            <div class="rc-reactions">
                ${reactionButtons}
                <button class="rc-reaction rc-add-reaction" data-action="add-reaction" data-message-id="${msg.id}">
                    <span class="rc-reaction-emoji">+</span>
                </button>
            </div>
        `;
    }

    // Render messages with grouping and threading support
    renderMessages(messages) {
        if (!messages || messages.length === 0) {
            return '<div class="rc-empty">No messages yet</div>';
        }

        // Separate top-level messages from replies
        const topLevel = messages.filter(m => !m.parent_message_id);
        const replies = messages.filter(m => m.parent_message_id);

        // Group replies by parent
        const repliesByParent = {};
        replies.forEach(r => {
            if (!repliesByParent[r.parent_message_id]) {
                repliesByParent[r.parent_message_id] = [];
            }
            repliesByParent[r.parent_message_id].push(r);
        });

        let html = '';
        for (let i = 0; i < topLevel.length; i++) {
            const msg = topLevel[i];
            const prevMsg = topLevel[i - 1];

            // Check if this is a consecutive message (same author within 5 minutes)
            const isConsecutive = prevMsg &&
                prevMsg.author_id === msg.author_id &&
                !prevMsg.parent_message_id &&
                (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 5 * 60 * 1000;

            html += this.renderMessage(msg, { isConsecutive });

            // Render replies for this message
            const msgReplies = repliesByParent[msg.id];
            if (msgReplies && msgReplies.length > 0) {
                html += this.renderRepliesThread(msg.id, msgReplies);
            }

            // Add inline reply form placeholder
            html += `<div class="rc-inline-reply" data-parent-id="${msg.id}">
                <textarea class="rc-inline-reply-input" placeholder="Reply to this message..."></textarea>
                <div class="rc-inline-reply-actions">
                    <button class="rc-button-primary rc-btn-small rc-inline-send">Send</button>
                    <button class="rc-button-secondary rc-btn-small rc-inline-cancel">Cancel</button>
                </div>
            </div>`;
        }
        return html;
    }

    // Render replies thread with collapse/expand
    renderRepliesThread(parentId, replies) {
        const isCollapsed = this.collapsedThreads && this.collapsedThreads.has(parentId);
        const replyCount = replies.length;

        let repliesHtml = '';
        for (let i = 0; i < replies.length; i++) {
            const reply = replies[i];
            const prevReply = replies[i - 1];

            const isConsecutive = prevReply &&
                prevReply.author_id === reply.author_id &&
                (new Date(reply.created_at) - new Date(prevReply.created_at)) < 5 * 60 * 1000;

            repliesHtml += this.renderMessage(reply, { isConsecutive, isReply: true });
        }

        return `
            <button class="rc-replies-toggle" data-parent-id="${parentId}">
                <span>${isCollapsed ? '▶' : '▼'}</span>
                <span class="rc-replies-count">${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}</span>
            </button>
            <div class="rc-thread-replies ${isCollapsed ? 'rc-collapsed' : ''}" data-parent-id="${parentId}">
                ${repliesHtml}
            </div>
        `;
    }

    startAddingComment() {
        this.isAddingComment = true;
        document.body.classList.add('rc-adding-comment');
        this.togglePanel(); // Close panel
        console.log('[RepoComments] Click anywhere to add a comment (press ESC to cancel)');
    }

    cancelAddingComment() {
        this.isAddingComment = false;
        document.body.classList.remove('rc-adding-comment');
    }

    // Generate unique CSS selector for an element
    getElementSelector(element) {
        if (!element) return null;

        // Use ID if available
        if (element.id) {
            return `#${element.id}`;
        }

        // Build path from element to body
        const path = [];
        let current = element;

        while (current && current.tagName !== 'BODY') {
            let selector = current.tagName.toLowerCase();

            // Add classes (exclude our comment system classes)
            if (current.className && typeof current.className === 'string') {
                const classes = current.className.split(' ')
                    .filter(c => c && !c.startsWith('rc-'))
                    .join('.');
                if (classes) {
                    selector += '.' + classes;
                }
            }

            // Add nth-child if needed for uniqueness
            if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children)
                    .filter(el => el.tagName === current.tagName);
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-child(${index})`;
                }
            }

            path.unshift(selector);
            current = current.parentElement;
        }

        return path.join(' > ');
    }

    // Check if element is visible
    isElementVisible(element) {
        if (!element) return false;

        const style = getComputedStyle(element);
        return element.offsetParent !== null &&
               style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
    }

    // Get element position on screen
    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 + window.scrollX,
            y: rect.top + rect.height / 2 + window.scrollY
        };
    }

    // Handle marker drag start
    handleMarkerMouseDown(e, thread) {
        e.stopPropagation();

        const marker = e.target;
        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;

        const markerRect = marker.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - markerRect.left - markerRect.width / 2,
            y: e.clientY - markerRect.top - markerRect.height / 2
        };

        const handleMouseMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - startX);
            const deltaY = Math.abs(moveEvent.clientY - startY);

            // Only start dragging if moved more than 5px (to distinguish from click)
            if (!hasMoved && (deltaX > 5 || deltaY > 5)) {
                hasMoved = true;
                marker.classList.add('dragging');
                this.draggedMarker = { marker, thread };
            }

            if (hasMoved) {
                const x = moveEvent.clientX - this.dragOffset.x + window.scrollX;
                const y = moveEvent.clientY - this.dragOffset.y + window.scrollY;

                marker.style.left = `${x}px`;
                marker.style.top = `${y}px`;
            }
        };

        const handleMouseUp = async (upEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            if (hasMoved) {
                marker.classList.remove('dragging');

                // Update position in database
                const x = parseFloat(marker.style.left);
                const y = parseFloat(marker.style.top);

                // Get element at new position
                marker.style.pointerEvents = 'none';
                const elementAtPos = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
                marker.style.pointerEvents = 'auto';

                const newSelector = this.getElementSelector(elementAtPos);

                await this.updateMarkerPosition(thread.id, x, y, newSelector);
                this.draggedMarker = null;
            } else {
                // It was a click, not a drag - show thread details
                this.showThreadDetails(thread);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // Update marker position in database
    async updateMarkerPosition(threadId, x, y, selector) {
        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads/${threadId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repo: this.repo,
                    coordinates: { x, y },
                    selector: selector
                })
            });

            if (!response.ok) throw new Error('Failed to update marker position');

            console.log('[RepoComments] Marker repositioned successfully');
            await this.loadThreads();

        } catch (error) {
            console.error('[RepoComments] Error updating marker position:', error);
            alert('Failed to update marker position. Check console for details.');
        }
    }

    async handleDocumentClick(e) {
        if (!this.isAddingComment) return;

        // Ignore clicks on RepoComments UI or when dragging
        if (e.target.closest('.rc-root') || e.target.closest('.rc-panel') || this.draggedMarker) {
            return;
        }

        this.cancelAddingComment();

        const x = e.clientX + window.scrollX;
        const y = e.clientY + window.scrollY;

        // Get the clicked element and generate selector
        const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
        const selector = this.getElementSelector(clickedElement);

        const message = prompt('Enter your comment:');
        if (!message) return;

        try {
            const response = await fetch(`${this.apiUrl}/api/v1/threads`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repo: this.repo,
                    branch: this.branch,
                    context_type: 'ui',
                    coordinates: { x, y },
                    selector: selector,  // Add CSS selector
                    message
                })
            });

            if (!response.ok) throw new Error('Failed to create comment');

            console.log('[RepoComments] Comment created successfully');
            await this.loadThreads();

        } catch (error) {
            console.error('[RepoComments] Error creating comment:', error);
            alert('Failed to create comment. Check console for details.');
        }
    }
}

// Auto-initialize if token exists
window.addEventListener('load', () => {
    // Check both possible token keys (demo app and admin dashboard share the same backend)
    const token = localStorage.getItem('repo-comments-token') || localStorage.getItem('admin_token');

    // Get repo from URL params, default to acme-corp/design-system for demo
    const urlParams = new URLSearchParams(window.location.search);
    const repo = urlParams.get('repo') || 'acme-corp/design-system';
    const branch = urlParams.get('branch') || 'main';

    // Show current config in console
    console.log('[RepoComments] Config:', { repo, branch, hasToken: !!token });

    if (token) {
        window.repoComments = new RepoComments({
            apiUrl: 'http://localhost:3000',
            repo: repo,
            branch: branch
        });
    }
});
