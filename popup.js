// Popup script for Locab Chrome Extension
// Handles UI interactions for the popup window

// Global state
let vocabulary = [];
let filteredVocabulary = [];
let currentTab = 'list';
let currentCardIndex = 0;
let reviewVocabulary = [];
let selectedWordId = null;
let groupingEnabled = false; // 分组显示开关

// DOM elements
let searchInput, clearSearchBtn, clearAllBtn, settingsBtn;
let vocabularyList, wordCountEl, lastUpdatedEl;
let prevCardBtn, nextCardBtn, knowBtn, dontKnowBtn, locateCardBtn;
let cardWordEl, cardTranslationEl, cardSentenceEl, cardLineEl, cardWordIndexEl, cardSourceEl;
let cardCounterEl, progressFillEl;
// New elements for two-column layout
let detailEmptyEl, detailLoadedEl, detailWordEl, detailTranslationEl, detailSentenceEl;
let detailUrlEl, detailTimeEl, detailPositionEl, detailLocateBtn, detailDeleteBtn;
let statTotalEl, statTodayEl, statStorageEl, statPendingEl;
let quickReviewBtn, quickExportBtn, quickSettingsBtn;
let toggleGroupingBtn;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  searchInput = document.getElementById('search-input');
  clearSearchBtn = document.getElementById('clear-search');
  clearAllBtn = document.getElementById('clear-all-btn');
  settingsBtn = document.getElementById('settings-btn');
  vocabularyList = document.getElementById('vocabulary-list');
  wordCountEl = document.getElementById('word-count');
  lastUpdatedEl = document.getElementById('last-updated');

  // Review tab elements
  prevCardBtn = document.getElementById('prev-card');
  nextCardBtn = document.getElementById('next-card');
  knowBtn = document.getElementById('know-btn');
  dontKnowBtn = document.getElementById('dont-know-btn');
  locateCardBtn = document.getElementById('locate-card-btn');
  cardWordEl = document.getElementById('card-word');
  cardTranslationEl = document.getElementById('card-translation');
  cardSentenceEl = document.getElementById('card-sentence');
  cardLineEl = document.getElementById('card-line');
  cardWordIndexEl = document.getElementById('card-word-index');
  cardSourceEl = document.getElementById('card-source');
  cardCounterEl = document.getElementById('card-counter');
  progressFillEl = document.getElementById('progress-fill');

  // Two-column layout elements
  detailEmptyEl = document.querySelector('.detail-empty');
  detailLoadedEl = document.querySelector('.detail-loaded');
  detailWordEl = document.getElementById('detail-word');
  detailTranslationEl = document.getElementById('detail-translation');
  detailSentenceEl = document.getElementById('detail-sentence');
  detailUrlEl = document.getElementById('detail-url');
  detailTimeEl = document.getElementById('detail-time');
  detailPositionEl = document.getElementById('detail-position');
  detailLocateBtn = document.getElementById('detail-locate-btn');
  detailDeleteBtn = document.getElementById('detail-delete-btn');
  statTotalEl = document.getElementById('stat-total');
  statTodayEl = document.getElementById('stat-today');
  statStorageEl = document.getElementById('stat-storage');
  statPendingEl = document.getElementById('stat-pending');
  quickReviewBtn = document.getElementById('quick-review-btn');
  quickExportBtn = document.getElementById('quick-export-btn');
  quickSettingsBtn = document.getElementById('quick-settings-btn');
  toggleGroupingBtn = document.getElementById('toggle-grouping');

  // Set up event listeners
  setupEventListeners();

  // Load vocabulary data
  loadVocabulary();

  // Listen for storage changes to update vocabulary list
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.vocabulary) {
      console.log('Vocabulary storage changed, updating list');
      loadVocabulary();
    }
  });

  // Update grouping button state
  updateGroupingButton();

  // Set up tab switching
  setupTabs();
}

