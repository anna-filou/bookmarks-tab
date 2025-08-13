# Bookmarks tab

A Chrome Extension that replaces the new tab page with a grid of bookmarks. 

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/ofijmedbafaffedkkhpgandnchdnbgoo) or download all files on this repo and “Load unpacked” from `chrome://extensions`.

You can also launch it by clicking the extension’s icon or pressing `Alt+T`, which will work even if you don't want to set it as your newtab. You can change the keyboard shortcut from `chrome://extensions/shortcuts`.

## How to use

- **Add bookmark**: press the “+” icon on the right of a group’s title.
  - Only a URL is needed. The title and icon are pulled automatically (tries web app manifest and apple-touch icons; falls back to favicons).
  - You can replace the icon with a custom image URL.
- **Edit or delete bookmark**: hover a bookmark and click the edit button (✎), or right click it. Delete from the edit modal.
- **Refresh metadata**: in the edit modal click the 🔁 button to fetch title/icon again. A preview shows the current icon.
- **Icon background**: in the edit modal click “BG” to toggle a white background behind the icon (useful for dark transparent PNGs). This is saved per bookmark and reflected on the main page.
- **Reorder bookmarks**: drag and drop (works across groups!).
- **Add a group**: Click on the “**Add Group**” button on the bottom of the page.
- **Rename group**: hover the group title and click “Rename”.
- **Reorder groups**: drag the group title.
- **Collapse/expand groups**: click the chevron (►/▼) or the group title to toggle. State persists.

### Backup / Export / Import

- Click on the “**Export Bookmarks**” button on the bottom of the page. It saves a JSON file containing your bookmarks, their group order, which groups are collapsed, and per-bookmark white background preferences.
- Click on “**Import Bookmarks**” and select the JSON file to restore them.

## Known issues (bugs)
- None


## Credits
The JS was written by ChatGPT 4o and only slightly tweaked by me. 
I did the styling / wrote the CSS.

### Third-party resources used

- [Sortable.JS](https://github.com/SortableJS/Sortable) (MIT License)
- [AllOrigins](https://allorigins.win) CORS proxy for metadata fetching
- Google S2 Favicon service for fallback favicons