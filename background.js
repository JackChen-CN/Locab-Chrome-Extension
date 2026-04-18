// Service worker for Locab Chrome Extension
// Handles context menu, API calls, and storage operations

// Default settings
const DEFAULT_SETTINGS = {
  uiMode: 'tab', // 'tab' or 'popup'
  autoTranslation: true,
  translationAPI: 'mymemory', // 'mymemory' or 'libre'
  lastModified: Date.now()
};

// Create context menu and initialize settings on extension installation
chrome.runtime.onInstalled.addListener(async () => {
  // Create context menu
  chrome.contextMenus.create({
    id: "mark-vocab",
    title: "标记生词",
    contexts: ["selection"]
  });

  // Initialize settings if they don't exist
  const data = await chrome.storage.local.get({ settings: null });
  if (data.settings === null) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    console.log("Default settings initialized");
  }

  // Update extension action based on saved settings
  const settings = data.settings || DEFAULT_SETTINGS;
  await updateExtensionAction(settings.uiMode);

  console.log("Locab extension installed and context menu created.");
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mark-vocab") {
    console.log("Context menu clicked, marking vocab:", info.selectionText);
    const selectedText = info.selectionText?.trim();

    // Validate selection: must be a single word without spaces
    if (!selectedText || selectedText.includes(' ')) {
      console.log("Invalid selection - empty or contains spaces");
      showNotification("请只选择一个单词（不含空格）");
      return;
    }

    try {
      // Get translation via MyMemory API
      console.log("Fetching translation for:", selectedText);
      const translation = await fetchTranslation(selectedText);
      console.log("Translation result:", translation);

      // Send message to content script to get context info
      console.log("Sending message to content script, tab ID:", tab.id);
      const response = await sendMessageToContentScript(tab.id, {
        action: "getWordContext",
        word: selectedText,
        translation: translation
      });
      console.log("Content script response:", response);

      if (response && response.success) {
        console.log("Content script returned success, saving record");
        // Save to storage
        await saveVocabularyRecord({
          id: generateId(selectedText, response.sentence, tab.url),
          word: selectedText,
          translation: translation,
          sentence: response.sentence,
          url: tab.url,
          line: response.line,
          wordIndex: response.wordIndex,
          timestamp: Date.now(),
          xpath: response.xpath,
          offset: response.offset
        });

        console.log("Vocabulary saved successfully");
        showNotification(`已标记单词: ${selectedText}`);
      } else {
        console.log("Content script returned failure or no response");
        showNotification("获取单词上下文失败，请重试");
      }
    } catch (error) {
      console.error("Error marking vocabulary:", error);
      showNotification("标记单词时出错");
    }
  }
});

// Fetch translation from MyMemory API
async function fetchTranslation(word) {
  console.log("Attempting to translate word:", word);
  const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh`;

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased timeout to 10s

  try {
    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Translation API HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`API response: ${response.status}`);
    }

    const data = await response.json();
    console.log("Translation API response data:", data);
    const translation = data.responseData?.translatedText;
    console.log("Extracted translation:", translation);

    if (translation && translation.trim() !== word) {
      const trimmed = translation.trim();
      console.log("Returning translation:", trimmed);
      return trimmed;
    } else {
      console.log("Translation empty or same as original word");
      // Return a placeholder indicating no translation found
      return `[无翻译结果: ${word}]`;
    }
  } catch (error) {
    console.warn("Translation API failed:", error);
    clearTimeout(timeoutId);

    // Try a fallback API if the main one fails
    console.log("Trying fallback translation API...");
    try {
      const fallbackTranslation = await tryFallbackTranslation(word);
      if (fallbackTranslation) {
        return fallbackTranslation;
      }
    } catch (fallbackError) {
      console.warn("Fallback translation also failed:", fallbackError);
    }
  }

  // Final fallback: return placeholder
  console.log("All translation attempts failed, returning placeholder");
  return `[翻译获取失败，请手动输入: ${word}]`;
}

// Try fallback translation API (LibreTranslate)
async function tryFallbackTranslation(word) {
  // LibreTranslate public instance (may be rate limited)
  const apiUrl = `https://libretranslate.com/translate`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: word,
      source: 'en',
      target: 'zh',
      format: 'text',
      api_key: '' // Public instance doesn't require key
    })
  });

  if (!response.ok) {
    throw new Error(`Fallback API response: ${response.status}`);
  }

  const data = await response.json();
  return data.translatedText;
}

// Prompt user for manual translation
function promptForTranslation(word) {
  // In service worker we can't show UI directly, so we'll use a simple fallback
  // In a real implementation, we might use chrome.scripting.executeScript to show a prompt
  // For simplicity, return a placeholder and let content script handle it
  return `[请手动输入翻译: ${word}]`;
}

// Generate unique ID for vocabulary record
function generateId(word, sentence, url) {
  const hash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  };

  return `${Date.now()}_${hash(word + sentence + url)}`;
}

