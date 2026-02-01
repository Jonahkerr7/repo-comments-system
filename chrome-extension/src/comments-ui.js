// RepoComments - Vanilla JS Implementation
// Figma-like commenting system

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

        console.log('[RepoComments] Initialized successfully');
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

            /* Message thread */
            .rc-message { margin-bottom: 20px; }
            .rc-message-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .rc-message-avatar { width: 32px; height: 32px; border-radius: 50%; background: #7B61FF; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
            .rc-message-author { font-weight: 600; font-size: 14px; }
            .rc-message-time { font-size: 12px; color: #6F6F6F; }
            .rc-message-content { padding-left: 40px; font-size: 14px; color: #000; line-height: 1.5; }

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
                <div class="rc-thread-content">${thread.messages?.[0]?.content || 'No content'}</div>
                <div class="rc-thread-meta">Comment #${i + 1}</div>
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

        const messagesHtml = messages.map(msg => {
            const initials = (msg.author_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase();
            const timeAgo = this.formatTimeAgo(new Date(msg.created_at));

            return `
                <div class="rc-message">
                    <div class="rc-message-header">
                        <div class="rc-message-avatar">${initials}</div>
                        <span class="rc-message-author">${msg.author_name || 'Unknown'}</span>
                        <span class="rc-message-time">${timeAgo}</span>
                    </div>
                    <div class="rc-message-content">${msg.content}</div>
                </div>
            `;
        }).join('');

        modalBody.innerHTML = `
            <div class="rc-thread-messages">
                ${messagesHtml}
            </div>
            <div class="rc-reply-form">
                <textarea class="rc-reply-input" id="rc-reply-input" placeholder="Add a reply..."></textarea>
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
    const token = localStorage.getItem('repo-comments-token');
    if (token) {
        window.repoComments = new RepoComments({
            apiUrl: 'http://localhost:3000',
            repo: 'acme-corp/design-system',
            branch: 'main'
        });
    }
});
