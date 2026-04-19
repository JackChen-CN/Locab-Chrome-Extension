// Settings management script for Locab Chrome Extension

// Default settings
const DEFAULT_SETTINGS = {
  uiMode: 'tab', // 'tab' or 'popup'
  autoTranslation: true,
  translationAPI: 'mymemory', // 'mymemory', 'tencent' (only two options now)
  apiKey: '', // API密钥 (kept for compatibility)
  customApiUrl: '', // 自定义API URL (kept for compatibility)
  // 腾讯翻译君专用配置
  tencentApiUrl: 'https://tmt.tencentcloudapi.com/', // 接口API（可选）
  tencentSecretId: '', // SecretId（可选）
  tencentSecretKey: '', // SecretKey（必需）
  storageLocation: 'local', // 'local' or 'sync'
  lastModified: Date.now()
};

// DOM elements
let uiModeTab, uiModePopup, autoTranslationCheckbox, translationAPISelect, storageLocationSelect;
let apiKeyContainer, apiKeyInput, apiKeyHint, customApiContainer, customApiUrlInput;
let tencentConfigContainer, tencentApiUrlInput, tencentSecretIdInput, tencentSecretKeyInput;
let exportBtn, importBtn, clearBtn, saveBtn, resetBtn, backBtn;
let wordCountEl, lastUpdatedEl, storageUsageEl, storageWarningEl;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  uiModeTab = document.getElementById('mode-tab');
  uiModePopup = document.getElementById('mode-popup');
  autoTranslationCheckbox = document.getElementById('auto-translation');
  translationAPISelect = document.getElementById('translation-api');
  storageLocationSelect = document.getElementById('storage-location');
  apiKeyContainer = document.getElementById('api-key-container');
  apiKeyInput = document.getElementById('api-key');
  apiKeyHint = document.getElementById('api-key-hint');
  customApiContainer = document.getElementById('custom-api-container');
  customApiUrlInput = document.getElementById('custom-api-url');
  tencentConfigContainer = document.getElementById('tencent-config-container');
  tencentApiUrlInput = document.getElementById('tencent-api-url');
  tencentSecretIdInput = document.getElementById('tencent-secret-id');
  tencentSecretKeyInput = document.getElementById('tencent-secret-key');
  exportBtn = document.getElementById('export-btn');
  importBtn = document.getElementById('import-btn');
  clearBtn = document.getElementById('clear-btn');
  saveBtn = document.getElementById('save-btn');
  resetBtn = document.getElementById('reset-btn');
  backBtn = document.getElementById('back-btn');
  wordCountEl = document.getElementById('word-count');
  lastUpdatedEl = document.getElementById('last-updated');
  storageUsageEl = document.getElementById('storage-usage');
  storageWarningEl = document.getElementById('storage-warning');

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

  // Translation API change
  translationAPISelect.addEventListener('change', updateApiFieldsVisibility);
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
    storageLocationSelect.value = settings.storageLocation || 'local';
    apiKeyInput.value = settings.apiKey || '';
    customApiUrlInput.value = settings.customApiUrl || '';
    tencentApiUrlInput.value = settings.tencentApiUrl || 'https://tmt.tencentcloudapi.com/';
    tencentSecretIdInput.value = settings.tencentSecretId || '';
    tencentSecretKeyInput.value = settings.tencentSecretKey || '';
    updateApiFieldsVisibility();
  } catch (error) {
    console.error('Error loading settings:', error);
    showMessage('加载设置失败', 'error');
  }
}

// Storage quotas in bytes
const STORAGE_QUOTAS = {
  local: 10 * 1024 * 1024, // 10 MB for chrome.storage.local
  sync: 100 * 1024 // 100 KB for chrome.storage.sync
};

