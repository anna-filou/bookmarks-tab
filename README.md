# Bookmarks tab

A Chrome Extension that replaces the new tab page with a customizable grid of bookmarks.

## How to use

- **Add bookmark**: press the “+” icon on the right of a group’s title.
   - Only a URL is needed. The title and icon are pulled automatically. 
   - You can replace the icon with a custom image URL. (Find an image online → Right click → “Copy image address”.)
- **Edit or delete bookmark**: right click on bookmark.
- **Reorder bookmarks**: drag and drop (works across groups!)
- **Add a group**: Click on the “**Add Group**” button on the bottom of the page.
- **Rename group**: right click on title.

### Backup / Export / Import

- Click on the “**Export Bookmarks**” button on the bottom of the page. It’ll save a JSON file with the bookmarks in their respective groups.
- Click on “**Import Bookmarks**” and select the JSON file to restore them. 

## Known issues (bugs)
- Sometimes adding a bookmark takes a very long time. I think it has something to do with Clearbit.
- Groups cannot be reordered via the UI.
- The order of the groups is not preserved in exports. 
   - Workaround: open the JSON file with a text editor and manually change the order. 
- SVG icons/favicons are not renedered.


## Credits
The JS was written by ChatGPT 4o and only slightly tweaked by me. 
I did the styling / wrote the CSS.

### Third-party resources used

- [Sortable.JS](https://github.com/SortableJS/Sortable) (MIT License)
- [Clearbit](https://clearbit.com/) logo search
- [Remix Icon](https://remixicon.com/) for logo (Apache License)