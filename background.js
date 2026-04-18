// Service worker for Locab Chrome Extension
// Handles context menu, API calls, and storage operations

// Default settings
const DEFAULT_SETTINGS = {
  uiMode: 'tab', // 'tab' or 'popup'
  autoTranslation: true,
  translationAPI: 'mymemory', // 'mymemory', 'libre', 'tencent', 'youdao', 'baidu', 'custom'
  apiKey: '', // API密钥
  customApiUrl: '', // 自定义API URL
  storageLocation: 'local', // 'local' or 'sync'
  lastModified: Date.now()
};

// Get storage API based on settings
async function getStorageAPI() {
  const data = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  const settings = data.settings || DEFAULT_SETTINGS;
  return settings.storageLocation === 'sync' ? chrome.storage.sync : chrome.storage.local;
}

// Create context menu and initialize settings on extension installation
chrome.runtime.onInstalled.addListener(async () => {
  // Create context menu
  chrome.contextMenus.create({
    id: "mark-vocab",
    title: "使用Locab查询",
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
      // Step 1: Get translation
      console.log("Fetching translation for:", selectedText);
      const translation = await fetchTranslation(selectedText);
      console.log("Translation result:", translation);

      // Step 2: Send translation to content script for confirmation
      console.log("Sending translation confirmation to content script, tab ID:", tab.id);
      const confirmation = await sendMessageToContentScript(tab.id, {
        action: "showTranslationConfirmation",
        word: selectedText,
        translation: translation
      });
      console.log("Content script confirmation response:", confirmation);

      if (confirmation && confirmation.confirmed) {
        // User confirmed, get context and save
        console.log("User confirmed, getting word context");
        const response = await sendMessageToContentScript(tab.id, {
          action: "getWordContext",
          word: selectedText,
          translation: translation
        });
        console.log("Content script context response:", response);

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
      } else {
        // User cancelled
        console.log("User cancelled word marking");
        showNotification("已取消标记");
      }
    } catch (error) {
      console.error("Error marking vocabulary:", error);
      showNotification("标记单词时出错");
    }
  }
});