// Save vocabulary record to chrome.storage.local
async function saveVocabularyRecord(record) {
  try {
    const data = await chrome.storage.local.get({ vocabulary: [] });
    const vocabulary = data.vocabulary;

    // Check for duplicates (same word, same sentence, same URL)
    const isDuplicate = vocabulary.some(item =>
      item.word === record.word &&
      item.sentence === record.sentence &&
      item.url === record.url
    );

    if (!isDuplicate) {
      vocabulary.push(record);
      await chrome.storage.local.set({ vocabulary });
      console.log("Vocabulary saved:", record.word);
    } else {
      console.log("Duplicate record skipped:", record.word);
    }
  } catch (error) {
    console.error("Error saving vocabulary:", error);
    throw error;
  }
}

// Show notification to user
function showNotification(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "showToast",
        message: message
      }).catch(() => {
        // Content script might not be ready, ignore error
      });
    }
  });
}

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "getAllVocabulary":
      chrome.storage.local.get({ vocabulary: [] }, (data) => {
        sendResponse(data.vocabulary);
      });
      return true; // Keep channel open for async response

    case "deleteVocabulary":
      deleteVocabulary(request.id).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case "clearAllVocabulary":
      clearAllVocabulary().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case "exportVocabulary":
      exportVocabulary().then(data => {
        sendResponse(data);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case "locateWord":
      locateWord(request.record).then(success => {
        sendResponse({ success });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
  }
});

// Delete a vocabulary record by ID
async function deleteVocabulary(id) {
  const data = await chrome.storage.local.get({ vocabulary: [] });
  const vocabulary = data.vocabulary.filter(item => item.id !== id);
  await chrome.storage.local.set({ vocabulary });
}

// Clear all vocabulary records
async function clearAllVocabulary() {
  await chrome.storage.local.set({ vocabulary: [] });
}

// Export vocabulary as JSONL
async function exportVocabulary() {
  const data = await chrome.storage.local.get({ vocabulary: [] });
  const vocabulary = data.vocabulary.sort((a, b) => a.timestamp - b.timestamp);

  // Convert to JSONL format
  const jsonl = vocabulary.map(record => JSON.stringify(record)).join('\n');

  // Create filename with current date
  const now = new Date();
  const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const filename = `vocab_export_${dateStr}.txt`;

  return { jsonl, filename };
}

// Locate word in page (open new tab if needed)
async function locateWord(record) {
  try {
    // Get current active tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Normalize URLs (ignore anchor fragments)
    const normalizeUrl = (url) => url.split('#')[0];
    const currentUrl = normalizeUrl(currentTab.url);
    const recordUrl = normalizeUrl(record.url);

    if (currentUrl === recordUrl) {
      // Same page: send locate command to content script
      await chrome.tabs.sendMessage(currentTab.id, {
        action: "locateWordInPage",
        record: record
      });
      return true;
    } else {
      // Different page: ask user for confirmation
      // In service worker we can't show UI, so we'll always open new tab
      // In a real implementation, we would use chrome.scripting.executeScript
      const newTab = await chrome.tabs.create({ url: record.url, active: true });

      // Wait for page to load, then send locate command
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id, {
              action: "locateWordInPage",
              record: record
            }).catch(error => {
              console.error("Failed to send locate message:", error);
            });
          }, 1000); // Wait a bit for page to fully render
        }
      });

      return true;
    }
  } catch (error) {
    console.error("Error locating word:", error);
    return false;
  }
}

// Helper function to send message to content script with retry
async function sendMessageToContentScript(tabId, message, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Sending message to content script (attempt ${attempt}/${maxRetries})`, message);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log(`Message sent successfully on attempt ${attempt}`);
      return response;
    } catch (error) {
      console.warn(`Failed to send message on attempt ${attempt}:`, error);

      if (attempt === maxRetries) {
        throw error; // Re-throw on final attempt
      }

      // Try to inject content script if not present
      try {
        console.log("Attempting to inject content script...");
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        console.log("Content script injected, waiting a bit...");
        // Wait a moment for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (injectError) {
        console.warn("Failed to inject content script:", injectError);
        // Continue to next retry anyway
      }
    }
  }
}

// Handle extension icon click (only triggers when popup is not set)
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked - opening in tab mode");

  try {
    // This should only happen in tab mode, but double-check settings
    const data = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
    const settings = data.settings || DEFAULT_SETTINGS;
    const uiMode = settings.uiMode || DEFAULT_SETTINGS.uiMode;

    if (uiMode === 'popup') {
      console.warn("Popup mode but onClicked triggered - popup may not be set correctly");
      // Try to enable popup and open it
      await updateExtensionAction('popup');
      return;
    }

    // Tab mode: open new tab with the vocabulary manager
    console.log("Opening vocabulary manager in new tab");
    await chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html'),
      active: true
    });
  } catch (error) {
    console.error("Error handling extension icon click:", error);
  }
});

// Update extension action (popup or no popup) based on UI mode
async function updateExtensionAction(uiMode) {
  try {
    if (uiMode === 'popup') {
      // Enable popup
      await chrome.action.setPopup({ popup: 'popup.html' });
      console.log("Popup enabled in manifest action");
    } else {
      // Disable popup (will be handled by onClicked)
      await chrome.action.setPopup({ popup: '' });
      console.log("Popup disabled, will open in tab on click");
    }
  } catch (error) {
    console.error("Error updating extension action:", error);
  }
}