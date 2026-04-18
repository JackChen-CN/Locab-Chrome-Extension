// Service worker for Locab Chrome Extension
// Handles context menu, API calls, and storage operations

// Create context menu on extension installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mark-vocab",
    title: "标记生词",
    contexts: ["selection"]
  });
  console.log("Locab extension installed and context menu created.");
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "mark-vocab") {
    const selectedText = info.selectionText?.trim();

    // Validate selection: must be a single word without spaces
    if (!selectedText || selectedText.includes(' ')) {
      showNotification("请只选择一个单词（不含空格）");
      return;
    }

    try {
      // Get translation via MyMemory API
      const translation = await fetchTranslation(selectedText);

      // Send message to content script to get context info
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getWordContext",
        word: selectedText,
        translation: translation
      });

      if (response && response.success) {
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

        showNotification(`已标记单词: ${selectedText}`);
      } else {
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
  const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh`;

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`API response: ${response.status}`);

    const data = await response.json();
    const translation = data.responseData?.translatedText;

    if (translation && translation.trim() !== word) {
      return translation.trim();
    }
  } catch (error) {
    console.warn("Translation API failed:", error);
    clearTimeout(timeoutId);
  }

  // Fallback: return placeholder, content script will prompt user
  return `[翻译获取失败，请手动输入]`;
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