// Set up event listeners
function setupEventListeners() {
  // Search functionality
  searchInput.addEventListener('input', handleSearch);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    handleSearch();
  });

  // Export functionality

  // Clear all functionality
  clearAllBtn.addEventListener('click', handleClearAll);

  // Settings functionality
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }

  // Grouping toggle functionality
  if (toggleGroupingBtn) {
    toggleGroupingBtn.addEventListener('click', toggleGrouping);
  }

  // Review functionality
  prevCardBtn.addEventListener('click', showPreviousCard);
  nextCardBtn.addEventListener('click', showNextCard);
  knowBtn.addEventListener('click', () => markCardAsKnown('know'));
  dontKnowBtn.addEventListener('click', () => markCardAsKnown('dontKnow'));
  locateCardBtn.addEventListener('click', handleLocateCard);

  // Two-column layout functionality
  if (detailLocateBtn) {
    detailLocateBtn.addEventListener('click', handleDetailLocate);
  }
  if (detailDeleteBtn) {
    detailDeleteBtn.addEventListener('click', handleDetailDelete);
  }
  if (quickReviewBtn) {
    quickReviewBtn.addEventListener('click', () => {
      document.querySelector('[data-tab="review"]').click();
    });
  }
  if (quickExportBtn) {
    quickExportBtn.addEventListener('click', handleExport);
  }
  if (quickSettingsBtn) {
    quickSettingsBtn.addEventListener('click', openSettings);
  }
}

// Toggle grouping display
function toggleGrouping() {
  groupingEnabled = !groupingEnabled;
  updateGroupingButton();
  updateVocabularyList();
}

// Update grouping button state
function updateGroupingButton() {
  if (!toggleGroupingBtn) return;

  const icon = toggleGroupingBtn.querySelector('i');
  const text = toggleGroupingBtn.querySelector('span');

  if (groupingEnabled) {
    icon.className = 'fas fa-object-ungroup';
    text.textContent = '独立';
    toggleGroupingBtn.title = '切换为独立显示';
  } else {
    icon.className = 'fas fa-layer-group';
    text.textContent = '分组';
    toggleGroupingBtn.title = '切换为分组显示';
  }
}

// Set up tab switching
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');

      // Update active button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabId}-tab`) {
          content.classList.add('active');
        }
      });

      currentTab = tabId;

      // Update review vocabulary when switching to review tab
      if (tabId === 'review') {
        updateReviewVocabulary();
      }
    });
  });
}

// Load vocabulary from storage
async function loadVocabulary() {
  console.log("loadVocabulary called");
  try {
    const response = await chrome.runtime.sendMessage({ action: "getAllVocabulary" });
    console.log("Loaded vocabulary from storage:", response?.length || 0, "items");
    vocabulary = response || [];
    filteredVocabulary = [...vocabulary];

    updateVocabularyList();
    updateWordCount();
    updateReviewVocabulary();

    // Restore selected word if it still exists
    if (selectedWordId) {
      const selectedItem = vocabulary.find(item => item.id === selectedWordId);
      if (selectedItem) {
        selectWordItem(selectedItem);
      } else {
        // Clear selection if item no longer exists
        selectedWordId = null;
        if (detailEmptyEl && detailLoadedEl) {
          detailEmptyEl.style.display = 'flex';
          detailLoadedEl.style.display = 'none';
        }
      }
    }
  } catch (error) {
    console.error("Error loading vocabulary:", error);
    showMessage("加载单词列表失败", "error");
  }
}

// Group vocabulary by word (case-insensitive)
function groupVocabularyByWord(vocabulary) {
  const groups = {};
  vocabulary.forEach(item => {
    const wordKey = item.wordLower || item.word.toLowerCase();
    if (!groups[wordKey]) {
      groups[wordKey] = {
        word: item.word,
        wordKey: wordKey,
        translations: item.translations || [],
        items: []
      };
    }
    groups[wordKey].items.push(item);
  });
  return Object.values(groups);
}

// Select the most appropriate translation based on sentence context
function selectTranslationByContext(word, sentence, translations) {
  if (!translations || translations.length <= 1) {
    return translations[0] || '';
  }

  try {
    const nlp = window.nlp || (typeof nlp !== 'undefined' ? nlp : null);
    if (!nlp) {
      console.warn('NLP库不可用，使用第一个翻译');
      return translations[0];
    }

    // Analyze sentence to get part-of-speech of the word
    const doc = nlp(sentence);
    const wordMatch = doc.match(word);

    if (!wordMatch.found) {
      return translations[0];
    }

    // Get part-of-speech tags
    const tags = wordMatch.out('tags');
    const pos = tags.length > 0 ? tags[0].tags : [];

    // Select translation based on part-of-speech
    let selected = translations[0];

    // Simple rules: verb > noun > adjective
    if (pos.some(tag => tag.includes('Verb'))) {
      selected = findTranslationByPos(translations, 'verb') || selected;
    } else if (pos.some(tag => tag.includes('Noun'))) {
      selected = findTranslationByPos(translations, 'noun') || selected;
    } else if (pos.some(tag => tag.includes('Adjective'))) {
      selected = findTranslationByPos(translations, 'adj') || selected;
    }

    return selected;
  } catch (error) {
    console.error('语境分析错误:', error);
    return translations[0];
  }
}

