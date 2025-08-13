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