// Fetch translation based on settings
async function fetchTranslation(word) {
  console.log("Attempting to translate word:", word);

  // Get settings
  const data = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  const settings = data.settings || DEFAULT_SETTINGS;
  const api = settings.translationAPI || 'mymemory';
  const apiKey = settings.apiKey || '';
  const customUrl = settings.customApiUrl || '';

  try {
    const translations = new Set();

    // Function to add translation to set
    const addTranslation = (translation) => {
      if (translation && translation.trim() !== word) {
        const trimmed = translation.trim();
        // Split by Chinese or English semicolon
        const parts = trimmed.split(/[；;]/).map(part => part.trim()).filter(part => part);
        parts.forEach(part => translations.add(part));
      }
    };

    // Try configured API first
    let primaryTranslation;
    switch (api) {
      case 'mymemory':
        primaryTranslation = await fetchMyMemoryTranslation(word);
        break;
      case 'libre':
        primaryTranslation = await fetchLibreTranslation(word);
        break;
      case 'tencent':
        primaryTranslation = await fetchTencentTranslation(word, apiKey);
        break;
      case 'youdao':
        primaryTranslation = await fetchYoudaoTranslation(word, apiKey);
        break;
      case 'baidu':
        primaryTranslation = await fetchBaiduTranslation(word, apiKey);
        break;
      case 'custom':
        primaryTranslation = await fetchCustomTranslation(word, customUrl, apiKey);
        break;
      default:
        primaryTranslation = await fetchMyMemoryTranslation(word);
    }
    addTranslation(primaryTranslation);

    // Try secondary APIs to get more translations
    // Try LibreTranslate if not already used
    if (api !== 'libre') {
      try {
        const libreTranslation = await fetchLibreTranslation(word);
        addTranslation(libreTranslation);
      } catch (libreError) {
        console.log("LibreTranslate secondary attempt failed:", libreError);
      }
    }

    // Try MyMemory if not already used
    if (api !== 'mymemory') {
      try {
        const mymemoryTranslation = await fetchMyMemoryTranslation(word);
        addTranslation(mymemoryTranslation);
      } catch (mymemoryError) {
        console.log("MyMemory secondary attempt failed:", mymemoryError);
      }
    }

    if (translations.size > 0) {
      // Join with Chinese semicolon
      const finalTranslation = Array.from(translations).join('；');
      console.log("Returning multiple translations:", finalTranslation);
      return finalTranslation;
    } else {
      console.log("No translations found");
      return `[无翻译结果: ${word}]`;
    }
  } catch (error) {
    console.warn("Translation API failed:", error);

    // Try fallback API if the main one fails
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

// MyMemory translation
async function fetchMyMemoryTranslation(word) {
  const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh`;
  const response = await fetchWithTimeout(apiUrl);
  const data = await response.json();
  return data.responseData?.translatedText;
}

// Dictionary API translation - returns multiple meanings
async function fetchDictionaryTranslation(word) {
  try {
    const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const response = await fetchWithTimeout(apiUrl, {}, 8000);
    if (!response.ok) {
      throw new Error(`Dictionary API response: ${response.status}`);
    }
    const data = await response.json();

    // Extract all meanings and definitions
    const meanings = [];
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (entry.meanings && Array.isArray(entry.meanings)) {
          for (const meaning of entry.meanings) {
            if (meaning.definitions && Array.isArray(meaning.definitions)) {
              for (const definition of meaning.definitions) {
                if (definition.definition) {
                  meanings.push(definition.definition);
                }
              }
            }
          }
        }
      }
    }

    // Limit to first 5 meanings to avoid too long translation
    const uniqueMeanings = [...new Set(meanings)].slice(0, 5);

    if (uniqueMeanings.length > 0) {
      // Join with Chinese semicolon
      return uniqueMeanings.join('；');
    }

    return null;
  } catch (error) {
    console.warn("Dictionary API failed:", error);
    return null;
  }
}

// LibreTranslate translation
async function fetchLibreTranslation(word) {
  const apiUrl = `https://libretranslate.com/translate`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: word,
      source: 'en',
      target: 'zh',
      format: 'text',
      api_key: ''
    })
  });
  if (!response.ok) throw new Error(`LibreTranslate API response: ${response.status}`);
  const data = await response.json();
  return data.translatedText;
}

// Tencent translation (placeholder - needs implementation)
async function fetchTencentTranslation(word, apiKey) {
  if (!apiKey) throw new Error('腾讯翻译API需要API密钥');
  // TODO: Implement Tencent API
  throw new Error('腾讯翻译API尚未实现');
}

// Youdao translation (placeholder - needs implementation)
async function fetchYoudaoTranslation(word, apiKey) {
  if (!apiKey) throw new Error('有道翻译API需要API密钥');
  // TODO: Implement Youdao API
  throw new Error('有道翻译API尚未实现');
}

// Baidu translation (placeholder - needs implementation)
async function fetchBaiduTranslation(word, apiKey) {
  if (!apiKey) throw new Error('百度翻译API需要API密钥');
  // TODO: Implement Baidu API
  throw new Error('百度翻译API尚未实现');
}

// Custom translation API
async function fetchCustomTranslation(word, customUrl, apiKey) {
  if (!customUrl) throw new Error('自定义API URL未设置');
  // Simple POST request with JSON body
  const response = await fetch(customUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: word,
      source: 'en',
      target: 'zh',
      apiKey: apiKey || undefined
    })
  });
  if (!response.ok) throw new Error(`Custom API response: ${response.status}`);
  const data = await response.json();
  // Try to extract translation from common response formats
  return data.translation || data.text || data.result || data.data || '';
}

// Helper function for fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fallback translation (kept for compatibility)
async function tryFallbackTranslation(word) {
  return await fetchLibreTranslation(word);
}

