chrome.action.onClicked.addListener(async () => {
  // Open the extension UI in a new tab even if not set as the default new tab
  const url = chrome.runtime.getURL('newtab.html');
  await chrome.tabs.create({ url });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-gridmarks') {
    const url = chrome.runtime.getURL('newtab.html');
    await chrome.tabs.create({ url });
  }
});

// Add context menu item for opening Gridmarks
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-gridmarks',
    title: 'Open Gridmarks',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: 'edit-shortcuts',
    title: 'Change keyboard shortcut (default: Alt+T)',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'open-gridmarks') {
    const url = chrome.runtime.getURL('newtab.html');
    await chrome.tabs.create({ url });
  } else if (info.menuItemId === 'edit-shortcuts') {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch (e) {
      // Some environments may block opening chrome:// URLs from extensions.
      // As a fallback, attempt to focus the extensions page; otherwise, no-op.
      console.warn('Unable to open shortcuts page automatically. Please visit chrome://extensions/shortcuts');
    }
  }
});

// Optional: expose a message-based title fetcher that the UI could call later
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FETCH_PAGE_TITLE') {
    const { url } = message;
    // Just try to fetch raw HTML and extract <title> quickly (no CORS in service worker)
    fetch(url, { redirect: 'follow' })
      .then((res) => res.text())
      .then((html) => {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        sendResponse({ ok: true, title });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});

