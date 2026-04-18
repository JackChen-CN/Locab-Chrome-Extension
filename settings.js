// Settings management script for Locab Chrome Extension

// Default settings
const DEFAULT_SETTINGS = {
  uiMode: 'tab', // 'tab' or 'popup'
  autoTranslation: true,
  translationAPI: 'mymemory', // 'mymemory' or 'libre'
  lastModified: Date.now()
};

// DOM elements
let uiModeTab, uiModePopup, autoTranslationCheckbox, translationAPISelect;
let exportBtn, importBtn, clearBtn, saveBtn, resetBtn, backBtn;
let wordCountEl, lastUpdatedEl;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  uiModeTab = document.getElementById('mode-tab');
  uiModePopup = document.getElementById('mode-popup');
  autoTranslationCheckbox = document.getElementById('auto-translation');
  translationAPISelect = document.getElementById('translation-api');
  exportBtn = document.getElementById('export-btn');
  importBtn = document.getElementById('import-btn');
  clearBtn = document.getElementById('clear-btn');
  saveBtn = document.getElementById('save-btn');
  resetBtn = document.getElementById('reset-btn');
  backBtn = document.getElementById('back-btn');
  wordCountEl = document.getElementById('word-count');
  lastUpdatedEl = document.getElementById('last-updated');

  // Set up event listeners
  setupEventListeners();

  // Load current settings and data
  loadSettings();
  loadVocabularyStats();
}

// Set up event listeners
function setupEventListeners() {
  // Save button
  saveBtn.addEventListener('click', saveSettings);

  // Reset button
  resetBtn.addEventListener('click', resetToDefaults);

  // Back button
  backBtn.addEventListener('click', () => {
    // Navigate based on current UI mode
    chrome.storage.local.get({ settings: DEFAULT_SETTINGS }, (data) => {
      const uiMode = data.settings.uiMode || DEFAULT_SETTINGS.uiMode;
      if (uiMode === 'popup') {
        // Close settings page and show popup
        window.close();
      } else {
        // Go to main tab page
        chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      }
    });
  });

  // Export button
  exportBtn.addEventListener('click', handleExport);

  // Import button
  importBtn.addEventListener('click', handleImport);

  // Clear button
  clearBtn.addEventListener('click', handleClear);
}

// Load current settings from storage
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
    const settings = data.settings;

    console.log('Loaded settings:', settings);

    // Update UI based on settings
    if (settings.uiMode === 'tab') {
      uiModeTab.checked = true;
    } else {
      uiModePopup.checked = true;
    }

    autoTranslationCheckbox.checked = settings.autoTranslation !== false; // Default to true
    translationAPISelect.value = settings.translationAPI || 'mymemory';
  } catch (error) {
    console.error('Error loading settings:', error);
    showMessage('加载设置失败', 'error');
  }
}

// Load vocabulary statistics
async function loadVocabularyStats() {
  try {
    const data = await chrome.storage.local.get({ vocabulary: [] });
    const vocabulary = data.vocabulary;

    wordCountEl.textContent = vocabulary.length;

    if (vocabulary.length > 0) {
      const latest = vocabulary.reduce((latest, item) =>
        item.timestamp > latest.timestamp ? item : latest
      );
      lastUpdatedEl.textContent = formatTime(latest.timestamp);
    } else {
      lastUpdatedEl.textContent = '--';
    }
  } catch (error) {
    console.error('Error loading vocabulary stats:', error);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    const settings = {
      uiMode: uiModeTab.checked ? 'tab' : 'popup',
      autoTranslation: autoTranslationCheckbox.checked,
      translationAPI: translationAPISelect.value,
      lastModified: Date.now()
    };

    console.log('Saving settings:', settings);

    await chrome.storage.local.set({ settings });
    showMessage('设置已保存', 'success');

    // Update manifest action based on UI mode
    await updateExtensionAction(settings.uiMode);

    // Reload settings after a moment to ensure they're applied
    setTimeout(() => {
      loadSettings();
    }, 500);
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('保存设置失败', 'error');
  }
}

