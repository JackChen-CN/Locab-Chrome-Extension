// Content script for Locab Chrome Extension
// Injected into all pages, handles word context extraction and word location

// Global toast container for notifications
let toastContainer = null;

// Message listener for background script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "getWordContext":
      handleGetWordContext(request, sendResponse);
      return true; // Keep channel open for async response

    case "locateWordInPage":
      handleLocateWordInPage(request.record);
      sendResponse({ success: true });
      return true;

    case "showToast":
      showToast(request.message);
      sendResponse({ success: true });
      return true;

    case "highlightWord":
      highlightWord(request.record);
      sendResponse({ success: true });
      return true;
  }
});

// Handle request to get word context (called when user marks a word)
async function handleGetWordContext(request, sendResponse) {
  try {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      throw new Error("No text selected");
    }

    const range = selection.getRangeAt(0);
    const word = request.word;
    const translation = request.translation;

    // Get containing block element
    const blockElement = getContainingBlockElement(range.startContainer);

    // Get sentence containing the selection
    const sentence = getSentenceFromRange(range, blockElement);

    // Calculate line number and word index
    const { line, wordIndex, offset } = calculatePositionInfo(range, blockElement);

    // Get XPath of the element
    const xpath = getXPath(blockElement);

    sendResponse({
      success: true,
      sentence: sentence,
      line: line,
      wordIndex: wordIndex,
      xpath: xpath,
      offset: offset
    });
  } catch (error) {
    console.error("Error getting word context:", error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Get containing block element (p, div, li, etc.)
function getContainingBlockElement(node) {
  let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

  // Traverse up to find a block-level element
  const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'ARTICLE', 'SECTION', 'BLOCKQUOTE'];

  while (element && element !== document.body) {
    if (blockTags.includes(element.tagName)) {
      return element;
    }
    element = element.parentElement;
  }

  return document.body;
}

// Get sentence containing the selected range
function getSentenceFromRange(range, container) {
  const containerText = container.textContent;
  const rangeStart = getTextOffset(range.startContainer, range.startOffset, container);
  const rangeEnd = getTextOffset(range.endContainer, range.endOffset, container);
  const selectedText = containerText.substring(rangeStart, rangeEnd);

  // Find sentence boundaries
  const sentenceEndRegex = /[.!?。！？\n]/g;
  let sentenceStart = 0;
  let sentenceEnd = containerText.length;

  // Find the sentence end after the selection
  sentenceEndRegex.lastIndex = rangeEnd;
  let match = sentenceEndRegex.exec(containerText);
  if (match) {
    sentenceEnd = match.index + 1;
  }

  // Find the sentence start before the selection
  const textBefore = containerText.substring(0, rangeStart);
  const lastBoundary = Math.max(
    textBefore.lastIndexOf('.'),
    textBefore.lastIndexOf('!'),
    textBefore.lastIndexOf('?'),
    textBefore.lastIndexOf('。'),
    textBefore.lastIndexOf('！'),
    textBefore.lastIndexOf('？'),
    textBefore.lastIndexOf('\n')
  );

  if (lastBoundary !== -1) {
    sentenceStart = lastBoundary + 1;
  }

  let sentence = containerText.substring(sentenceStart, sentenceEnd).trim();

  // Clean up extra whitespace
  sentence = sentence.replace(/\s+/g, ' ');

  return sentence;
}

// Calculate line number and word index within the block element
function calculatePositionInfo(range, container) {
  const containerText = container.textContent;
  const offset = getTextOffset(range.startContainer, range.startOffset, container);

  // Split by newlines to get lines
  const lines = container.innerText.split('\n');
  let cumulativeLength = 0;
  let lineNumber = 1;
  let lineStart = 0;
  let lineEnd = 0;

  // Find which line contains the offset
  for (let i = 0; i < lines.length; i++) {
    lineEnd = lineStart + lines[i].length;
    if (offset >= lineStart && offset <= lineEnd) {
      lineNumber = i + 1;
      break;
    }
    lineStart = lineEnd + 1; // +1 for the newline character
  }

  // Get the line text
  const lineText = lines[lineNumber - 1];

  // Find word index in line
  const lineOffset = offset - lineStart;
  const words = lineText.match(/\b\w+\b/g) || [];
  let wordIndex = 1;
  let currentPos = 0;

  for (let i = 0; i < words.length; i++) {
    const wordStart = lineText.indexOf(words[i], currentPos);
    const wordEnd = wordStart + words[i].length;

    if (lineOffset >= wordStart && lineOffset <= wordEnd) {
      wordIndex = i + 1;
      break;
    }
    currentPos = wordEnd;
  }

  return {
    line: lineNumber,
    wordIndex: wordIndex,
    offset: offset
  };
}

// Get XPath for an element
function getXPath(element) {
  if (!element || element === document.body) {
    return '/html/body';
  }

  const parts = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = element.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = element.tagName.toLowerCase();
    const pathIndex = index > 0 ? `[${index + 1}]` : '';
    parts.unshift(tagName + pathIndex);

    element = element.parentElement;
  }

  return '/' + parts.join('/');
}

// Get text offset of a node within a container
function getTextOffset(node, offset, container) {
  const treeWalker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let currentOffset = 0;
  let currentNode;

  while ((currentNode = treeWalker.nextNode())) {
    if (currentNode === node) {
      return currentOffset + offset;
    }
    currentOffset += currentNode.textContent.length;
  }

  return 0;
}