// Helper function: find translation by part-of-speech indicators
function findTranslationByPos(translations, pos) {
  const posIndicators = {
    verb: ['动', 'to ', 'ing', 'ed', 'v.', 'verb'],
    noun: ['名', 'the ', 'a ', 'an ', 'n.', 'noun'],
    adj: ['形', '的', 'able', 'ive', 'adj.', 'adjective']
  };

  const indicators = posIndicators[pos] || [];
  return translations.find(t =>
    indicators.some(indicator =>
      t.toLowerCase().includes(indicator.toLowerCase())
    )
  );
}

// Render a single vocabulary item
function renderVocabularyItem(item, isGrouped = false) {
  const template = document.getElementById('vocab-item-template');
  const clone = template.content.cloneNode(true);
  const vocabItem = clone.querySelector('.vocab-item');

  if (isGrouped) {
    vocabItem.classList.add('grouped-vocab-item');
  }

  // Set data attribute for identification
  vocabItem.dataset.id = item.id;

  // Highlight if selected
  if (selectedWordId === item.id) {
    vocabItem.classList.add('selected');
  }

  // Fill in data
  const wordEl = clone.querySelector('.vocab-word');
  const translationEl = clone.querySelector('.vocab-translation');
  const sentenceEl = clone.querySelector('.vocab-sentence');
  const urlEl = clone.querySelector('.meta-url');
  const timeEl = clone.querySelector('.meta-time');
  const lineEl = clone.querySelector('.meta-line');
  const wordIndexEl = clone.querySelector('.meta-word-index');

  wordEl.textContent = item.word;
  // Use context analysis for each individual item
  const itemTranslation = selectTranslationByContext(item.word, item.sentence, item.translations || []);
  translationEl.textContent = itemTranslation;
  sentenceEl.textContent = truncateText(item.sentence, 100);
  urlEl.textContent = new URL(item.url).hostname;
  timeEl.textContent = formatTime(item.timestamp);
  lineEl.textContent = item.line;
  wordIndexEl.textContent = item.wordIndex;

  // Set up button event listeners
  const locateBtn = clone.querySelector('.locate-btn');
  const deleteBtn = clone.querySelector('.delete-btn');

  locateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleLocateWord(item);
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteWord(item.id);
  });

  // Add click event to select word
  vocabItem.addEventListener('click', () => {
    selectWordItem(item);
  });

  return { element: clone, container: vocabItem };
}

// Render vocabulary without grouping
function renderUngroupedVocabulary() {
  const itemTemplate = document.getElementById('vocab-item-template');

  filteredVocabulary.forEach((item, index) => {
    const { element } = renderVocabularyItem(item, false);
    vocabularyList.appendChild(element);
  });
}

// Render vocabulary with grouping
function renderGroupedVocabulary() {
  const groups = groupVocabularyByWord(filteredVocabulary);
  const groupTemplate = document.getElementById('vocab-group-template');
  const itemTemplate = document.getElementById('vocab-item-template');

  groups.forEach(group => {
    const groupClone = groupTemplate.content.cloneNode(true);
    const groupEl = groupClone.querySelector('.vocab-group');
    const groupHeader = groupClone.querySelector('.vocab-group-header');
    const groupWordEl = groupClone.querySelector('.group-word');
    const groupTranslationEl = groupClone.querySelector('.group-translation');
    const groupCountEl = groupClone.querySelector('.group-count');
    const groupItemsContainer = groupClone.querySelector('.vocab-group-items');

    // Set group header
    groupWordEl.textContent = group.word;
    // Use context analysis to select the most appropriate translation for the group
    const firstItem = group.items[0];
    const groupTranslation = selectTranslationByContext(group.word, firstItem.sentence, group.translations);
    groupTranslationEl.textContent = groupTranslation;
    groupCountEl.textContent = `(${group.items.length}个位置)`;

    // Render each item in the group
    group.items.forEach((item, index) => {
      const { element } = renderVocabularyItem(item, true);
      groupItemsContainer.appendChild(element);
    });

    vocabularyList.appendChild(groupClone);
  });
}

