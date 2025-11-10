// content.js – ULTIMATE OPTIMIZED VERSION with persistent labels
const EXT_VERSION = "2.3.0";
const DEBOUNCE_MS = 800;

let classificationCache = new Map();
let currentSelection = [];
let currentUserSession = null;

// PERSISTENT LABEL STORAGE
const STORAGE_KEY = 'flagit_email_labels';

function saveLabelsToStorage() {
  const labels = {};
  classificationCache.forEach((value, key) => {
    labels[key] = value;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
    console.log(`💾 Saved ${Object.keys(labels).length} labels to storage`);
  } catch (e) {
    console.error('Error saving labels:', e);
  }
}

function loadLabelsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const labels = JSON.parse(stored);
      Object.entries(labels).forEach(([key, value]) => {
        classificationCache.set(key, value);
      });
      console.log(`📂 Loaded ${Object.keys(labels).length} labels from storage`);
    }
  } catch (e) {
    console.error('Error loading labels:', e);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// IMPROVED: User session management
function initializeUserSession() {
  const detectedUser = getGmailUser();
  
  // Check if we have an existing session for this user
  const existingSession = localStorage.getItem('flagit_user_session');
  if (existingSession) {
    try {
      const session = JSON.parse(existingSession);
      // If we detected a different user, update the session
      if (session.user !== detectedUser) {
        console.log('🔹 User changed, updating session:', session.user, '->', detectedUser);
        session.user = detectedUser;
        session.lastSeen = new Date().toISOString();
        localStorage.setItem('flagit_user_session', JSON.stringify(session));
      }
      currentUserSession = session;
    } catch (e) {
      console.error('Error parsing user session:', e);
    }
  }
  
  // Create new session if none exists
  if (!currentUserSession) {
    currentUserSession = {
      user: detectedUser,
      sessionId: generateSessionId(),
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    localStorage.setItem('flagit_user_session', JSON.stringify(currentUserSession));
    console.log('🔹 Created new user session:', currentUserSession);
  }
  
  return currentUserSession.user;
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function updateUserSession() {
  if (currentUserSession) {
    currentUserSession.lastSeen = new Date().toISOString();
    localStorage.setItem('flagit_user_session', JSON.stringify(currentUserSession));
  }
}

// IMPROVED: sendClassify with better logging
function sendClassify(text, sender, emailTimestamp) {
  const user = initializeUserSession();
  updateUserSession();
  
  console.log('🔹 SENDING CLASSIFICATION REQUEST:', {
    user: user,
    sender: sender,
    text_length: text.length,
    timestamp: emailTimestamp,
    preview: text.substring(0, 100)
  });
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "CLASSIFY",
        text: text,
        sender: sender,
        user: user,
        email_timestamp: emailTimestamp || null,
        session_id: currentUserSession?.sessionId
      },
      (resp) => {
        console.log('🔹 CLASSIFICATION RESPONSE:', resp);
        resolve(resp);
      }
    );
  });
}

