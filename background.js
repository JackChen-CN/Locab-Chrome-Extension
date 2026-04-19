// Service worker for Locab Chrome Extension
// Handles context menu, API calls, and storage operations

// Import CryptoJS for MD5
importScripts('lib/crypto-js.min.js');

// Default settings
const DEFAULT_SETTINGS = {
  uiMode: 'tab', // 'tab' or 'popup'
  autoTranslation: true,
  translationAPI: 'mymemory', // 'mymemory', 'tencent', 'baidu', 'youdao'
  apiKey: '', // API密钥 (kept for compatibility)
  customApiUrl: '', // 自定义API URL (kept for compatibility)
  // 腾讯翻译君专用配置
  tencentApiUrl: 'https://tmt.tencentcloudapi.com/', // 接口API（可选）
  tencentApiKey: '', // API密钥（简单认证）
  tencentSecretId: '', // SecretId（高级认证）
  tencentSecretKey: '', // SecretKey（高级认证）
  tencentToken: '', // Token（可选，临时凭证需要）
  // 百度翻译通用API专用配置
  baiduApiUrl: 'https://fanyi-api.baidu.com/api/trans/vip/translate', // 接口API（可选）
  baiduApiKey: '', // API密钥（简单认证）
  baiduAppId: '', // AppId（高级认证，兼容旧版）
  baiduSecretKey: '', // SecretKey（高级认证，兼容旧版）
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

    // Validate selection: must not be empty
    if (!selectedText) {
      console.log("Invalid selection - empty");
      showNotification("请选择要翻译的文本");
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
  const tencentApiUrl = settings.tencentApiUrl || 'https://tmt.tencentcloudapi.com/';
  const tencentApiKey = settings.tencentApiKey || '';
  const tencentSecretId = settings.tencentSecretId || '';
  const tencentSecretKey = settings.tencentSecretKey || '';
  const tencentToken = settings.tencentToken || '';
  const baiduApiUrl = settings.baiduApiUrl || 'https://fanyi-api.baidu.com/api/trans/vip/translate';
  const baiduApiKey = settings.baiduApiKey || '';
  const baiduAppId = settings.baiduAppId || '';
  const baiduSecretKey = settings.baiduSecretKey || '';

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
      case 'tencent':
        primaryTranslation = await fetchTencentTranslation(word, tencentApiUrl, tencentApiKey, tencentSecretId, tencentSecretKey, tencentToken);
        break;
      case 'baidu':
        primaryTranslation = await fetchBaiduTranslation(word, baiduApiUrl, baiduApiKey, baiduAppId, baiduSecretKey);
        break;
      case 'youdao':
        primaryTranslation = await fetchYoudaoTranslation(word);
        break;
      default:
        primaryTranslation = await fetchMyMemoryTranslation(word);
    }

    // Return primary translation regardless of empty result
    // Only if primary API throws an exception will we try fallback
    console.log("Primary translation result:", primaryTranslation);
    return primaryTranslation || `[无翻译结果: ${word}]`;
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

// Tencent translation - Tencent Translation API
async function fetchTencentTranslation(word, apiUrl, apiKey = '', secretId = '', secretKey = '', token = '') {
  // 如果apiUrl为空，使用默认值
  if (!apiUrl || apiUrl.trim() === '') {
    apiUrl = 'https://tmt.tencentcloudapi.com/';
  }

  // 优先使用API Key简单认证
  if (apiKey && apiKey.trim() !== '') {
    return await fetchTencentTranslationSimple(word, apiUrl, apiKey);
  }

  // 否则使用SecretId/SecretKey高级认证
  if (!secretKey) throw new Error('腾讯翻译API需要SecretKey或API Key');

  // 如果secretId为空，尝试使用secretKey作为secretId
  if (!secretId || secretId.trim() === '') {
    console.warn('SecretId未提供，尝试使用SecretKey作为SecretId');
    secretId = secretKey;
  }

  try {
    // 从URL解析主机名
    const urlObj = new URL(apiUrl);
    const host = urlObj.host;
    const path = urlObj.pathname === '/' ? '' : urlObj.pathname;

    // 请求参数
    const region = 'ap-beijing'; // 根据示例改为北京区域
    const action = 'TextTranslate';
    const version = '2018-03-21';

    // 调试：使用示例中的时间戳进行签名验证
    // 实际生产环境应该使用当前时间戳
    const debugMode = false; // 设置为true使用示例时间戳进行调试
    let timestamp, date;

    if (debugMode) {
      // 使用示例中的时间戳：2026-04-19对应的1776566428
      timestamp = 1776566428;
      date = '2026-04-19';
      console.warn('⚠️ 调试模式：使用固定时间戳', timestamp, '和日期', date);
    } else {
      timestamp = Math.floor(Date.now() / 1000);
      date = new Date(timestamp * 1000).toISOString().split('T')[0];
    }

    // Token是可选的，用于临时凭证
    // token参数从函数参数传入

    // 请求体
    const payload = {
      SourceText: word,
      Source: 'en',
      Target: 'zh',
      ProjectId: 0
    };

    console.log('腾讯翻译API调试信息:', { host, path, timestamp, date, secretId: secretId.substring(0, 8) + '...', debugMode });

    // 生成签名所需组件
    const service = 'tmt';
    const algorithm = 'TC3-HMAC-SHA256';

    // 1. 规范请求
    const httpRequestMethod = 'POST';
    const canonicalUri = path || '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = await sha256(JSON.stringify(payload));

    console.log('请求体JSON:', JSON.stringify(payload));
    console.log('请求体哈希:', hashedRequestPayload);

    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    console.log('规范请求 (原始):');
    console.log('1. HTTP方法:', httpRequestMethod);
    console.log('2. URI:', canonicalUri);
    console.log('3. 查询字符串:', canonicalQueryString);
    console.log('4. 规范头部:', canonicalHeaders.replace(/\n/g, '\\n'));
    console.log('5. 签名头部:', signedHeaders);
    console.log('6. 请求体哈希:', hashedRequestPayload);

    const hashedCanonicalRequest = await sha256(canonicalRequest);
    console.log('完整规范请求字符串:', canonicalRequest.replace(/\n/g, '\\n'));
    console.log('规范请求哈希:', hashedCanonicalRequest);
    console.log('规范请求哈希 (截断):', hashedCanonicalRequest.substring(0, 32) + '...');

    // 2. 待签字符串
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    console.log('待签字符串 stringToSign:', stringToSign);
    console.log('待签字符串各部分:');
    console.log('1. 算法:', algorithm);
    console.log('2. 时间戳:', timestamp);
    console.log('3. 凭证范围:', credentialScope);
    console.log('4. 规范请求哈希:', hashedCanonicalRequest);
    console.log('凭证范围 credentialScope:', credentialScope);

    // 3. 计算签名
    const signature = await calculateTc3Signature(secretKey, date, service, stringToSign);

    console.log('签名结果:', signature.substring(0, 32) + '...');

    // 4. 生成Authorization头
    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // 发送请求
    const headers = {
      'Authorization': authorization,
      'Content-Type': 'application/json',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Region': region,
      'X-TC-Language': 'zh-CN'
    };

    // 如果提供了Token，添加到头部
    if (token && token.trim() !== '') {
      headers['X-TC-Token'] = token;
    }

    console.log('请求头:', JSON.stringify(headers, null, 2));
    console.log('请求体:', JSON.stringify(payload, null, 2));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`腾讯翻译API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // 解析响应
    if (data.Response && data.Response.TargetText) {
      return data.Response.TargetText;
    } else if (data.Response && data.Response.Error) {
      throw new Error(`腾讯翻译API返回错误: ${data.Response.Error.Message || '未知错误'}`);
    } else {
      throw new Error('无法解析腾讯翻译API响应');
    }
  } catch (error) {
    console.error('腾讯翻译API请求失败:', error);
    // Fallback to MyMemory API
    console.log('腾讯翻译失败，尝试使用MyMemory作为备用');
    return await fetchMyMemoryTranslation(word);
  }

  // 辅助函数：计算SHA256哈希
  async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 辅助函数：计算TC3签名（使用字节数组传递中间结果）
  async function calculateTc3Signature(secretKey, date, service, stringToSign) {
    // 计算签名密钥链，保持中间结果为字节数组
    const kDate = await hmacSha256Bytes(`TC3${secretKey}`, date);
    console.log('kDate (hex):', bytesToHex(kDate).substring(0, 32) + '...');

    const kService = await hmacSha256Bytes(kDate, service);
    console.log('kService (hex):', bytesToHex(kService).substring(0, 32) + '...');

    const kSigning = await hmacSha256Bytes(kService, 'tc3_request');
    console.log('kSigning (hex):', bytesToHex(kSigning).substring(0, 32) + '...');

    // 计算签名
    const signatureBytes = await hmacSha256Bytes(kSigning, stringToSign);
    const signature = bytesToHex(signatureBytes);
    console.log('签名 (hex):', signature);
    return signature;
  }

  // 辅助函数：十六进制字符串转字节数组
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  // 辅助函数：字节数组转十六进制字符串
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 辅助函数：HMAC-SHA256（返回字节数组）
  async function hmacSha256Bytes(key, message) {
    const encoder = new TextEncoder();

    // 处理密钥：可以是字符串或字节数组
    let keyData;
    if (typeof key === 'string') {
      keyData = encoder.encode(key);
    } else if (key instanceof Uint8Array) {
      keyData = key;
    } else if (typeof key === 'object' && key.byteLength !== undefined) {
      keyData = key;
    } else {
      throw new Error('无效的密钥类型');
    }

    const messageData = encoder.encode(message);

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // 计算HMAC
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return new Uint8Array(signature);
  }

  // 辅助函数：HMAC-SHA256（返回十六进制字符串，兼容现有代码）
  async function hmacSha256(key, message) {
    const bytes = await hmacSha256Bytes(key, message);
    return bytesToHex(bytes);
  }
}

// Baidu translation - Baidu Translation API
async function fetchBaiduTranslation(word, apiUrl, apiKey = '', appId = '', secretKey = '') {
  // 百度翻译API只支持AppId/SecretKey认证模式
  if (apiKey && apiKey.trim() !== '' && (!appId || !secretKey)) {
    throw new Error('百度翻译API已弃用API Key认证模式。请填写下方的AppId和SecretKey（从百度翻译开放平台获取），不要填写API Key字段。');
  }

  if (!appId || !secretKey) {
    throw new Error('百度翻译API需要AppId和SecretKey（请从百度翻译开放平台 https://fanyi-api.baidu.com 获取，免费版每月200万字符额度，需先完成实名认证并开通翻译服务）');
  }

  // 如果apiUrl为空，使用默认值
  if (!apiUrl || apiUrl.trim() === '') {
    apiUrl = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
  }

  try {
    console.log('使用百度翻译AppId/SecretKey认证模式');

    // 生成随机salt
    const salt = Date.now().toString();
    const trimmedWord = word.trim();

    // 根据官方文档：sign = MD5(appid + q + salt + secretKey)
    // 关键：生成签名时q使用原始文本，不做URL encode
    // MD5计算使用UTF-8编码
    const signStr = appId + trimmedWord + salt + secretKey;
    const sign = md5(signStr);

    console.log('百度翻译签名生成:', {
      appid: appId,
      q: trimmedWord,
      salt: salt,
      signStringLength: signStr.length,
      sign: sign
    });

    // 构建请求参数 - URLSearchParams会自动进行URL编码
    const params = new URLSearchParams({
      q: trimmedWord,
      from: 'auto',
      to: 'zh',
      appid: appId,
      salt: salt,
      sign: sign
    });

    const requestUrl = `${apiUrl}?${params.toString()}`;
    console.log('百度翻译请求URL:', requestUrl);

    const response = await fetchWithTimeout(requestUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('百度翻译API HTTP错误:', errorText);
      throw new Error(`百度翻译API错误: ${response.status}`);
    }

    const data = await response.json();
    console.log('百度翻译API响应:', data);

    if (data.trans_result && Array.isArray(data.trans_result) && data.trans_result.length > 0) {
      return data.trans_result[0].dst;
    } else if (data.error_code) {
      let errorMsg = `百度翻译API错误 (${data.error_code}): ${data.error_msg || '未知错误'}`;
      switch (data.error_code.toString()) {
        case '52003':
          errorMsg = '百度翻译：未授权用户。请检查AppId是否正确、是否已开通翻译服务、是否已完成实名认证';
          break;
        case '54001':
          errorMsg = '百度翻译：签名错误。请检查AppId和SecretKey是否正确。可在 https://md5jiami.51240.com/ 验证签名，输入: ' + appId + trimmedWord + salt + '[您的SecretKey]';
          break;
        case '54003':
          errorMsg = '百度翻译：访问频率受限，请稍后重试';
          break;
        case '54004':
          errorMsg = '百度翻译：账户余额不足，请充值';
          break;
        case '58001':
          errorMsg = '百度翻译：语言方向不支持';
          break;
      }
      throw new Error(errorMsg);
    } else {
      throw new Error('无法解析百度翻译API响应');
    }
  } catch (error) {
    console.error('百度翻译API请求失败:', error);
    console.log('百度翻译失败，尝试使用MyMemory作为备用');
    return await fetchMyMemoryTranslation(word);
  }

  // MD5哈希函数 - UTF-8编码，返回32位小写十六进制
  function md5(message) {
    return CryptoJS.MD5(message).toString();
  }
}

// 腾讯翻译简单API Key认证
async function fetchTencentTranslationSimple(word, apiUrl, apiKey) {
  try {
    const urlObj = new URL(apiUrl);
    const host = urlObj.host;

    // 简单API Key认证 - 通过请求头传递
    const headers = {
      'Content-Type': 'application/json',
      'X-TC-Key': apiKey,
      'X-TC-Action': 'TextTranslate',
      'X-TC-Version': '2018-03-21',
      'X-TC-Region': 'ap-beijing',
      'X-TC-Language': 'zh-CN',
      'X-TC-Timestamp': Math.floor(Date.now() / 1000).toString()
    };

    // 请求体
    const payload = {
      SourceText: word,
      Source: 'en',
      Target: 'zh',
      ProjectId: 0
    };

    console.log('腾讯翻译API请求 (简单认证模式):', { apiUrl, apiKey: apiKey.substring(0, 8) + '...' });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`腾讯翻译API错误: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // 解析响应
    if (data.Response && data.Response.TargetText) {
      return data.Response.TargetText;
    } else if (data.Response && data.Response.Error) {
      throw new Error(`腾讯翻译API返回错误: ${data.Response.Error.Message || '未知错误'}`);
    } else {
      throw new Error('无法解析腾讯翻译API响应');
    }
  } catch (error) {
    console.error('腾讯翻译简单API Key认证失败:', error);
    // Fallback to MyMemory API
    console.log('腾讯翻译失败，尝试使用MyMemory作为备用');
    return await fetchMyMemoryTranslation(word);
  }
}

// Youdao dictionary translation API
async function fetchYoudaoTranslation(word) {
  try {
    const apiUrl = `https://dict.youdao.com/suggest?num=5&ver=3.0&doctype=json&cache=false&le=en&q=${encodeURIComponent(word)}`;
    console.log('Fetching Youdao translation for:', word, 'URL:', apiUrl);

    const response = await fetchWithTimeout(apiUrl, {}, 8000);
    if (!response.ok) {
      throw new Error(`Youdao API response: ${response.status}`);
    }

    const data = await response.json();
    console.log('Youdao API response:', data);

    // 解析有道词典返回的数据
    if (data.result && data.result.code === 200 && data.data && data.data.entries) {
      // 提取所有条目的解释
      const explanations = [];
      for (const entry of data.data.entries) {
        if (entry.explain && entry.entry) {
          // 格式化解释：entry: explain
          explanations.push(`${entry.entry}: ${entry.explain}`);
        }
      }

      if (explanations.length > 0) {
        // 限制返回的解释数量，避免过长
        const maxExplanations = 5;
        const limitedExplanations = explanations.slice(0, maxExplanations);
        // 使用中文分号连接
        return limitedExplanations.join('；');
      }
    }

    // 如果没有有效数据，返回null
    return null;
  } catch (error) {
    console.warn('Youdao dictionary API failed:', error);
    return null;
  }
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