// Update vocabulary list UI
function updateVocabularyList() {
  vocabularyList.innerHTML = '';

  if (filteredVocabulary.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <i class="fas fa-book"></i>
      <p>${vocabulary.length === 0 ? '还没有标记任何单词' : '没有找到匹配的单词'}</p>
      <p class="hint">${vocabulary.length === 0 ? '在网页上选中单词，右键点击"标记生词"开始记录' : '尝试修改搜索关键词'}</p>
    `;
    vocabularyList.appendChild(emptyState);
    return;
  }

  if (groupingEnabled) {
    renderGroupedVocabulary();
  } else {
    renderUngroupedVocabulary();
  }
}


// Handle search
function handleSearch() {
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    filteredVocabulary = [...vocabulary];
  } else {
    filteredVocabulary = vocabulary.filter(item =>
      item.word.toLowerCase().includes(query)
    );
  }

  updateVocabularyList();

  // Update review vocabulary if on review tab
  if (currentTab === 'review') {
    updateReviewVocabulary();
  }
}

// Handle export
async function handleExport() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "exportVocabulary" });

    if (response.success === false) {
      throw new Error(response.error || '导出失败');
    }

    // Create blob and download
    const blob = new Blob([response.jsonl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = response.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage(`已导出 ${vocabulary.length} 个单词到 ${response.filename}`, "success");
  } catch (error) {
    console.error("Error exporting:", error);
    showMessage(`导出失败: ${error.message}`, "error");
  }
}

// Handle clear all
async function handleClearAll() {
  if (!confirm('确定要清空所有单词记录吗？此操作不可撤销。')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: "clearAllVocabulary" });
    vocabulary = [];
    filteredVocabulary = [];
    updateVocabularyList();
    updateWordCount();
    updateReviewVocabulary();
    showMessage("已清空所有单词记录", "success");
  } catch (error) {
    console.error("Error clearing vocabulary:", error);
    showMessage("清空失败", "error");
  }
}

// Handle delete word
async function handleDeleteWord(id) {
  if (!confirm('确定要删除这个单词记录吗？')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: "deleteVocabulary", id });

    // Update local state
    vocabulary = vocabulary.filter(item => item.id !== id);
    filteredVocabulary = filteredVocabulary.filter(item => item.id !== id);

    updateVocabularyList();
    updateWordCount();
    updateReviewVocabulary();
    showMessage("单词已删除", "success");
  } catch (error) {
    console.error("Error deleting word:", error);
    showMessage("删除失败", "error");
  }
}

// Handle locate word
async function handleLocateWord(record) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "locateWord",
      record: record
    });

    if (response.success) {
      showMessage(`正在定位单词: ${record.word}`, "success");
    } else {
      showMessage("定位失败，请确保在原网页中", "error");
    }
  } catch (error) {
    console.error("Error locating word:", error);
    showMessage("定位失败", "error");
  }
}

// Update review vocabulary based on current filter
function updateReviewVocabulary() {
  const now = Date.now();
  // Filter cards that are due for review: new cards (no review fields) or nextReviewDue <= now
  reviewVocabulary = filteredVocabulary.filter(record => {
    // New cards (no review fields or status === 'new')
    if (!record.status || record.status === 'new') return true;
    // Cards due for review
    if (record.nextReviewDue && record.nextReviewDue <= now) return true;
    // Cards with no nextReviewDue (backward compatibility)
    if (!record.nextReviewDue) return true;
    return false;
  });
  currentCardIndex = 0;

  if (reviewVocabulary.length > 0) {
    updateCardButtons();
    showCurrentCard();
  } else {
    showEmptyCard();
  }
}

// Show current card in review mode
function showCurrentCard() {
  if (reviewVocabulary.length === 0) {
    showEmptyCard();
    return;
  }

  const card = reviewVocabulary[currentCardIndex];

  cardWordEl.textContent = card.word;
  cardTranslationEl.textContent = card.translation;
  cardSentenceEl.textContent = card.sentence;
  cardLineEl.textContent = card.line;
  cardWordIndexEl.textContent = card.wordIndex;
  cardSourceEl.textContent = `来源: ${new URL(card.url).hostname}`;

  // Update progress
  cardCounterEl.textContent = `${currentCardIndex + 1}/${reviewVocabulary.length}`;
  const progress = ((currentCardIndex + 1) / reviewVocabulary.length) * 100;
  progressFillEl.style.width = `${progress}%`;

  // Enable/disable buttons
  locateCardBtn.disabled = false;
  knowBtn.disabled = false;
  dontKnowBtn.disabled = false;

  updateCardButtons();
}

// Show empty card state
function showEmptyCard() {
  cardWordEl.textContent = '--';
  cardTranslationEl.textContent = '--';
  cardSentenceEl.textContent = '--';
  cardLineEl.textContent = '--';
  cardWordIndexEl.textContent = '--';
  cardSourceEl.textContent = '来源: --';
  cardCounterEl.textContent = '0/0';
  progressFillEl.style.width = '0%';

  // Disable buttons
  locateCardBtn.disabled = true;
  knowBtn.disabled = true;
  dontKnowBtn.disabled = true;
  prevCardBtn.disabled = true;
  nextCardBtn.disabled = true;
}

// Update card navigation buttons
function updateCardButtons() {
  prevCardBtn.disabled = currentCardIndex === 0;
  nextCardBtn.disabled = currentCardIndex === reviewVocabulary.length - 1;
}

// Show previous card
function showPreviousCard() {
  if (currentCardIndex > 0) {
    currentCardIndex--;
    showCurrentCard();
  }
}

// Show next card
function showNextCard() {
  if (currentCardIndex < reviewVocabulary.length - 1) {
    currentCardIndex++;
    showCurrentCard();
  }
}

// Mark card as known/unknown and show next card
async function markCardAsKnown(status) {
  if (reviewVocabulary.length === 0) return;

  const record = reviewVocabulary[currentCardIndex];
  const message = status === 'know' ? '已标记为认识' : '已标记为不认识';
  console.log('markCardAsKnown called:', { status, recordId: record.id, currentCardIndex });

  try {
    // Send update to background script
    const response = await chrome.runtime.sendMessage({
      action: "updateReviewStatus",
      id: record.id,
      status: status // 'know' or 'dontKnow'
    });

    console.log('Background response:', response);

    if (response.success) {
      // Update local vocabulary with the updated record
      const updatedRecord = response.record;
      const vocabIndex = vocabulary.findIndex(item => item.id === record.id);
      if (vocabIndex !== -1) {
        vocabulary[vocabIndex] = updatedRecord;
      }

      // Update filtered vocabulary if the record is present
      const filteredIndex = filteredVocabulary.findIndex(item => item.id === record.id);
      if (filteredIndex !== -1) {
        filteredVocabulary[filteredIndex] = updatedRecord;
      }

      showMessage(message, "success");

      // Re-filter review vocabulary based on updated records
      updateReviewVocabulary();
    } else {
      throw new Error(response.error || '更新失败');
    }
  } catch (error) {
    console.error('Error updating review status:', error);
    showMessage(`更新失败: ${error.message}`, 'error');
  }
}

// Handle locate from card
function handleLocateCard() {
  if (reviewVocabulary.length === 0) return;

  const record = reviewVocabulary[currentCardIndex];
  handleLocateWord(record);
}

// Helper function to truncate text
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Helper function to format time
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } else if (diffDays === 1) {
    // Yesterday
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } else if (diffDays < 7) {
    // Within a week
    return `${diffDays} 天前`;
  } else {
    // Older
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  }
}

// Open settings page
function openSettings() {
  console.log("Opening settings page");

  // Get current settings to determine how to open settings
  chrome.storage.local.get({ settings: { uiMode: 'tab' } }, (data) => {
    const uiMode = data.settings.uiMode || 'tab';

    if (uiMode === 'popup') {
      // In popup mode, open settings in current popup
      window.location.href = 'settings.html';
    } else {
      // In tab mode, open settings in new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('settings.html'),
        active: true
      });
      // Close the popup if it's open
      window.close();
    }
  });
}

// Show temporary message
function showMessage(message, type = "info") {
  // Remove existing message
  const existing = document.querySelector('.message');
  if (existing) existing.remove();

  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 6px;
    background-color: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
    color: white;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: fadeInOut 3s ease-in-out;
  `;

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; top: 0; }
      10% { opacity: 1; top: 10px; }
      90% { opacity: 1; top: 10px; }
      100% { opacity: 0; top: 0; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(messageEl);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.parentNode.removeChild(messageEl);
    }
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }, 3000);
}