// ULTRA-ROBUST user detection
function getGmailUser() {
  const detectionAttempts = [];
  
  try {
    console.log('=== STARTING USER DETECTION ===');
    
    // Method 1: Gmail's account menu (most reliable)
    const accountMenus = document.querySelectorAll('[aria-label*="@"], [data-tooltip*="@"]');
    for (const menu of accountMenus) {
      const text = menu.getAttribute('aria-label') || menu.getAttribute('data-tooltip') || menu.textContent || '';
      const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        detectionAttempts.push({ method: 'account_menu', email: emailMatch[0], confidence: 100 });
        console.log('✅ Found in account menu:', emailMatch[0]);
      }
    }

    // Method 2: All images with email in alt text
    const allImages = document.querySelectorAll('img');
    for (const img of allImages) {
      const altText = img.getAttribute('alt') || '';
      if (altText.includes('@')) {
        const emailMatch = altText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          detectionAttempts.push({ method: 'image_alt', email: emailMatch[0], confidence: 95 });
          console.log('✅ Found in image alt:', emailMatch[0]);
        }
      }
    }

    // Method 3: Any element that might contain email
    const potentialElements = document.querySelectorAll('[class*="account"], [class*="user"], [class*="profile"]');
    for (const el of potentialElements) {
      const text = el.textContent || el.getAttribute('aria-label') || '';
      const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        detectionAttempts.push({ method: 'account_element', email: emailMatch[0], confidence: 85 });
        console.log('✅ Found in account element:', emailMatch[0]);
      }
    }

    // Method 4: Check page title and meta
    const pageTitle = document.title;
    const emailMatchTitle = pageTitle.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatchTitle) {
      detectionAttempts.push({ method: 'page_title', email: emailMatchTitle[0], confidence: 80 });
      console.log('✅ Found in page title:', emailMatchTitle[0]);
    }

    // Method 5: Use existing session (high confidence if exists)
    const existingSession = localStorage.getItem('flagit_user_session');
    if (existingSession) {
      try {
        const session = JSON.parse(existingSession);
        if (session.user && !session.user.includes('unknown') && !session.user.includes('gmail_user_')) {
          detectionAttempts.push({ method: 'existing_session', email: session.user, confidence: 99 });
          console.log('✅ Using existing session:', session.user);
        }
      } catch (e) {
        console.error('Error parsing session:', e);
      }
    }

    // Method 6: URL-based detection for multi-account
    const urlParams = new URLSearchParams(window.location.search);
    const authUser = urlParams.get('authuser');
    if (authUser !== null) {
      const userMapping = localStorage.getItem('flagit_user_mapping');
      if (userMapping) {
        try {
          const mapping = JSON.parse(userMapping);
          if (mapping[authUser]) {
            detectionAttempts.push({ method: 'url_mapping', email: mapping[authUser], confidence: 90 });
            console.log('✅ Using URL mapping:', mapping[authUser]);
          }
        } catch (e) {
          console.error('Error parsing mapping:', e);
        }
      }
    }

    // Sort by confidence and pick the best
    if (detectionAttempts.length > 0) {
      detectionAttempts.sort((a, b) => b.confidence - a.confidence);
      const bestResult = detectionAttempts[0];
      
      console.log('🎯 BEST DETECTION RESULT:', bestResult);
      
      // Store mapping if we have authuser
      if (authUser !== null && bestResult.confidence > 80) {
        storeUserMapping(authUser, bestResult.email);
      }
      
      return bestResult.email;
    }

  } catch (e) {
    console.error('❌ Error in user detection:', e);
  }

  // ULTIMATE FALLBACK: Use domain-based consistent unknown
  const domain = window.location.hostname;
  const consistentUnknown = `consistent_${btoa(domain).slice(0, 8)}`;
  console.log('🔄 Using consistent fallback:', consistentUnknown);
  return consistentUnknown;
}

function storeUserMapping(authUserIndex, email) {
  try {
    const existingMapping = localStorage.getItem('flagit_user_mapping');
    const mapping = existingMapping ? JSON.parse(existingMapping) : {};
    mapping[authUserIndex] = email;
    localStorage.setItem('flagit_user_mapping', JSON.stringify(mapping));
    console.log('🔹 Stored user mapping:', mapping);
  } catch (e) {
    console.error('Error storing user mapping:', e);
  }
}

function getRowKey(row) {
  return (
    row.getAttribute("data-legacy-thread-id") ||
    row.getAttribute("data-thread-id") ||
    row.dataset.threadId ||
    (row.innerText || "").slice(0, 80)
  );
}

function getSenderFromRow(row) {
  const elEmail =
    row.querySelector(".yW span[email]") ||
    row.querySelector(".yW .zF") ||
    row.querySelector(".yW .yP");

  return elEmail?.getAttribute?.("email") || elEmail?.textContent || "unknown";
}

