// popup.js - COMPLETE REDESIGN WITH ENHANCED FUNCTIONALITY
class FlagitPopup {
  constructor() {
    this.currentSelection = [];
    this.isConnected = false;
    this.init();
  }

  init() {
    this.setupElements();
    this.setupEventListeners();
    this.loadSelection();
    this.setupRealtimeUpdates();
  }

  setupElements() {
    // Cache DOM elements
    this.elements = {
      summaryTitle: document.getElementById('summary-title'),
      summaryDetail: document.getElementById('summary-detail'),
      refreshBtn: document.getElementById('refresh-btn'),
      breakdownSection: document.getElementById('breakdown-section'),
      feedbackSection: document.getElementById('feedback-section'),
      emptyState: document.getElementById('empty-state'),
      safeCount: document.getElementById('safe-count'),
      phishingCount: document.getElementById('phishing-count'),
      unknownCount: document.getElementById('unknown-count'),
      btnCorrect: document.getElementById('btn-correct'),
      btnIncorrect: document.getElementById('btn-incorrect'),
      feedbackMessage: document.getElementById('feedback-message'),
      connectionStatus: document.getElementById('connection-status'),
      statusIndicator: document.getElementById('status-indicator')
    };
  }

  setupEventListeners() {
    this.elements.refreshBtn.addEventListener('click', () => this.loadSelection());
    this.elements.btnCorrect.addEventListener('click', () => this.sendFeedback('agreed'));
    this.elements.btnIncorrect.addEventListener('click', () => this.sendFeedback('disagreed'));

    // Refresh when popup opens
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.loadSelection();
    });

    window.addEventListener('focus', () => {
      setTimeout(() => this.loadSelection(), 100);
    });
  }

  setupRealtimeUpdates() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "SELECTION_UPDATED") {
        console.log('🔄 Real-time selection update received');
        this.currentSelection = message.selection || [];
        this.updateDisplay();
      }
    });
  }

  async loadSelection() {
    this.showLoadingState();
    
    try {
      const response = await this.getSelectionFromGmail();
      this.currentSelection = response.selection || [];
      this.updateDisplay();
      this.updateConnectionStatus('connected');
    } catch (error) {
      console.error('Error loading selection:', error);
      this.showErrorState('Failed to connect to Gmail');
      this.updateConnectionStatus('disconnected');
    }
  }

  async getSelectionFromGmail() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        
        if (!tab || !tab.id) {
          reject(new Error('No active tab found'));
          return;
        }

        if (!tab.url.includes('mail.google.com')) {
          reject(new Error('Please open Gmail to use Flagit'));
          return;
        }

        chrome.tabs.sendMessage(
          tab.id,
          { type: "GET_SELECTION" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response || { selection: [] });
            }
          }
        );
      });
    });
  }

  updateDisplay() {
    if (this.currentSelection.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideEmptyState();
    this.updateSummary();
    this.updateBreakdown();
    this.updateFeedbackSection();
  }

  showLoadingState() {
    this.elements.summaryTitle.textContent = 'Analyzing Selection';
    this.elements.summaryDetail.innerHTML = '<div class="loading-spinner"></div>';
    this.elements.breakdownSection.style.display = 'none';
    this.elements.feedbackSection.style.display = 'none';
    this.updateConnectionStatus('connecting');
  }

  showEmptyState() {
    this.elements.emptyState.style.display = 'block';
    this.elements.breakdownSection.style.display = 'none';
    this.elements.feedbackSection.style.display = 'none';
    this.elements.summaryDetail.textContent = 'Select emails in Gmail to analyze';
  }

  hideEmptyState() {
    this.elements.emptyState.style.display = 'none';
  }

  updateSummary() {
    const count = this.currentSelection.length;
    this.elements.summaryTitle.textContent = `${count} Email${count > 1 ? 's' : ''} Selected`;
    
    const classifiedCount = this.currentSelection.filter(email => 
      email.label && email.label !== 'unknown'
    ).length;

    if (classifiedCount === 0) {
      this.elements.summaryDetail.textContent = 'Analyzing emails for phishing...';
    } else {
      this.elements.summaryDetail.textContent = `${classifiedCount} of ${count} emails classified`;
    }
  }

  updateBreakdown() {
    const labels = this.currentSelection.map(email => email.label || 'unknown');
    const safeCount = labels.filter(label => label === 'legitimate').length;
    const phishingCount = labels.filter(label => label === 'phishing').length;
    const unknownCount = labels.length - safeCount - phishingCount;

    this.elements.safeCount.textContent = safeCount;
    this.elements.phishingCount.textContent = phishingCount;
    this.elements.unknownCount.textContent = unknownCount;

    // Show breakdown section if we have classifications
    if (safeCount > 0 || phishingCount > 0) {
      this.elements.breakdownSection.style.display = 'block';
      this.elements.breakdownSection.classList.add('fade-in');
    } else {
      this.elements.breakdownSection.style.display = 'none';
    }
  }

  updateFeedbackSection() {
    const hasClassifications = this.currentSelection.some(email => 
      email.label && email.label !== 'unknown'
    );

    if (hasClassifications) {
      this.elements.feedbackSection.style.display = 'block';
      this.elements.feedbackSection.classList.add('fade-in');
      this.elements.btnCorrect.disabled = false;
      this.elements.btnIncorrect.disabled = false;
    } else {
      this.elements.feedbackSection.style.display = 'none';
      this.elements.btnCorrect.disabled = true;
      this.elements.btnIncorrect.disabled = true;
    }

    this.clearFeedbackMessage();
  }

async sendFeedback(verdict) {
  const classifiedEmails = this.currentSelection.filter(email => 
    email.label && email.label !== 'unknown'
  );

  if (!classifiedEmails.length) {
    this.showFeedbackMessage('No classified emails to provide feedback on', 'error');
    return;
  }

  this.setFeedbackButtonsState(true);
  this.showFeedbackMessage('Sending feedback...', 'info');

  console.log('📤 Sending feedback for:', classifiedEmails.length, 'emails');
  console.log('Verdict:', verdict);
  console.log('First email sample:', {
    subject: classifiedEmails[0]?.subject,
    label: classifiedEmails[0]?.label,
    confidence: classifiedEmails[0]?.confidence,
    hasFullText: !!classifiedEmails[0]?.full_text
  });

  try {
    chrome.runtime.sendMessage(
      {
        type: "FEEDBACK_BATCH",
        items: classifiedEmails,
        verdict: verdict
      },
      (response) => {
        console.log('📨 Backend response:', response);
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          this.showFeedbackMessage('Extension communication failed', 'error');
        } else if (response && response.success) {
          this.showFeedbackMessage(
            `✅ Thanks! Feedback sent for ${classifiedEmails.length} email${classifiedEmails.length === 1 ? '' : 's'}`,
            'success'
          );
          
          // Clear selection after successful feedback
          setTimeout(() => {
            this.currentSelection = [];
            this.updateDisplay();
          }, 2000);
        } else {
          console.error('Backend error response:', response);
          this.showFeedbackMessage('Failed to send feedback to server', 'error');
        }
        this.setFeedbackButtonsState(false);
      }
    );
  } catch (error) {
    console.error('Feedback error:', error);
    this.showFeedbackMessage('Error sending feedback', 'error');
    this.setFeedbackButtonsState(false);
  }
}

  setFeedbackButtonsState(disabled) {
    this.elements.btnCorrect.disabled = disabled;
    this.elements.btnIncorrect.disabled = disabled;
  }

  showFeedbackMessage(message, type = 'info') {
    this.elements.feedbackMessage.textContent = message;
    this.elements.feedbackMessage.className = `feedback-message ${type}`;
  }

  clearFeedbackMessage() {
    this.elements.feedbackMessage.textContent = '';
    this.elements.feedbackMessage.className = 'feedback-message';
  }

  updateConnectionStatus(status) {
    const statusMap = {
      connecting: { text: 'Connecting to Gmail...', class: 'connecting' },
      connected: { text: 'Connected to Gmail', class: 'connected' },
      disconnected: { text: 'Disconnected from Gmail', class: 'disconnected' }
    };

    const statusInfo = statusMap[status] || statusMap.connecting;
    this.elements.connectionStatus.textContent = statusInfo.text;
    this.elements.connectionStatus.className = `connection-status ${statusInfo.class}`;

    // Update status indicator color
    if (this.elements.statusIndicator) {
      const colorMap = {
        connecting: '#ed8936',
        connected: '#48bb78',
        disconnected: '#e53e3e'
      };
      this.elements.statusIndicator.style.background = colorMap[status] || '#ed8936';
    }
  }

  showErrorState(message) {
    this.elements.summaryTitle.textContent = 'Connection Error';
    this.elements.summaryDetail.textContent = message;
    this.elements.breakdownSection.style.display = 'none';
    this.elements.feedbackSection.style.display = 'none';
    this.elements.emptyState.style.display = 'none';
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new FlagitPopup();
});

// Utility function for older browser support
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    var el = this;
    do {
      if (Element.prototype.matches.call(el, s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}