// Update extension action (popup or no popup) based on UI mode
async function updateExtensionAction(uiMode) {
  try {
    if (uiMode === 'popup') {
      // Enable popup
      chrome.action.setPopup({ popup: 'popup.html' });
      console.log('Popup enabled');
    } else {
      // Disable popup (will be handled by background script)
      chrome.action.setPopup({ popup: '' });
      console.log('Popup disabled, will open in tab');
    }
  } catch (error) {
    console.error('Error updating extension action:', error);
  }
}

// Reset settings to defaults
async function resetToDefaults() {
  if (!confirm('确定要恢复默认设置吗？所有自定义设置将被重置。')) {
    return;
  }

  try {
    console.log('Resetting to default settings');
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });

    // Update UI to show defaults
    uiModeTab.checked = DEFAULT_SETTINGS.uiMode === 'tab';
    uiModePopup.checked = DEFAULT_SETTINGS.uiMode === 'popup';
    autoTranslationCheckbox.checked = DEFAULT_SETTINGS.autoTranslation;
    translationAPISelect.value = DEFAULT_SETTINGS.translationAPI;

    // Update extension action
    await updateExtensionAction(DEFAULT_SETTINGS.uiMode);

    showMessage('已恢复默认设置', 'success');

    // Reload settings
    setTimeout(() => {
      loadSettings();
    }, 500);
  } catch (error) {
    console.error('Error resetting settings:', error);
    showMessage('重置设置失败', 'error');
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

    // Get vocabulary count for message
    const data = await chrome.storage.local.get({ vocabulary: [] });
    const count = data.vocabulary.length;

    showMessage(`已导出 ${count} 个单词到 ${response.filename}`, 'success');
  } catch (error) {
    console.error("Error exporting:", error);
    showMessage(`导出失败: ${error.message}`, 'error');
  }
}

// Handle import
async function handleImport() {
  // Create file input element
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.json,.jsonl';

  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const importedVocabulary = [];

      // Parse each line as JSON
      for (const line of lines) {
        if (line.trim()) {
          try {
            const record = JSON.parse(line);
            importedVocabulary.push(record);
          } catch (parseError) {
            console.warn('Failed to parse line:', line, parseError);
          }
        }
      }

      if (importedVocabulary.length === 0) {
        throw new Error('文件中没有找到有效的词汇数据');
      }

      // Load existing vocabulary
      const data = await chrome.storage.local.get({ vocabulary: [] });
      const existingVocabulary = data.vocabulary;

      // Merge and remove duplicates
      const mergedVocabulary = [...existingVocabulary];
      const existingIds = new Set(existingVocabulary.map(item => item.id));

      for (const record of importedVocabulary) {
        if (!existingIds.has(record.id)) {
          mergedVocabulary.push(record);
        }
      }

      // Save merged vocabulary
      await chrome.storage.local.set({ vocabulary: mergedVocabulary });

      showMessage(`已导入 ${importedVocabulary.length} 个单词，共 ${mergedVocabulary.length} 个单词`, 'success');
      loadVocabularyStats();
    } catch (error) {
      console.error('Error importing:', error);
      showMessage(`导入失败: ${error.message}`, 'error');
    }
  });

  input.click();
}

// Handle clear all vocabulary
async function handleClear() {
  if (!confirm('确定要清空所有单词记录吗？此操作不可撤销。')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: "clearAllVocabulary" });
    showMessage("已清空所有单词记录", "success");
    loadVocabularyStats();
  } catch (error) {
    console.error("Error clearing vocabulary:", error);
    showMessage("清空失败", "error");
  }
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
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 6px;
    background-color: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
    color: white;
    z-index: 1000;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;

  document.body.appendChild(messageEl);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.parentNode.removeChild(messageEl);
    }
  }, 3000);
}