function getSubjectFromRow(row) {
  const subjEl =
    row.querySelector("span.bog") ||
    row.querySelector("div.xT > div.y6 > span");
  return (subjEl?.innerText || "").trim();
}

function getSnippetFromRow(row) {
  const sn = row.querySelector("span.y2");
  return (sn?.innerText || "").trim();
}

function ensurePill(row) {
  let pill = row.querySelector(".flagit-pill");
  if (!pill) {
    const subjEl =
      row.querySelector("span.bog") ||
      row.querySelector("div.xT > div.y6 > span");

    if (!subjEl || !subjEl.parentElement) return null;

    pill = document.createElement("span");
    pill.className = "flagit-pill";
    pill.textContent = "…";
    pill.style.marginLeft = "6px";
    pill.style.padding = "3px 8px";        // ← Increased from 2px 6px
    pill.style.borderRadius = "12px";      // ← Slightly more rounded
    pill.style.color = "#fff";
    pill.style.fontSize = "11px";          // ← Increased from 11px
    pill.style.background = "#6b7280";
    pill.style.fontWeight = "600";         // ← Slightly bolder
    pill.style.lineHeight = "1.3";         // ← Better vertical alignment
    pill.style.letterSpacing = "0.3px";    // ← Better readability
    pill.style.minWidth = "45px";          // ← ADD THIS for consistent width
    pill.style.textAlign = "center";       // ← ADD THIS to center numbers
    subjEl.parentElement.appendChild(pill);
  }
  return pill;
}

function stylePill(pill, info) {
  const { label, confidence } = info;
  const pct = confidence != null ? Math.round(confidence * 100) : null;

  if (!label || info.error) {
    pill.textContent = "•";
    pill.style.background = "#6b7280";
    pill.title = "Analyzing...";
    return;
  }

  if (label === "phishing") {
    pill.textContent = pct != null ? `🚨 Phish ${pct}%` : "🚨 Phish";
    pill.style.background = "#ef4444";
    pill.title = pct != null ? `Phishing (${pct}% confidence)` : "Phishing";
  } else {
    pill.textContent = pct != null ? `✅ Safe ${pct}%` : "✅ Safe";
    pill.style.background = "#22c55e";
    pill.title = pct != null ? `Safe (${pct}% confidence)` : "Safe";
  }
}

// IMPROVED timestamp extraction with better Gmail detection
function getEmailTimestampFromRow(row) {
  try {
    console.log('🔹 Searching for timestamp in row...');
    
    // Method 1: Look for time elements with specific Gmail classes
    const timeSelectors = [
      '.xW .xT .xY span',
      '.xW span[role="text"]', 
      '.apU .xY span',
      '.bq3',
      '.bqe',
      '.xY span',
      '.xW span',
      '.gH .g3',
      'span[data-tooltip]',
      '.bsU',
      '.bof',  
      '[data-tooltip]',
      '.aeJ',
      '.aeK',
      '.xW.xX div',  // New Gmail timestamp location
      '.xW .xX'      // Alternative location
    ];
    
    for (const selector of timeSelectors) {
      const elements = row.querySelectorAll(selector);
      for (const element of elements) {
        if (element && element.textContent) {
          const timestampText = element.textContent.trim();
          
          // Skip if it's "Select" or other non-timestamp text
          if (timestampText && 
              timestampText.length > 3 && 
              !timestampText.toLowerCase().includes('select') &&
              !timestampText.toLowerCase().includes('more') &&
              !timestampText.toLowerCase().includes('unread') &&
              (timestampText.match(/\d/) || timestampText.includes('AM') || timestampText.includes('PM'))) {
            
            console.log('🔹 Found potential timestamp text:', timestampText);
            const parsedDate = parseGmailTimestamp(timestampText);
            if (parsedDate) {
              console.log('✅ Parsed timestamp from text:', timestampText, '->', parsedDate);
              return parsedDate;
            }
          }
        }
      }
    }

    // Method 2: Check for tooltips (these often contain the full date)
    const tooltipElements = row.querySelectorAll('[data-tooltip]');
    for (const element of tooltipElements) {
      const tooltip = element.getAttribute('data-tooltip');
      if (tooltip && tooltip.length > 5 && 
          !tooltip.toLowerCase().includes('select') &&
          !tooltip.toLowerCase().includes('mark as')) {
        console.log('🔹 Found tooltip:', tooltip);
        const parsedDate = parseGmailTimestamp(tooltip);
        if (parsedDate) {
          console.log('✅ Parsed timestamp from tooltip:', tooltip, '->', parsedDate);
          return parsedDate;
        }
      }
    }

    // Method 3: Look for aria-label attributes
    const ariaElements = row.querySelectorAll('[aria-label]');
    for (const element of ariaElements) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.length > 5 && 
          (ariaLabel.includes('AM') || ariaLabel.includes('PM') || ariaLabel.match(/\d{1,2}:\d{2}/))) {
        console.log('🔹 Found aria-label:', ariaLabel);
        const parsedDate = parseGmailTimestamp(ariaLabel);
        if (parsedDate) {
          console.log('✅ Parsed timestamp from aria-label:', ariaLabel, '->', parsedDate);
          return parsedDate;
        }
      }
    }
    
  } catch (e) {
    console.error('Error extracting timestamp:', e);
  }
  
  // Fallback: Use current time (most accurate for new emails)
  const now = new Date();
  console.log('🔹 Using current time as fallback:', now.toISOString());
  return now.toISOString();
}

