/**
 * Auto-Logout Module
 * Automatically logs out users after a period of inactivity
 * Shows a warning modal with countdown before logging out
 */

export class AutoLogout {
    constructor(options = {}) {
        // Configuration
        // CHANGE SESSION TIMEOUT HERE:
        this.warningTime = options.warningTime || 5 * 60 * 1000; // 5 minutes
        this.logoutTime = options.logoutTime || 6 * 60 * 1000; // 6 minutes total (5 min + 1 min countdown)
        this.countdownDuration = this.logoutTime - this.warningTime; // 1 minute countdown
        this.supabase = options.supabase; // Supabase client instance
        this.onLogout = options.onLogout || null; // Optional callback before logout
        
        // State
        this.activityTimer = null;
        this.activityTrackingPaused = false; // For testing/debugging
        this.countdownTimer = null;
        this.countdownInterval = null;
        this.modalVisible = false;
        this.lastActivity = Date.now();
        this.lastResetTime = 0; // Track last time timer was reset for throttling
        
        // Activity event types to monitor
        // Note: mousemove is excluded to prevent phantom events from resetting timer
        // Only deliberate user actions (clicks, keypresses, scrolling) reset the timer
        this.activityEvents = [
            'mousedown',
            'keydown',
            'keypress',
            'scroll',
            'touchstart',
            'click',
            'wheel'
        ];
        
        // Bind methods
        this.handleActivity = this.handleActivity.bind(this);
        this.showWarningModal = this.showWarningModal.bind(this);
        this.hideWarningModal = this.hideWarningModal.bind(this);
        this.performLogout = this.performLogout.bind(this);
        this.startCountdown = this.startCountdown.bind(this);
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.createModal();
                this.init();
            });
        } else {
            this.createModal();
            this.init();
        }
    }
    
    /**
     * Create the warning modal HTML
     */
    createModal() {
        if (document.getElementById('auto-logout-modal')) {
            return;
        }
        
        try {
            const modal = document.createElement('div');
            modal.id = 'auto-logout-modal';
            modal.className = 'auto-logout-modal';
            modal.innerHTML = `
                <div class="auto-logout-overlay"></div>
                <div class="auto-logout-content">
                    <h3>Session Timeout</h3>
                    <p>You will be logged out in <strong id="auto-logout-seconds">60</strong> seconds</p>
                    <button id="auto-logout-stay-btn" class="modal-btn confirm">
                        Stay Signed In
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const stayBtn = document.getElementById('auto-logout-stay-btn');
            if (stayBtn) {
                stayBtn.addEventListener('click', () => {
                    this.hideWarningModal();
                    this.resetTimer();
                });
            }
        } catch (error) {
            console.error('[Auto-Logout] Error creating modal:', error);
        }
    }
    
    /**
     * Initialize the auto-logout system
     */
    init() {
        this.activityEvents.forEach(event => {
            document.addEventListener(event, this.handleActivity, true);
        });
        
        this.resetTimer();
    }
    
    /**
     * Handle user activity
     */
    handleActivity(event) {
        if (this.activityTrackingPaused) {
            return;
        }
        
        if (this.modalVisible) {
            return;
        }
        
        this.lastActivity = Date.now();
        
        const now = Date.now();
        const throttleDelay = 1000;
        
        if (now - this.lastResetTime >= throttleDelay) {
            this.lastResetTime = now;
            this.resetTimer();
        }
    }
    
    /**
     * Reset the inactivity timer
     */
    resetTimer() {
        if (this.activityTimer) {
            clearTimeout(this.activityTimer);
        }
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        this.activityTimer = setTimeout(this.showWarningModal, this.warningTime);
    }
    
    /**
     * Show the warning modal
     */
    showWarningModal() {
        if (this.modalVisible) {
            return;
        }
        
        const modal = document.getElementById('auto-logout-modal');
        if (!modal) {
            this.createModal();
            const retryModal = document.getElementById('auto-logout-modal');
            if (!retryModal) {
                return;
            }
            retryModal.classList.add('active');
        } else {
            modal.classList.add('active');
        }
        
        this.modalVisible = true;
        document.body.style.overflow = 'hidden';
        
        this.startCountdown();
        this.countdownTimer = setTimeout(this.performLogout, this.countdownDuration);
    }
    
    /**
     * Hide the warning modal
     */
    hideWarningModal() {
        if (!this.modalVisible) {
            return;
        }
        
        this.modalVisible = false;
        const modal = document.getElementById('auto-logout-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        
        document.body.style.overflow = '';
        
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
        }
    }
    
    /**
     * Start the countdown display
     */
    startCountdown() {
        const secondsElement = document.getElementById('auto-logout-seconds');
        let remainingSeconds = Math.floor(this.countdownDuration / 1000);
        
        // Update immediately
        secondsElement.textContent = remainingSeconds;
        
        // Update every second
        this.countdownInterval = setInterval(() => {
            remainingSeconds--;
            
            if (remainingSeconds <= 0) {
                clearInterval(this.countdownInterval);
                secondsElement.textContent = '0';
                return;
            }
            
            secondsElement.textContent = remainingSeconds;
            
            // Add urgency class when less than 10 seconds
            if (remainingSeconds <= 10) {
                secondsElement.classList.add('urgent');
            }
        }, 1000);
    }
    
    /**
     * Perform the logout
     */
    async performLogout() {
        // Clear all timers
        if (this.activityTimer) clearTimeout(this.activityTimer);
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        
        // Remove event listeners
        this.activityEvents.forEach(event => {
            document.removeEventListener(event, this.handleActivity, true);
        });
        
        try {
            // Call custom logout callback if provided
            if (this.onLogout && typeof this.onLogout === 'function') {
                await this.onLogout();
            }
            
            // Sign out from Supabase
            if (this.supabase) {
                await this.supabase.auth.signOut();
            }
            
            // Clear persisted client state on logout.
            localStorage.removeItem('admin_session_token');
            localStorage.removeItem('adminActivePanel');
            localStorage.removeItem('adminFilters');
            localStorage.removeItem('adminSort');
            localStorage.removeItem('dashboardFilters');
            localStorage.removeItem('dashboardSort');
            sessionStorage.removeItem('adminLoginMarker');
            sessionStorage.removeItem('dashboardLoginMarker');
            
            // Redirect to login page
            window.location.href = '../index.html';
        } catch (error) {
            console.error('Error during auto-logout:', error);
            // Force redirect even if logout fails
            window.location.href = '../index.html';
        }
    }
    
    /**
     * Pause activity tracking (for testing/debugging)
     */
    pauseActivityTracking() {
        this.activityTrackingPaused = true;
    }
    
    /**
     * Resume activity tracking (for testing/debugging)
     */
    resumeActivityTracking() {
        this.activityTrackingPaused = false;
    }
    
    /**
     * Destroy the auto-logout instance
     */
    destroy() {
        // Remove event listeners
        this.activityEvents.forEach(event => {
            document.removeEventListener(event, this.handleActivity, true);
        });
        
        // Clear timers
        if (this.activityTimer) clearTimeout(this.activityTimer);
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        
        // Remove modal
        const modal = document.getElementById('auto-logout-modal');
        if (modal) {
            modal.remove();
        }
        
        // Restore body scrolling
        document.body.style.overflow = '';
    }
}

/**
 * Simple initialization function for easy setup
 */
export function initAutoLogout(supabase, options = {}) {
    const instance = new AutoLogout({
        supabase,
        ...options
    });
    
    window.__autoLogoutInstance = instance;
    return instance;
}