// Storage quotas in bytes (same as in settings.js)
const STORAGE_QUOTAS = {
  local: 10 * 1024 * 1024, // 10 MB for chrome.storage.local
  sync: 100 * 1024 // 100 KB for chrome.storage.sync
};

// Update storage usage display
async function updateStorageUsage() {
  if (!statStorageEl) return;

  try {
    // Get settings to determine storage location
    const settingsData = await chrome.storage.local.get({ settings: { storageLocation: 'local' } });
    const storageLocation = settingsData.settings.storageLocation || 'local';
    const quota = STORAGE_QUOTAS[storageLocation];

    // Get storage API based on location
    const storage = storageLocation === 'sync' ? chrome.storage.sync : chrome.storage.local;

    // Get vocabulary data
    const data = await storage.get({ vocabulary: [], settings: null });
    const vocabulary = data.vocabulary;

    // Estimate storage usage
    const vocabularySize = JSON.stringify(vocabulary).length;
    const settingsSize = JSON.stringify(data.settings || {}).length;
    const totalSize = vocabularySize + settingsSize;

    const usagePercent = Math.round((totalSize / quota) * 100);

    // Update display
    statStorageEl.textContent = `${usagePercent}%`;

    // Color coding based on usage level
    if (usagePercent > 90) {
      statStorageEl.style.color = '#f38ba8'; // Danger
    } else if (usagePercent > 70) {
      statStorageEl.style.color = '#f9e2af'; // Warning
    } else {
      statStorageEl.style.color = '#a6e3a1'; // Success
    }

  } catch (error) {
    console.error('Error calculating storage usage:', error);
    statStorageEl.textContent = '错误';
    statStorageEl.style.color = '#7f849c';
  }
}