// IMPROVED timestamp parser with relative time support (no randomness)
function parseGmailTimestamp(text) {
  const now = new Date();
  const lower = text.toLowerCase().trim();
  
  console.log('🔹 Parsing Gmail timestamp:', text);

  // Handle "X min/minutes ago" format
  const minsAgo = lower.match(/(\d+)\s+min/);
  if (minsAgo) {
    const mins = parseInt(minsAgo[1]);
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - mins);
    return d.toISOString();
  }

  // Handle "X hour/hours ago" format  
  const hoursAgo = lower.match(/(\d+)\s+hour/);
  if (hoursAgo) {
    const hours = parseInt(hoursAgo[1]);
    const d = new Date(now);
    d.setHours(d.getHours() - hours);
    return d.toISOString();
  }

  // Handle "Just now" or "Now"
  if (lower.includes('just now') || lower === 'now') {
    return now.toISOString();
  }

  // Exact "Month Day, Year" format (fixed 12:00)
  const exactDateMatch = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (exactDateMatch) {
    const monthNames = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = monthNames[exactDateMatch[1].toLowerCase()];
    const day = parseInt(exactDateMatch[2]);
    const year = parseInt(exactDateMatch[3]);

    const d = new Date(year, month, day, 12, 0, 0, 0);
    return d.toISOString();
  }

  // Time like "2:45 PM"
  const timeMatch = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3].toLowerCase();

    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    const d = new Date();
    d.setHours(hours, minutes, 0, 0);

    if (d > now) {
      d.setDate(d.getDate() - 1);
    }

    return d.toISOString();
  }

  // "X days ago"
  const daysAgo = lower.match(/(\d+)\s+day/);
  if (daysAgo) {
    const days = parseInt(daysAgo[1]);
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  // "yesterday"
  if (lower.includes('yesterday')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  // Month + Day (no year)
  const monthDayMatch = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/i);
  if (monthDayMatch) {
    const monthNames = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = monthNames[monthDayMatch[1].toLowerCase()];
    const day = parseInt(monthDayMatch[2]);
    const currentYear = now.getFullYear();

    let d = new Date(currentYear, month, day, 12, 0, 0, 0);

    // If it's in the future by more than a month, assume previous year
    if (d > now && (d - now) / (1000 * 60 * 60 * 24) > 30) {
      d.setFullYear(currentYear - 1);
    }

    return d.toISOString();
  }

  console.log('❌ Could not parse timestamp, using current time');
  return now.toISOString(); // Always use current time as fallback
}