// Load vocabulary statistics
async function loadVocabularyStats() {
  try {
    // Get settings to determine storage location
    const settingsData = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
    const settings = settingsData.settings;
    const storageLocation = settings.storageLocation || 'local';

    // Get storage API based on location
    const storage = storageLocation === 'sync' ? chrome.storage.sync : chrome.storage.local;
    const quota = STORAGE_QUOTAS[storageLocation];

    // Get vocabulary data
    const data = await storage.get({ vocabulary: [], settings: null });
    const vocabulary = data.vocabulary;

    // Update word count
    wordCountEl.textContent = vocabulary.length;

    // Update last updated time
    if (vocabulary.length > 0) {
      const latest = vocabulary.reduce((latest, item) =>
        item.timestamp > latest.timestamp ? item : latest
      );
      lastUpdatedEl.textContent = formatTime(latest.timestamp);
    } else {
      lastUpdatedEl.textContent = '--';
    }

    // Calculate and display storage usage
    if (storageUsageEl && storageWarningEl) {
      // Estimate storage usage by converting to JSON string
      const vocabularySize = JSON.stringify(vocabulary).length;
      const settingsSize = JSON.stringify(data.settings || {}).length;
      const totalSize = vocabularySize + settingsSize;

      const usagePercent = Math.round((totalSize / quota) * 100);
      const usageMB = (totalSize / (1024 * 1024)).toFixed(2);
      const quotaMB = (quota / (1024 * 1024)).toFixed(2);

      storageUsageEl.textContent = `${usagePercent}% (${usageMB} MB / ${quotaMB} MB)`;
      storageUsageEl.style.color = usagePercent > 90 ? '#f38ba8' :
                                  usagePercent > 70 ? '#f9e2af' :
                                  '#a6e3a1';

      // Show storage warning if needed
      if (usagePercent > 90) {
        storageWarningEl.textContent = '存储空间严重不足！建议立即导出数据并清理。';
        storageWarningEl.style.color = '#f38ba8';
      } else if (usagePercent > 70) {
        storageWarningEl.textContent = '存储空间使用较多，建议定期导出备份。';
        storageWarningEl.style.color = '#f9e2af';
      } else {
        storageWarningEl.textContent = '存储空间充足，建议定期导出备份以防数据丢失。';
        storageWarningEl.style.color = '#a6e3a1';
      }
    }
  } catch (error) {
    console.error('Error loading vocabulary stats:', error);
    if (storageUsageEl) {
      storageUsageEl.textContent = '计算失败';
    }
    if (storageWarningEl) {
      storageWarningEl.textContent = '无法获取存储信息';
    }
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    const settings = {
      uiMode: uiModeTab.checked ? 'tab' : 'popup',
      autoTranslation: autoTranslationCheckbox.checked,
      translationAPI: translationAPISelect.value,
      apiKey: apiKeyInput.value,
      customApiUrl: customApiUrlInput.value,
      tencentApiUrl: tencentApiUrlInput.value,
      tencentSecretId: tencentSecretIdInput.value,
      tencentSecretKey: tencentSecretKeyInput.value,
      storageLocation: storageLocationSelect.value,
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
    storageLocationSelect.value = DEFAULT_SETTINGS.storageLocation;
    apiKeyInput.value = DEFAULT_SETTINGS.apiKey;
    customApiUrlInput.value = DEFAULT_SETTINGS.customApiUrl;
    tencentApiUrlInput.value = DEFAULT_SETTINGS.tencentApiUrl;
    tencentSecretIdInput.value = DEFAULT_SETTINGS.tencentSecretId;
    tencentSecretKeyInput.value = DEFAULT_SETTINGS.tencentSecretKey;
    updateApiFieldsVisibility();

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

// Update API fields visibility based on selected translation API
function updateApiFieldsVisibility() {
  const selectedApi = translationAPISelect.value;
  const isTencent = selectedApi === 'tencent';
  const isCustom = selectedApi === 'custom';

  // Show/hide API key container (for compatibility, not used for tencent)
  if (apiKeyContainer) {
    apiKeyContainer.style.display = isCustom ? 'block' : 'none';
  }

  // Show/hide custom API container
  if (customApiContainer) {
    customApiContainer.style.display = isCustom ? 'block' : 'none';
  }

  // Show/hide Tencent config container
  if (tencentConfigContainer) {
    tencentConfigContainer.style.display = isTencent ? 'block' : 'none';
  }

  // Update API key hint
  if (apiKeyHint) {
    switch (selectedApi) {
      case 'tencent':
        apiKeyHint.textContent = '需要腾讯翻译君的API密钥，请访问腾讯云控制台获取。';
        break;
      case 'custom':
        apiKeyHint.textContent = '输入自定义API密钥（如果需要）。';
        break;
      default:
        apiKeyHint.textContent = '';
    }
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