// Handle request to locate a word in the page
function handleLocateWordInPage(record) {
  try {
    // First try to locate using XPath and position info
    const element = getElementByXPath(record.xpath);

    if (element) {
      const success = highlightWordByPosition(element, record);
      if (success) {
        showToast(`已定位到单词: ${record.word}`);
        return;
      }
    }

    // Fallback: search for the word in the page
    highlightWordBySearch(record.word, record.sentence);
    showToast(`已定位到单词: ${record.word} (使用文本搜索)`);
  } catch (error) {
    console.error("Error locating word:", error);
    showToast("定位失败，请确保在原网页中");
  }
}

// Get element by XPath
function getElementByXPath(xpath) {
  try {
    // Try standard document.evaluate first (more widely supported)
    if (document.evaluate) {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    }
    // Fallback to XPathEvaluator if available
    else if (window.XPathEvaluator) {
      const evaluator = new XPathEvaluator();
      const result = evaluator.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    }
    return null;
  } catch (error) {
    console.warn("XPath evaluation failed:", error);
    return null;
  }
}

// Highlight word using position information
function highlightWordByPosition(element, record) {
  try {
    const text = element.textContent;

    // If we have offset, use it directly
    if (record.offset !== undefined) {
      // Find word boundaries at offset
      const start = findWordStart(text, record.offset);
      const end = findWordEnd(text, record.offset);

      if (start !== -1 && end !== -1) {
        highlightRangeInElement(element, start, end);
        scrollToElement(element);
        return true;
      }
    }

    // Fallback to line and word index
    const lines = element.innerText.split('\n');
    if (record.line > 0 && record.line <= lines.length) {
      const lineText = lines[record.line - 1];
      const words = lineText.match(/\b\w+\b/g) || [];

      if (record.wordIndex > 0 && record.wordIndex <= words.length) {
        const targetWord = words[record.wordIndex - 1];
        const wordIndexInLine = getNthOccurrenceIndex(lineText, targetWord, record.wordIndex);

        if (wordIndexInLine !== -1) {
          // Calculate offset in element
          let lineStartOffset = 0;
          for (let i = 0; i < record.line - 1; i++) {
            lineStartOffset += lines[i].length + 1; // +1 for newline
          }

          const start = lineStartOffset + wordIndexInLine;
          const end = start + targetWord.length;

          highlightRangeInElement(element, start, end);
          scrollToElement(element);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.warn("Position-based highlighting failed:", error);
    return false;
  }
}

// Highlight word by searching in page
function highlightWordBySearch(word, context) {
  // Try to find the word in context first
  const elements = document.querySelectorAll('p, div, li, span, td, th, article, section');

  for (const element of elements) {
    if (element.textContent.includes(word)) {
      // Find the first occurrence
      const text = element.textContent;
      const index = text.indexOf(word);

      if (index !== -1) {
        highlightRangeInElement(element, index, index + word.length);
        scrollToElement(element);
        return true;
      }
    }
  }

  return false;
}

// Helper function to find word start
function findWordStart(text, offset) {
  for (let i = offset; i >= 0; i--) {
    if (!/\w/.test(text[i])) {
      return i + 1;
    }
  }
  return 0;
}

// Helper function to find word end
function findWordEnd(text, offset) {
  for (let i = offset; i < text.length; i++) {
    if (!/\w/.test(text[i])) {
      return i;
    }
  }
  return text.length;
}

// Get index of nth occurrence of a word in text
function getNthOccurrenceIndex(text, word, n) {
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  let count = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    count++;
    if (count === n) {
      return match.index;
    }
  }

  return -1;
}

// Highlight a range within an element
function highlightRangeInElement(element, start, end) {
  // Remove any existing highlights
  removeHighlights();

  // Create a range
  const range = document.createRange();
  const treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let currentOffset = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  let currentNode;

  while ((currentNode = treeWalker.nextNode())) {
    const nodeLength = currentNode.textContent.length;

    if (!startNode && currentOffset + nodeLength > start) {
      startNode = currentNode;
      startOffset = start - currentOffset;
    }

    if (startNode && !endNode && currentOffset + nodeLength >= end) {
      endNode = currentNode;
      endOffset = end - currentOffset;
      break;
    }

    currentOffset += nodeLength;
  }

  if (startNode && endNode) {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    // Create highlight element
    const highlight = document.createElement('span');
    highlight.className = 'locab-highlight';
    highlight.style.backgroundColor = '#ffeb3b';
    highlight.style.color = '#000';
    highlight.style.padding = '2px 0';
    highlight.style.borderRadius = '3px';
    highlight.style.boxShadow = '0 0 0 2px rgba(255, 235, 59, 0.3)';

    // Surround range with highlight
    range.surroundContents(highlight);

    // Auto-remove highlight after 3 seconds
    setTimeout(() => {
      if (highlight.parentNode) {
        const parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
      }
    }, 3000);
  }
}

// Scroll element into view
function scrollToElement(element) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });
}

// Remove all existing highlights
function removeHighlights() {
  const highlights = document.querySelectorAll('.locab-highlight');
  highlights.forEach(highlight => {
    if (highlight.parentNode) {
      const parent = highlight.parentNode;
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    }
  });
}

// Show toast notification
function showToast(message, duration = 3000) {
  // Create toast container if it doesn't exist
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'locab-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    `;
    document.body.appendChild(toastContainer);
  }

  // Create toast
  const toast = document.createElement('div');
  toast.className = 'locab-toast';
  toast.textContent = message;
  toast.style.cssText = `
    background-color: #333;
    color: white;
    padding: 12px 20px;
    margin-bottom: 10px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.3s, transform 0.3s;
  `;

  toastContainer.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  // Auto remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// Initialize content script
(function init() {
  console.log('Locab content script loaded');
})();