// ULTIMATE OPTIMIZED EMAIL PROCESSING - FIXES DISAPPEARING LABELS
async function labelInboxRows() {
  const rows = getEmailRows();
  if (rows.length === 0) {
    console.log('❌ No email rows found');
    return;
  }

  console.log(`🔹 Processing ${rows.length} emails (${classificationCache.size} cached)`);

  // PHASE 1: Restore existing classifications immediately
  let restored = 0;
  for (const row of rows) {
    const key = getRowKey(row);
    const existing = classificationCache.get(key);
    if (existing) {
      const pill = ensurePill(row);
      if (pill) {
        stylePill(pill, existing);
        row.dataset.flagitLabel = existing.label || "";
        row.dataset.flagitConfidence = existing.confidence != null ? String(existing.confidence) : "";
        restored++;
      }
    }
  }
  if (restored > 0) console.log(`✅ Restored ${restored} labels`);

  // PHASE 2: Classify unclassified emails with smart throttling
  const unclassifiedRows = [];
  for (const row of rows) {
    const key = getRowKey(row);
    if (!classificationCache.has(key) && getSubjectFromRow(row)) {
      unclassifiedRows.push({ row, key });
    }
  }

  console.log(`🔹 Classifying ${unclassifiedRows.length} new emails`);

  for (let i = 0; i < unclassifiedRows.length; i++) {
    const { row, key } = unclassifiedRows[i];
    await processSingleEmail(row, key, i, unclassifiedRows.length);
  }
}

function getEmailRows() {
  const selectors = ["tr.zA", "div[role='main'] tr", "[data-legacy-thread-id]", "[data-thread-id]"];
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) return Array.from(found);
  }
  return [];
}

//ENHANCED: Process single email with better error handling
async function processSingleEmail(row, key, index, total) {
  const subject = getSubjectFromRow(row);
  const completeText = getCompleteEmailText(row);
  const sender = getSenderFromRow(row);
  const emailTimestamp = getEmailTimestampFromRow(row);

  const pill = ensurePill(row);
  if (!pill) return;

  try {
    // Small delay to avoid overwhelming the API
    const delay = index < 3 ? 500 + (index * 150) : 200 + (index % 4) * 50;
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log(`🔹 [${index + 1}/${total}] Classifying: "${subject}"`);
    console.log(`🔹 Text: ${completeText.substring(0, 100)}...`);
    
    const res = await sendClassify(completeText, sender, emailTimestamp);
    
    if (!res) {
      console.error(`❌ [${index + 1}/${total}] No response from classification`);
      return;
    }
    
    if (res.error) {
      console.error(`❌ [${index + 1}/${total}] Classification error:`, res.error);
      return;
    }

    const info = {
      label: res.label || (res.prediction?.includes("Phishing") ? "phishing" : "legitimate"),
      confidence: typeof res.confidence === "number" ? res.confidence : null
    };

    classificationCache.set(key, info);
    saveLabelsToStorage();
    
    // Store the complete text for feedback
    row.dataset.flagitFullText = completeText;
    row.dataset.flagitLabel = info.label || "";
    row.dataset.flagitConfidence = info.confidence != null ? String(info.confidence) : "";
    stylePill(pill, info);
    
    console.log(`✅ [${index + 1}/${total}] ${info.label} (${Math.round(info.confidence * 100)}%): "${subject.substring(0, 40)}"`);
    
  } catch (e) {
    console.error(`❌ [${index + 1}/${total}] Classification error:`, e);
  }
}