// Select word item and update detail panel
function selectWordItem(item) {
  // Update selected word ID
  selectedWordId = item.id;

  // Update UI: highlight selected item
  document.querySelectorAll('.vocab-item').forEach(el => {
    el.classList.remove('selected');
    if (el.dataset.id === item.id) {
      el.classList.add('selected');
    }
  });

  // Update detail panel
  if (detailEmptyEl && detailLoadedEl) {
    detailEmptyEl.style.display = 'none';
    detailLoadedEl.style.display = 'block';
  }

  if (detailWordEl) detailWordEl.textContent = item.word;
  if (detailTranslationEl) detailTranslationEl.textContent = item.translation;
  if (detailSentenceEl) detailSentenceEl.textContent = item.sentence;
  if (detailUrlEl) detailUrlEl.textContent = new URL(item.url).hostname;
  if (detailTimeEl) detailTimeEl.textContent = formatTime(item.timestamp);
  if (detailPositionEl) detailPositionEl.textContent = `行 ${item.line}, 词 ${item.wordIndex}`;

  // Store current item for detail buttons
  window.currentDetailItem = item;
}

// Handle locate from detail panel
async function handleDetailLocate() {
  if (!window.currentDetailItem) return;
  await handleLocateWord(window.currentDetailItem);
}

// Handle delete from detail panel
async function handleDetailDelete() {
  if (!window.currentDetailItem) return;
  await handleDeleteWord(window.currentDetailItem.id);
  // Clear detail panel after deletion
  selectedWordId = null;
  if (detailEmptyEl && detailLoadedEl) {
    detailEmptyEl.style.display = 'flex';
    detailLoadedEl.style.display = 'none';
  }
}

// Update statistics panel
function updateStatistics() {
  if (!statTotalEl || !statTodayEl || !statStorageEl || !statPendingEl) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const total = vocabulary.length;
  const today = vocabulary.filter(item => item.timestamp >= todayStart).length;

  // Calculate pending reviews based on review status
  const nowTime = Date.now();
  const pending = vocabulary.filter(record => {
    // New cards (no review fields or status === 'new')
    if (!record.status || record.status === 'new') return true;
    // Cards due for review
    if (record.nextReviewDue && record.nextReviewDue <= nowTime) return true;
    // Cards with no nextReviewDue (backward compatibility)
    if (!record.nextReviewDue) return true;
    return false;
  }).length;

  statTotalEl.textContent = total;
  statTodayEl.textContent = today;
  statPendingEl.textContent = pending;

  // Storage usage will be updated separately by updateStorageUsage()
}

// Update word count and statistics when vocabulary loads
function updateWordCount() {
  wordCountEl.textContent = `${vocabulary.length} 个单词`;

  if (vocabulary.length > 0) {
    const latest = vocabulary.reduce((latest, item) =>
      item.timestamp > latest.timestamp ? item : latest
    );
    lastUpdatedEl.textContent = `最后更新: ${formatTime(latest.timestamp)}`;
  } else {
    lastUpdatedEl.textContent = '最后更新: --';
  }

  // Update statistics panel
  updateStatistics();
}