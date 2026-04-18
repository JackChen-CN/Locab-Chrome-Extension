// Popup script for Locab Chrome Extension
// Handles UI interactions for the popup window

// Global state
let vocabulary = [];
let filteredVocabulary = [];
let currentTab = 'list';
let currentCardIndex = 0;
let reviewVocabulary = [];

// DOM elements
let searchInput, clearSearchBtn, exportBtn, clearAllBtn;
let vocabularyList, wordCountEl, lastUpdatedEl;
let prevCardBtn, nextCardBtn, knowBtn, dontKnowBtn, locateCardBtn;
let cardWordEl, cardTranslationEl, cardSentenceEl, cardLineEl, cardWordIndexEl, cardSourceEl;
let cardCounterEl, progressFillEl;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  searchInput = document.getElementById('search-input');
  clearSearchBtn = document.getElementById('clear-search');
  exportBtn = document.getElementById('export-btn');
  clearAllBtn = document.getElementById('clear-all-btn');
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

  // Set up event listeners
  setupEventListeners();

  // Load vocabulary data
  loadVocabulary();

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
  exportBtn.addEventListener('click', handleExport);

  // Clear all functionality
  clearAllBtn.addEventListener('click', handleClearAll);

  // Review functionality
  prevCardBtn.addEventListener('click', showPreviousCard);
  nextCardBtn.addEventListener('click', showNextCard);
  knowBtn.addEventListener('click', () => markCardAsKnown('know'));
  dontKnowBtn.addEventListener('click', () => markCardAsKnown('dontKnow'));
  locateCardBtn.addEventListener('click', handleLocateCard);
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
  try {
    const response = await chrome.runtime.sendMessage({ action: "getAllVocabulary" });
    vocabulary = response || [];
    filteredVocabulary = [...vocabulary];

    updateVocabularyList();
    updateWordCount();
    updateReviewVocabulary();
  } catch (error) {
    console.error("Error loading vocabulary:", error);
    showMessage("加载单词列表失败", "error");
  }
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

  const template = document.getElementById('vocab-item-template');

  filteredVocabulary.forEach((item, index) => {
    const clone = template.content.cloneNode(true);
    const vocabItem = clone.querySelector('.vocab-item');

    // Set data attribute for identification
    vocabItem.dataset.id = item.id;
    vocabItem.dataset.index = index;

    // Fill in data
    const wordEl = clone.querySelector('.vocab-word');
    const translationEl = clone.querySelector('.vocab-translation');
    const sentenceEl = clone.querySelector('.vocab-sentence');
    const urlEl = clone.querySelector('.meta-url');
    const timeEl = clone.querySelector('.meta-time');
    const lineEl = clone.querySelector('.meta-line');
    const wordIndexEl = clone.querySelector('.meta-word-index');

    wordEl.textContent = item.word;
    translationEl.textContent = item.translation;
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

    vocabularyList.appendChild(clone);
  });
}

// Update word count display
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
}

// Handle search
function handleSearch() {
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    filteredVocabulary = [...vocabulary];
  } else {
    filteredVocabulary = vocabulary.filter(item =>
      item.word.toLowerCase().includes(query) ||
      item.translation.toLowerCase().includes(query) ||
      item.sentence.toLowerCase().includes(query)
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
      window.close(); // Close popup after successful location
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
  reviewVocabulary = [...filteredVocabulary];
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
function markCardAsKnown(status) {
  const message = status === 'know' ? '已标记为认识' : '已标记为不认识';
  showMessage(message, "info");

  // Auto advance to next card if available
  if (currentCardIndex < reviewVocabulary.length - 1) {
    currentCardIndex++;
    showCurrentCard();
  } else if (reviewVocabulary.length > 0) {
    // If last card, show first card
    currentCardIndex = 0;
    showCurrentCard();
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