// FORCE CLASSIFICATION OF VISIBLE EMAILS
function forceClassifyVisibleEmails() {
  console.log('🔄 FORCE CLASSIFYING VISIBLE EMAILS');
  const rows = getEmailRows();
  console.log(`🔹 Found ${rows.length} email rows to classify`);
  
  let classifiedCount = 0;
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) { // Limit to first 10
    const row = rows[i];
    const key = getRowKey(row);
    const subject = getSubjectFromRow(row);
    
    // Only classify if not already cached
    if (!classificationCache.has(key) && subject) {
      console.log(`🔹 Force classifying: "${subject}"`);
      processSingleEmail(row, key, i, Math.min(rows.length, 10));
      classifiedCount++;
    }
  }
  
































  
  console.log(`🔹 Initiated classification for ${classifiedCount} new emails`);
  return classifiedCount;
}

// Make it available globally for testing
window.forceClassifyVisibleEmails = forceClassifyVisibleEmails;


// Update the selection data structure
function updateSelection() {
  const rows = getEmailRows();
  const selected = [];

  console.log(`🔹 Checking ${rows.length} rows for MANUAL selection...`);

  for (const row of rows) {
    if (isRowSelected(row)) {
      const key = getRowKey(row);
      const cached = classificationCache.get(key) || {};
      
      // Get the complete email text
      const fullText = row.dataset.flagitFullText || getCompleteEmailText(row);
      
      selected.push({
        id: key,
        subject: getSubjectFromRow(row) || 'No subject',
        snippet: getSnippetFromRow(row) || 'No snippet',
        full_text: fullText, // Include complete text
        sender: getSenderFromRow(row) || 'unknown',
        label: cached.label || row.dataset.flagitLabel || null,
        confidence: cached.confidence != null ? cached.confidence : 
                   (row.dataset.flagitConfidence ? Number(row.dataset.flagitConfidence) : null)
      });
    }
  }

  console.log(`✅ Found ${selected.length} MANUALLY selected emails`);
  currentSelection = selected;
  
  chrome.runtime.sendMessage({
    type: "SELECTION_UPDATED", 
    selection: currentSelection
  }).catch(e => console.log('Popup not open'));
}

// FIXED: Detect Gmail's custom checkboxes
function isRowSelected(row) {
  // Look for Gmail's custom checkbox div with aria-checked="true"
  const customCheckbox = row.querySelector('div[role="checkbox"][aria-checked="true"]');
  
  if (customCheckbox) {
    console.log('✅ GMAIL CUSTOM CHECKBOX SELECTED:', getSubjectFromRow(row)?.substring(0, 50));
    return true;
  }
  
  return false;
}


// ENHANCED: Initialize with persistent storage
function initializeFlagit() {
  console.log('Initializing Flagit extension...');
  
  // Load persistent labels
  loadLabelsFromStorage();
  
  // Initialize user session
  initializeUserSession();
  
  // Initial scan
  labelInboxRows();
  updateSelection();
  attachCheckboxListeners();
  
  // Start selection monitoring
  startSelectionMonitoring();
  
  // Start label restoration for dynamic content
  startLabelRestoration();
  
  console.log('✅ Flagit initialization complete');
}

// FIXED: Monitor Gmail's custom checkbox clicks
function startSelectionMonitoring() {
  console.log('🔹 Starting Gmail custom checkbox monitoring');
  
  // Monitor clicks on Gmail's custom checkboxes
  document.addEventListener('click', (e) => {
    const target = e.target;
    
    // Check if click is on or near a Gmail custom checkbox
    const isCheckboxClick = 
      target.closest('div[role="checkbox"]') || // Click on checkbox itself
      target.closest('td[data-tooltip="Select"]'); // Click on checkbox cell
    
    if (isCheckboxClick) {
      console.log('🔹 Gmail checkbox interaction detected');
      setTimeout(updateSelection, 300); // Wait for Gmail to update aria-checked
    }
  });
  
  // Also monitor for aria-checked changes (Gmail updates this after clicks)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-checked') {
        console.log('🔹 aria-checked changed, updating selection');
        setTimeout(updateSelection, 200);
      }
    }
  });
  
  // Observe all checkbox elements for changes
  document.querySelectorAll('div[role="checkbox"]').forEach(checkbox => {
    observer.observe(checkbox, { attributes: true });
  });
}