// Prompt user for manual translation
function promptForTranslation(word) {
  // In service worker we can't show UI directly, so we'll use a simple fallback
  // In a real implementation, we might use chrome.scripting.executeScript to show a prompt
  // For simplicity, return a placeholder and let content script handle it
  return `[请手动输入翻译: ${word}]`;
}

// Generate unique ID for vocabulary record
function generateId(...args) {
  const hash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  };

  const combined = args.join('');
  return `${Date.now()}_${hash(combined)}`;
}

// Save vocabulary record to storage with support for multiple locations per word
async function saveVocabularyRecord(record) {
  console.log('saveVocabularyRecord called with record:', record);
  try {
    const storage = await getStorageAPI();
    const data = await storage.get({ vocabulary: [] });
    const vocabulary = data.vocabulary;
    console.log('Existing vocabulary count:', vocabulary.length);

    const wordKey = record.word.toLowerCase();

    // Check for exact duplicate (same word ignoring case, same sentence, same URL, same offset)
    const isExactDuplicate = vocabulary.some(item => {
      // For backward compatibility: check both old format and new format
      if (item.word.toLowerCase() === record.word.toLowerCase() &&
          item.sentence === record.sentence &&
          item.url === record.url) {
        // If both have offset, compare offsets; else treat as duplicate
        if (item.offset !== undefined && record.offset !== undefined) {
          return item.offset === record.offset;
        }
        return true;
      }
      return false;
    });

    if (isExactDuplicate) {
      console.log("Exact duplicate record skipped:", record.word);
      return;
    }

    // Find existing word entry (case-insensitive)
    const existingIndex = vocabulary.findIndex(item =>
      item.word.toLowerCase() === wordKey ||
      (item.wordLower && item.wordLower === wordKey)
    );

    if (existingIndex !== -1) {
      // Add new location to existing word entry
      const existing = vocabulary[existingIndex];

      // Ensure locations array exists
      if (!existing.locations) {
        // Convert old format to new format with locations array
        existing.locations = [{
          id: generateId(record.word + record.sentence + record.url + record.offset),
          sentence: existing.sentence,
          url: existing.url,
          line: existing.line,
          wordIndex: existing.wordIndex,
          xpath: existing.xpath,
          offset: existing.offset,
          timestamp: existing.timestamp,
          originalWord: existing.word
        }];
      }

      // Add new location
      existing.locations.push({
        id: generateId(record.word + record.sentence + record.url + record.offset),
        sentence: record.sentence,
        url: record.url,
        line: record.line,
        wordIndex: record.wordIndex,
        xpath: record.xpath,
        offset: record.offset,
        timestamp: record.timestamp,
        originalWord: record.word
      });

      // Update timestamp to latest
      existing.timestamp = Math.max(existing.timestamp || 0, record.timestamp);

      // Add translation to translations array if not already present
      if (!existing.translations) {
        // Split existing translation if it contains multiple translations
        const existingTranslations = existing.translation ?
          existing.translation.split(/[；;]/).map(t => t.trim()).filter(t => t) : [];
        existing.translations = existingTranslations;
      }

      if (record.translation) {
        // Split new translation into individual translations
        const newTranslations = record.translation.split(/[；;]/).map(t => t.trim()).filter(t => t);
        for (const newTrans of newTranslations) {
          if (!existing.translations.includes(newTrans)) {
            existing.translations.push(newTrans);
          }
        }
        // Update main translation field with first translation (for backward compatibility)
        if (existing.translations.length > 0 && !existing.translation) {
          existing.translation = existing.translations[0];
        }
      }

      // Ensure wordLower field exists for faster lookup
      existing.wordLower = wordKey;

      console.log("Added new location to existing word:", record.word);
    } else {
      // Create new word entry with first location
      // Split translation into individual translations
      const allTranslations = record.translation ?
        record.translation.split(/[；;]/).map(t => t.trim()).filter(t => t) : [];
      const firstTranslation = allTranslations.length > 0 ? allTranslations[0] : '';

      const wordEntry = {
        id: generateId(wordKey),
        word: record.word, // Keep original case for display
        wordLower: wordKey,
        translation: firstTranslation, // First translation (for backward compatibility)
        translations: allTranslations,
        sentence: record.sentence, // First location sentence (for backward compatibility)
        url: record.url, // First location URL
        line: record.line,
        wordIndex: record.wordIndex,
        xpath: record.xpath,
        offset: record.offset,
        timestamp: record.timestamp,
        locations: [{
          id: generateId(record.word + record.sentence + record.url + record.offset),
          sentence: record.sentence,
          url: record.url,
          line: record.line,
          wordIndex: record.wordIndex,
          xpath: record.xpath,
          offset: record.offset,
          timestamp: record.timestamp,
          originalWord: record.word
        }],
        // Review fields
        reviewCount: 0,
        easeFactor: 2.5,
        interval: 0,
        lastReviewed: null,
        nextReviewDue: null,
        status: 'new'
      };

      vocabulary.push(wordEntry);
      console.log("Created new word entry:", record.word);
    }

    await storage.set({ vocabulary });
    console.log("Vocabulary saved to", storage === chrome.storage.sync ? 'sync' : 'local');
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
      (async () => {
        try {
          const storage = await getStorageAPI();
          const data = await storage.get({ vocabulary: [] });
          const vocabulary = data.vocabulary;

          // Flatten the vocabulary: if entry has locations, create one record per location
          const flattenedVocabulary = [];
          for (const entry of vocabulary) {
            if (entry.locations && Array.isArray(entry.locations) && entry.locations.length > 0) {
              // New format with locations array
              for (const location of entry.locations) {
                flattenedVocabulary.push({
                  id: location.id || entry.id + '_' + entry.locations.indexOf(location),
                  word: location.originalWord || entry.word,
                  translation: entry.translation || (entry.translations && entry.translations[0]) || '',
                  translations: entry.translations || [],
                  sentence: location.sentence,
                  url: location.url,
                  line: location.line,
                  wordIndex: location.wordIndex,
                  xpath: location.xpath,
                  offset: location.offset,
                  timestamp: location.timestamp,
                  // Review fields from parent entry
                  reviewCount: entry.reviewCount || 0,
                  easeFactor: entry.easeFactor || 2.5,
                  interval: entry.interval || 0,
                  lastReviewed: entry.lastReviewed,
                  nextReviewDue: entry.nextReviewDue,
                  status: entry.status || 'new',
                  // Parent reference
                  wordId: entry.id,
                  wordLower: entry.wordLower || entry.word.toLowerCase()
                });
              }
            } else {
              // Old format, use as-is
              flattenedVocabulary.push({
                ...entry,
                translations: entry.translations || (entry.translation ? [entry.translation] : []),
                wordLower: entry.wordLower || entry.word.toLowerCase(),
                wordId: entry.id
              });
            }
          }

          // Sort by timestamp descending (newest first)
          const sortedVocabulary = flattenedVocabulary.sort((a, b) => b.timestamp - a.timestamp);
          sendResponse(sortedVocabulary);
        } catch (error) {
          console.error("Error getting vocabulary:", error);
          sendResponse([]);
        }
      })();
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

    case "updateReviewStatus":
      updateReviewStatus(request.id, request.status).then(updatedRecord => {
        sendResponse({ success: true, record: updatedRecord });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
  }
});

// Delete a vocabulary record by ID
async function deleteVocabulary(id) {
  const storage = await getStorageAPI();
  const data = await storage.get({ vocabulary: [] });
  let vocabulary = data.vocabulary;

  // Check if id is a location id (contains '_loc_' pattern) or word id
  // Location ids are generated as: generateId(word + sentence + url + offset)
  // Word ids are generated as: generateId(wordKey)

  // First try to find and remove location from word entry
  let locationRemoved = false;
  vocabulary = vocabulary.map(wordEntry => {
    if (wordEntry.locations && Array.isArray(wordEntry.locations)) {
      const originalLength = wordEntry.locations.length;
      wordEntry.locations = wordEntry.locations.filter(location => {
        // Check if this location matches the id
        if (location.id === id) {
          locationRemoved = true;
          return false;
        }
        return true;
      });

      // If all locations removed, mark word entry for deletion
      if (wordEntry.locations.length === 0) {
        return null; // Mark for deletion
      }

      // Update main fields to match first location if locations changed
      if (wordEntry.locations.length > 0 && originalLength !== wordEntry.locations.length) {
        const firstLocation = wordEntry.locations[0];
        wordEntry.sentence = firstLocation.sentence;
        wordEntry.url = firstLocation.url;
        wordEntry.line = firstLocation.line;
        wordEntry.wordIndex = firstLocation.wordIndex;
        wordEntry.xpath = firstLocation.xpath;
        wordEntry.offset = firstLocation.offset;
        wordEntry.timestamp = firstLocation.timestamp;
        wordEntry.word = firstLocation.originalWord || wordEntry.word;
      }
    }
    return wordEntry;
  }).filter(entry => entry !== null); // Remove entries marked for deletion

  // If location not found in locations array, try to remove entire word entry
  if (!locationRemoved) {
    vocabulary = vocabulary.filter(item => item.id !== id);
  }

  await storage.set({ vocabulary });
}

// Clear all vocabulary records
async function clearAllVocabulary() {
  const storage = await getStorageAPI();
  await storage.set({ vocabulary: [] });
}

// Update review status for a vocabulary record
async function updateReviewStatus(id, status) {
  // status: 'know' or 'dontKnow'
  console.log('updateReviewStatus called:', { id, status });
  try {
    const storage = await getStorageAPI();
    const data = await storage.get({ vocabulary: [] });
    const vocabulary = data.vocabulary;

    // Find the word entry that contains this location id
    let recordIndex = -1;
    let record = null;

    for (let i = 0; i < vocabulary.length; i++) {
      const entry = vocabulary[i];
      // Check if this is the word entry itself
      if (entry.id === id) {
        recordIndex = i;
        record = entry;
        break;
      }
      // Check if this entry contains the location
      if (entry.locations && Array.isArray(entry.locations)) {
        const locationIndex = entry.locations.findIndex(loc => loc.id === id);
        if (locationIndex !== -1) {
          recordIndex = i;
          record = entry;
          break;
        }
      }
    }

    if (recordIndex === -1 || !record) {
      throw new Error('Record not found');
    }

    const now = Date.now();

    // Initialize review fields if they don't exist (for backward compatibility)
    const reviewCount = record.reviewCount || 0;
    const easeFactor = record.easeFactor || 2.5;
    const interval = record.interval || 0;

    // Simplified SM-2 algorithm
    let newInterval;
    let newEaseFactor = easeFactor;

    if (status === 'know') {
      // Correct answer
      if (reviewCount === 0) {
        newInterval = 1; // First review: next day
      } else if (reviewCount === 1) {
        newInterval = 6; // Second review: 6 days
      } else {
        newInterval = Math.round(interval * easeFactor);
      }
      // Increase ease factor slightly (max 5.0)
      newEaseFactor = Math.min(easeFactor + 0.1, 5.0);
    } else {
      // 'dontKnow' - incorrect answer
      newInterval = 0; // Review again today
      // Decrease ease factor (min 1.3)
      newEaseFactor = Math.max(easeFactor - 0.2, 1.3);
    }

    // Update record
    const updatedRecord = {
      ...record,
      reviewCount: reviewCount + 1,
      easeFactor: newEaseFactor,
      interval: newInterval,
      lastReviewed: now,
      nextReviewDue: now + (newInterval * 24 * 60 * 60 * 1000), // Convert days to milliseconds
      status: 'review'
    };

    vocabulary[recordIndex] = updatedRecord;
    await storage.set({ vocabulary });

    return updatedRecord;
  } catch (error) {
    console.error('Error updating review status:', error);
    throw error;
  }
}

// Export vocabulary as JSONL
async function exportVocabulary() {
  const storage = await getStorageAPI();
  const data = await storage.get({ vocabulary: [] });
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