// DEBUG: Manual selection testing
function debugSelection() {
  const rows = getEmailRows();
  console.log('=== SELECTION DEBUG ===');
  console.log('Total rows found:', rows.length);
  
  let selectedCount = 0;
  
  for (const row of rows) {
    const isSelected = isRowSelected(row);
    if (isSelected) {
      selectedCount++;
      const subject = getSubjectFromRow(row);
      console.log(`✅ Selected ${selectedCount}:`, subject?.substring(0, 60));
    }
  }
  
  console.log(`📊 Result: ${selectedCount} manually selected emails`);
  console.log('====================');
  
  return selectedCount;
}

// Make it globally available
window.debugSelection = debugSelection;


// IMPROVED: Get complete email text
function getCompleteEmailText(row) {
  try {
    // Method 1: Try to get the full email content if available
    const fullContentEl = row.querySelector('.a3s'); // Gmail's email content area
    if (fullContentEl) {
      return fullContentEl.innerText || fullContentEl.textContent || '';
    }
    
    // Method 2: Get subject + snippet combination
    const subject = getSubjectFromRow(row) || '';
    const snippet = getSnippetFromRow(row) || '';
    
    // Combine and clean the text
    let combined = (subject + " " + snippet).trim();
    
    // Remove invisible characters and clean up
    combined = combined.replace(/[‌‍﻿]/g, '') // Remove zero-width characters
                      .replace(/\s+/g, ' ')   // Normalize whitespace
                      .trim();
    
    // If we have reasonable content, return it
    if (combined.length > 10) {
      return combined.slice(0, 5000); // Increased limit for full content
    }
    
    // Method 3: Fallback to any available text in the row
    return row.innerText?.slice(0, 5000) || 'No content available';
    
  } catch (e) {
    console.error('Error extracting email text:', e);
    return 'Error extracting content';
  }
}

// CONTINUOUS LABEL RESTORATION - FIXES DISAPPEARING LABELS
function startLabelRestoration() {
  // Restore labels every 2 seconds to catch any DOM changes
  setInterval(() => {
    const rows = getEmailRows();
    let restoredCount = 0;
    
    for (const row of rows) {
      const key = getRowKey(row);
      const existing = classificationCache.get(key);
      
      if (existing) {
        const pill = ensurePill(row);
        if (pill) {
          // Only update if the pill doesn't have the correct label
          const currentPillText = pill.textContent;
          const expectedText = existing.label === "phishing" ? "🚨 Phish" : "✅ Safe";
          
          if (currentPillText !== expectedText) {
            stylePill(pill, existing);
            restoredCount++;
          }
        }
      }
    }
    
    if (restoredCount > 0) {
      console.log(`🔹 Restored ${restoredCount} labels for dynamic content`);
    }
  }, 2000);
}

// ENHANCED MESSAGE LISTENER
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('📨 Message received in content script:', msg.type);
  
  if (msg.type === "GET_SELECTION") {
    console.log('📨 Popup requested selection');
    updateSelection(); // Force update before responding
    
    sendResponse({ 
      selection: currentSelection, 
      version: EXT_VERSION,
      totalEmails: currentSelection.length,
      timestamp: new Date().toISOString()
    });
    return true;
  }
  
  if (msg.type === "FORCE_REFRESH") {
    console.log('🔄 Popup requested refresh');
    loadLabelsFromStorage();
    labelInboxRows();
    updateSelection();
    sendResponse({ success: true, selection: currentSelection });
    return true;
  }
  
  if (msg.type === "FEEDBACK_BATCH") {
    console.log('📤 Processing batch feedback for', msg.items?.length, 'emails');
    console.log('Verdict:', msg.verdict);
    
    // Send to your backend with proper error handling
    fetch('http://localhost:5000/feedback_batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: msg.items,
        verdict: msg.verdict
      })
    })
    .then(response => {
      console.log('Backend HTTP status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(result => {
      console.log('Backend success:', result);
      sendResponse({ success: true, result });
    })
    .catch(error => {
      console.error('Backend fetch error:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        details: 'Check if backend is running on localhost:5000'
      });
    });
    
    return true; // Keep message channel open
  }
  
  return false;
});

// TEMPORARY: Debug selection detection
function debugSelection() {
  const rows = getEmailRows();
  console.log('=== SELECTION DEBUG ===');
  console.log('Total rows found:', rows.length);
  
  let manuallySelected = 0;
  let autoDetected = 0;
  
  for (const row of rows) {
    const checkbox = row.querySelector('td[role="checkbox"] input[type="checkbox"]');
    const isChecked = checkbox?.checked;
    
    if (isChecked) {
      manuallySelected++;
      console.log('✅ Manually selected:', getSubjectFromRow(row)?.substring(0, 50));
    }
  }
  
  console.log('Manually selected count:', manuallySelected);
  console.log('====================');
}

// Call this when popup opens or selection changes
window.debugSelection = debugSelection;


// Add this function to test if extension is working
function testExtension() {
  console.log('🧪 EXTENSION TEST: Extension is running');
  const rows = getEmailRows();
  console.log(`🧪 Found ${rows.length} email rows`);
  
  if (rows.length > 0) {
    const firstRow = rows[0];
    const subject = getSubjectFromRow(firstRow);
    const sender = getSenderFromRow(firstRow);
    console.log('🧪 First email:', { subject, sender });
  }
}

// Manual refresh function
window.forceRefreshFlagit = function() {
  console.log('🔄 Manually refreshing Flagit...');
  loadLabelsFromStorage();
  labelInboxRows();
  updateSelection();
};

// Run test every 30 seconds
setInterval(testExtension, 30000);
testExtension(); // Run immediately

const debouncedScan = debounce(() => {
  labelInboxRows();
  updateSelection();
  attachCheckboxListeners();
}, DEBOUNCE_MS);

// OPTIMIZED MUTATION OBSERVER - SINGLE INSTANCE
const observer = new MutationObserver((mutations) => {
  let needsLabelRestore = false;
  let needsNewClassification = false;

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.('tr.zA, div[role="main"] tr, [data-legacy-thread-id]') ||
              node.querySelector?.('tr.zA, div[role="main"] tr, [data-legacy-thread-id]')) {
            needsLabelRestore = true;
            needsNewClassification = true;
          }
        }
      }
    }
    
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      needsLabelRestore = true;
    }
  }

  if (needsLabelRestore) {
    // Immediate label restoration for any DOM changes
    setTimeout(() => {
      const rows = getEmailRows();
      for (const row of rows) {
        const key = getRowKey(row);
        const existing = classificationCache.get(key);
        if (existing) {
          const pill = ensurePill(row);
          if (pill) stylePill(pill, existing);
        }
      }
    }, 50);
  }

  if (needsNewClassification) {
    console.log('🔄 Mutation detected - scanning for new emails');
    debouncedScan();
  }
});

// Observe more aggressively
observer.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'role']
});

function attachCheckboxListeners() {
  const boxes = document.querySelectorAll('td[role="checkbox"] input[type="checkbox"]');

  for (const box of boxes) {
    if (box.dataset.flagitBound === "1") continue;

    box.dataset.flagitBound = "1";
    box.addEventListener("change", () => {
      updateSelection();
    });
  }
}

// Initialize
setTimeout(initializeFlagit, 1000);

// Debug function
window.debugFlagitUserDetection = function() {
  console.log('=== FLAGIT USER DETECTION DEBUG ===');
  console.log('Current session:', currentUserSession);
  console.log('Stored session:', localStorage.getItem('flagit_user_session'));
  console.log('User mapping:', localStorage.getItem('flagit_user_mapping'));
  console.log('Detected user:', getGmailUser());
  console.log('=== END DEBUG ===');
};