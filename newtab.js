document.addEventListener('DOMContentLoaded', () => {
    console.log("Document loaded");

    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const modal = document.getElementById('modal');
    const urlInput = document.getElementById('url');
    const titleInput = document.getElementById('title');
    const iconInput = document.getElementById('icon');
    const iconPreview = document.getElementById('iconPreview');
    const saveButton = document.getElementById('save');
    const deleteButton = document.getElementById('delete');
    const cancelButton = document.getElementById('cancel');
    const refreshMetadataButton = document.getElementById('refreshMetadata');
    const toggleIconBgButton = document.getElementById('toggleIconBg');
    const deleteAllButton = document.getElementById('deleteAll');
    const addGroupButton = document.getElementById('addGroup');

    let bookmarks = { "default": [] };
    let groupOrder = ["default"];
    let collapsedGroups = new Set();
    let lastGroupDragAt = 0;
    let modalSessionId = 0;

    // Load bookmarks from storage
    function loadBookmarks() {
        chrome.storage.local.get(['bookmarks', 'groupOrder', 'collapsedGroups'], (result) => {
            if (result.bookmarks) {
                bookmarks = result.bookmarks;
                groupOrder = result.groupOrder || Object.keys(bookmarks);
                const collapsedFromStorage = Array.isArray(result.collapsedGroups) ? result.collapsedGroups : [];
                collapsedGroups = new Set(collapsedFromStorage);
                console.log("Bookmarks loaded:", bookmarks);
                validateBookmarks();
            } else {
                console.log("No bookmarks found in storage. Initializing with default.");
                bookmarks = { "default": [] };
                groupOrder = ["default"];
                collapsedGroups = new Set();
            }
            renderBookmarkGroups();
        });
    }

    // Save bookmarks to storage
    function saveBookmarks() {
        const collapsedArray = Array.from(collapsedGroups);
        chrome.storage.local.set({ bookmarks, groupOrder, collapsedGroups: collapsedArray }, () => {
            console.log("Bookmarks saved");
        });
    }

    // Validate bookmarks structure
    function validateBookmarks() {
        if (typeof bookmarks !== 'object' || bookmarks === null) {
            bookmarks = { "default": [] };
        }
        for (const [groupName, groupBookmarks] of Object.entries(bookmarks)) {
            if (!Array.isArray(groupBookmarks)) {
                bookmarks[groupName] = [];
            }
        }
    }

    // Render groups, incl. title, delete and add new plus button
    function renderBookmarkGroups() {
        console.log("Rendering bookmark groups...");
        bookmarkContainer.innerHTML = '';

        groupOrder.forEach(groupName => {
            if (!bookmarks.hasOwnProperty(groupName)) {
                bookmarks[groupName] = [];
            }
            // start
            const groupElement = document.createElement('div');
            groupElement.className = 'bookmark-group';
            const isCollapsed = collapsedGroups.has(groupName);
            const chevron = isCollapsed ? '►' : '▼';
            groupElement.innerHTML = `
                <div class="group-heading" data-group="${groupName}">
                    <div class="group-title" data-group="${groupName}">
                        <div class="group-toggle" title="${isCollapsed ? 'Expand' : 'Collapse'}" data-group="${groupName}">${chevron}</div>
                        <span class="group-title-text">${groupName}</span>
                        <div class="rename-link" data-group="${groupName}">Rename</div>
                        <div class="delete-link" data-group="${groupName}">Delete</div>
                    </div>
                    <div class="add-bookmark" data-group="${groupName}">+</div>
                </div>
                <div class="bookmarkGrid" id="grid-${groupName}" data-group="${groupName}">
                </div>
            `;
            // Apply collapsed state if needed
            if (collapsedGroups.has(groupName)) {
                groupElement.classList.add('collapsed');
            }
            bookmarkContainer.appendChild(groupElement);
            // end 
            renderBookmarks(groupName);
        });
        // Toggle collapse on left chevron icon
        document.querySelectorAll('.group-toggle').forEach(toggle => {
            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                const heading = event.currentTarget.closest('.group-heading');
                const container = heading?.parentElement; // .bookmark-group
                const groupName = heading?.dataset.group;
                if (!container || !groupName) return;

                const isCollapsed = container.classList.toggle('collapsed');
                const icon = heading.querySelector('.group-toggle');
                if (icon) icon.textContent = isCollapsed ? '►' : '▼';
                if (icon) icon.title = isCollapsed ? 'Expand' : 'Collapse';

                if (isCollapsed) {
                    collapsedGroups.add(groupName);
                } else {
                    collapsedGroups.delete(groupName);
                }
                saveBookmarks();
            });
        });

        // Also toggle collapse on title click (without breaking drag)
        document.querySelectorAll('.group-title-text').forEach(titleEl => {
            titleEl.addEventListener('click', (event) => {
                // If a drag just happened, ignore the click
                const now = Date.now();
                if (now - lastGroupDragAt < 200) return;
                const heading = event.currentTarget.closest('.group-heading');
                const container = heading?.parentElement; // .bookmark-group
                const groupName = heading?.dataset.group;
                if (!container || !groupName) return;

                const isCollapsed = container.classList.toggle('collapsed');
                const icon = heading.querySelector('.group-toggle');
                if (icon) icon.textContent = isCollapsed ? '►' : '▼';
                if (icon) icon.title = isCollapsed ? 'Expand' : 'Collapse';

                if (isCollapsed) collapsedGroups.add(groupName);
                else collapsedGroups.delete(groupName);
                saveBookmarks();
            });
        });

        document.querySelectorAll('.add-bookmark').forEach(button => {
            button.addEventListener('click', (event) => {
                const groupName = event.target.dataset.group;
                openAddModal(groupName);
            });
        });

        // Add Rename click handler
        document.querySelectorAll('.rename-link').forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const heading = event.currentTarget.closest('.group-heading');
                if (heading) enableGroupTitleEditing(heading);
            });
        });

        document.querySelectorAll('.delete-link').forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const groupName = event.target.dataset.group;
                console.log(groupName); // Check if groupName is captured correctly
                deleteGroup(groupName);
            });
        });

        // Initialize Sortable.js for each grid
        initializeSortable();
        // Initialize group sorting
        initializeGroupSortable();
    }

    // Function to delete a group
    function deleteGroup(groupName) {
        console.log(`Clicked Delete Group: ${groupName}`);
        if (confirm(`Are you sure you want to delete the group "${groupName}"?`)) {
            delete bookmarks[groupName];
            groupOrder = groupOrder.filter(name => name !== groupName);
            collapsedGroups.delete(groupName);
            saveBookmarks();
            renderBookmarkGroups();
        }
    }

    // Ensure the groups are rendered when the document is fully loaded

    // Render bookmarks to the specific group grid
    function renderBookmarks(groupName) {
        const bookmarkGrid = document.getElementById(`grid-${groupName}`);
        bookmarkGrid.innerHTML = '';
        bookmarks[groupName].forEach((bookmark, index) => {
            const bookmarkElement = createBookmarkElement(groupName, bookmark, index);
            bookmarkGrid.appendChild(bookmarkElement);
        });
    }

    // Create a bookmark element
    function createBookmarkElement(groupName, bookmark, index) {
        const bookmarkElement = document.createElement('div');
        bookmarkElement.className = 'bookmark';
        bookmarkElement.draggable = true;
        bookmarkElement.dataset.index = index;
        bookmarkElement.dataset.group = groupName;
        bookmarkElement.innerHTML = `
            <div class="bookmark-actions">
                <button class="edit-bookmark" title="Edit">✎</button>
            </div>
            <img src="${bookmark.icon}" alt="${bookmark.title}">
            <div class="title">${bookmark.title}</div>
        `;
        // Apply white background to icon if configured and set fallback
        const imgEl = bookmarkElement.querySelector('img');
        if (imgEl) {
            if (bookmark.whiteBg) {
                imgEl.classList.add('white-bg');
            }
            const fallback = faviconServiceUrlForDomain(getDomainFromUrl(bookmark.url), 128);
            imgEl.addEventListener('error', () => {
                if (fallback && imgEl.src !== fallback) {
                    imgEl.src = fallback;
                    bookmarks[groupName][index].icon = fallback;
                    saveBookmarks();
                }
            });
        }
        bookmarkElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            openEditModal(groupName, index);
        });
        bookmarkElement.addEventListener('click', () => {
            window.location.href = bookmark.url.startsWith('http') ? bookmark.url : 'https://' + bookmark.url;
        });
        const editBtn = bookmarkElement.querySelector('.edit-bookmark');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openEditModal(groupName, index);
            });
        }
        return bookmarkElement;
    }

    // Initialize Sortable.js for all grids
    function initializeSortable() {
        const grids = document.querySelectorAll('.bookmarkGrid');
        grids.forEach(grid => {
            new Sortable(grid, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                group: 'shared',
                onStart: (event) => {
                    event.item.classList.add('dragging');
                },
                onEnd: (event) => {
                    event.item.classList.remove('dragging');

                    const oldGroup = event.from.dataset.group;
                    const newGroup = event.to.dataset.group;

                    const oldIndex = event.oldIndex;
                    const newIndex = event.newIndex;

                    if (oldGroup !== newGroup) {
                        const [movedItem] = bookmarks[oldGroup].splice(oldIndex, 1);
                        bookmarks[newGroup].splice(newIndex, 0, movedItem);
                        // Re-render both affected groups to refresh indices and handlers
                        renderBookmarks(oldGroup);
                        renderBookmarks(newGroup);
                    } else {
                        const [movedItem] = bookmarks[oldGroup].splice(oldIndex, 1);
                        bookmarks[oldGroup].splice(newIndex, 0, movedItem);
                         // Re-render the group to refresh indices and handlers
                        renderBookmarks(oldGroup);
                    }

                    saveBookmarks();
                }
            });
        });
    }

    // Enable inline editing for group title
    function enableGroupTitleEditing(headingElement) {
        const heading = headingElement.closest('.group-heading');
        const groupName = heading?.dataset.group;
        if (!groupName) return;

        const titleContainer = heading.querySelector('.group-title');
        if (!titleContainer) return;

        // Find the explicit title element
        const titleTextEl = titleContainer.querySelector('.group-title-text');
        const currentTitle = titleTextEl ? titleTextEl.textContent.trim() : groupName;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'edit-group-heading';
        if (titleTextEl) titleTextEl.textContent = '';
        titleContainer.insertBefore(input, titleContainer.firstChild);

        // Optionally hide action links while renaming to avoid accidental clicks
        const deleteLink = titleContainer.querySelector('.delete-link');
        const renameLink = titleContainer.querySelector('.rename-link');
        if (deleteLink) deleteLink.style.display = 'none';
        if (renameLink) renameLink.style.display = 'none';

        input.focus();

        let isRenaming = false;

        const handleBlur = () => {
            if (!isRenaming) {
                isRenaming = true;
                saveGroupTitle(input, groupName, currentTitle);
                cleanUp();
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Enter' && !isRenaming) {
                event.preventDefault();
                isRenaming = true;
                saveGroupTitle(input, groupName, currentTitle);
                cleanUp();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelGroupTitleEditing(titleContainer, input, currentTitle);
                cleanUp();
            }
        };

        const cleanUp = () => {
            input.removeEventListener('blur', handleBlur);
            input.removeEventListener('keydown', handleKeyDown);
            if (deleteLink) deleteLink.style.display = '';
            if (renameLink) renameLink.style.display = '';
        };

        input.addEventListener('blur', handleBlur);
        input.addEventListener('keydown', handleKeyDown);
    }


    // Save the new group title
    function saveGroupTitle(input, oldGroupName, currentTitle) {
        const newGroupName = input.value.trim();
        console.log("Attempting to rename group from", oldGroupName, "to", newGroupName);
    
        if (newGroupName && newGroupName !== oldGroupName) {
            if (!bookmarks.hasOwnProperty(newGroupName)) {
                console.log("Renaming group to new name:", newGroupName);
                bookmarks[newGroupName] = bookmarks[oldGroupName];
                delete bookmarks[oldGroupName];
    
                const index = groupOrder.indexOf(oldGroupName);
                if (index !== -1) {
                    groupOrder[index] = newGroupName;
                }
                // Preserve collapsed state for renamed group
                if (collapsedGroups.has(oldGroupName)) {
                    collapsedGroups.delete(oldGroupName);
                    collapsedGroups.add(newGroupName);
                }
    
                saveBookmarks();
                renderBookmarkGroups();
            } else {
                console.log("Group name already exists:", newGroupName);
                alert("Group name already exists.");
                cancelGroupTitleEditing(input.parentElement, input, currentTitle);
            }
        } else {
            console.log("New group name is invalid or the same as the old group name");
            cancelGroupTitleEditing(input.parentElement, input, currentTitle);
        }
    }
    

    // Cancel group title editing
    function cancelGroupTitleEditing(titleContainer, input, currentTitle) {
        // Restore title text and remove input
        if (titleContainer && input && titleContainer.contains(input)) {
            input.remove();
        }
        // Restore the text inside the explicit title span
        const titleTextEl = titleContainer?.querySelector('.group-title-text');
        if (titleTextEl) titleTextEl.textContent = currentTitle;
    }

    // Initialize Sortable.js for group containers (reordering groups)
    function initializeGroupSortable() {
        new Sortable(bookmarkContainer, {
            animation: 150,
            draggable: '.bookmark-group',
            handle: '.group-title-text',
            onStart: (evt) => {
                const handle = evt.item.querySelector('.group-title-text');
                if (handle) handle.classList.add('dragging');
            },
            onEnd: (evt) => {
                const handle = evt.item.querySelector('.group-title-text');
                if (handle) handle.classList.remove('dragging');

                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex === newIndex || oldIndex == null || newIndex == null) return;

                const [movedGroup] = groupOrder.splice(oldIndex, 1);
                groupOrder.splice(newIndex, 0, movedGroup);
                saveBookmarks();
                renderBookmarkGroups();
                lastGroupDragAt = Date.now();
            }
        });
    }


    // Open the modal for adding a new bookmark
    function openAddModal(groupName) {
        console.log("Add modal opened for group:", groupName);
        modalSessionId++;
        urlInput.value = '';
        titleInput.value = '';
        iconInput.value = '';
        if (iconPreview) { iconPreview.src = ''; iconPreview.style.display = 'none'; iconPreview.classList.remove('white-bg'); }
        isCancelled = false;
        saveButton.disabled = false; // Ensure save button is enabled when modal opens
        saveButton.onclick = () => saveNewBookmark(groupName);
        deleteButton.style.display = 'none'; // Hide the delete button for new bookmarks
        refreshMetadataButton.style.display = 'none';
        toggleIconBgButton.style.display = 'none';
        // Clear any previous async handlers to avoid leaking state between sessions
        refreshMetadataButton.onclick = null;
        toggleIconBgButton.onclick = null;
        modal.style.display = 'flex';

        // Add keydown event listener for Enter and Escape keys
        document.addEventListener('keydown', handleKeyDown);

        // Autofocus URL field
        setTimeout(() => urlInput.focus(), 0);
    }

    // Open the modal for editing an existing bookmark
    function openEditModal(groupName, index) {
        console.log("Edit modal opened for group:", groupName, "index:", index);
        modalSessionId++;
        const bookmark = bookmarks[groupName][index];
        urlInput.value = bookmark.url;
        titleInput.value = bookmark.title;
        iconInput.value = bookmark.icon;
        if (iconPreview) {
            iconPreview.src = bookmark.icon;
            iconPreview.style.display = 'inline-block';
            if (bookmark.whiteBg) iconPreview.classList.add('white-bg');
            else iconPreview.classList.remove('white-bg');
        }
        isCancelled = false;
        saveButton.disabled = false; // Ensure save button is enabled when modal opens
        saveButton.onclick = () => saveEditedBookmark(groupName, index);
        deleteButton.onclick = () => deleteBookmark(groupName, index); // Set the delete button's onclick handler
        deleteButton.style.display = 'inline-block'; // Show the delete button for editing bookmarks
        refreshMetadataButton.style.display = 'inline-block';
        toggleIconBgButton.style.display = 'inline-block';
        // Wire refresh metadata for current URL
        refreshMetadataButton.onclick = async (e) => {
            e.preventDefault();
            if (!urlInput.value.trim()) return;
            // For refresh: spinner only, no text
            setButtonLoading(refreshMetadataButton, true, '');
            try {
                const { title, icon } = await fetchMetadata(urlInput.value.trim());
                // If modal session changed (user opened another modal), ignore this result
                const currentSession = modalSessionId;
                if (e && e.isTrusted && currentSession !== modalSessionId) return;
                if (!titleInput.value.trim()) titleInput.value = title;
                iconInput.value = icon;
                // Update preview with fallback handling if needed
                if (iconPreview) {
                    iconPreview.onerror = null; // reset any prior handler
                }
                // Sync preview via helper (adds error fallback to favicon service)
                if (typeof updateIconPreviewAccordingToInputs === 'function') {
                    updateIconPreviewAccordingToInputs();
                }
            } catch (e) {
                console.error('Failed to refresh metadata', e);
            } finally {
                setButtonLoading(refreshMetadataButton, false);
            }
        };
        // Toggle white background behind icon preview
        toggleIconBgButton.onclick = (e) => {
            e.preventDefault();
            if (!iconPreview) return;
            iconPreview.classList.toggle('white-bg');
            // Persist the preference on the bookmark being edited
            const isWhite = iconPreview.classList.contains('white-bg');
            bookmarks[groupName][index].whiteBg = isWhite;
            saveBookmarks();
        };
        modal.style.display = 'flex';

        // Add keydown event listener for Enter and Escape keys
        document.addEventListener('keydown', handleKeyDown);
    }

    // Handle keydown events for Enter and Escape keys
    function handleKeyDown(event) {
        if (event.key === 'Enter') {
            console.log("Pressed 'Enter'");
            event.preventDefault();
            saveButton.click();
        } else if (event.key === 'Escape') {
            console.log("Pressed 'Escape'");
            event.preventDefault();
            cancelButton.click();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            // Trigger delete only in edit mode and when not typing inside an input/textarea/contentEditable
            const target = event.target;
            const isEditableTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            const isDeleteVisible = deleteButton && deleteButton.style.display !== 'none';
            if (!isEditableTarget && isDeleteVisible) {
                console.log("Pressed 'Delete/Backspace' - deleting bookmark");
                event.preventDefault();
                deleteButton.click();
            }
        }
    }

    // Fetch title and best available site icon (prefers large apple-touch/manifest icons; falls back to favicon services)
    async function fetchMetadata(url) {
        // Helpers
        const toAbsoluteUrl = (baseUrl, href) => {
            try { return new URL(href, baseUrl).href; } catch { return null; }
        };
        const parseSize = (sizesAttr) => {
            if (!sizesAttr) return 0;
            // sizes may be like "192x192 512x512"; pick the largest
            const parts = sizesAttr.split(/\s+/).map(s => s.trim()).filter(Boolean);
            let max = 0;
            for (const p of parts) {
                const [w, h] = p.split('x').map(n => parseInt(n, 10));
                if (!isNaN(w) && !isNaN(h)) max = Math.max(max, Math.max(w, h));
            }
            return max;
        };
        const addCandidate = (arr, href, size, baseUrl) => {
            const abs = toAbsoluteUrl(baseUrl, href);
            if (abs) arr.push({ url: abs, size: size || 0 });
        };

        try {
            // Normalize URL
            const normalized = url.startsWith('http') ? url : 'https://' + url;
            const pageUrl = new URL(normalized);

            // Fetch page HTML via CORS proxy
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl.href)}`);
            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            // Title
            const titleTag = doc.querySelector('title');
            const title = titleTag ? titleTag.textContent : pageUrl.hostname;

            // Collect icon candidates
            const iconCandidates = [];

            // 1) Web App Manifest icons
            try {
                const manifestLink = doc.querySelector('link[rel="manifest"]');
                if (manifestLink && manifestLink.getAttribute('href')) {
                    const manifestHref = toAbsoluteUrl(pageUrl.href, manifestLink.getAttribute('href'));
                    if (manifestHref) {
                        const manRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(manifestHref)}`);
                        const manifestJson = await manRes.json();
                        const icons = Array.isArray(manifestJson.icons) ? manifestJson.icons : [];
                        for (const icon of icons) {
                            const size = parseSize(icon.sizes) || 0;
                            if (icon.src) addCandidate(iconCandidates, icon.src, size, manifestHref);
                        }
                    }
                }
            } catch (e) {
                // ignore manifest fetch/parse errors
            }

            // 2) Apple touch icons and other link rel icons (prefer large sizes)
            const linkSelectors = [
                'link[rel~="apple-touch-icon"]',
                'link[rel~="apple-touch-icon-precomposed"]',
                'link[rel~="icon"]',
                'link[rel~="shortcut icon"]',
                'link[rel~="mask-icon"]'
            ];
            doc.querySelectorAll(linkSelectors.join(',')).forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                const sizesAttr = link.getAttribute('sizes');
                const size = parseSize(sizesAttr) || 0;
                addCandidate(iconCandidates, href, size, pageUrl.href);
            });

            // 3) If no candidates yet, try conventional /favicon.ico
            if (iconCandidates.length === 0) {
                addCandidate(iconCandidates, '/favicon.ico', 32, pageUrl.origin + '/');
            }

            // Choose the largest candidate
            iconCandidates.sort((a, b) => b.size - a.size);
            let icon = iconCandidates.length > 0 ? iconCandidates[0].url : '';

            // Fallback to Google's S2 favicon service with size hint
            if (!icon) {
                icon = `https://www.google.com/s2/favicons?domain=${pageUrl.hostname}&sz=128`;
            }

            return { title, icon };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            try {
                const normalized = url.startsWith('http') ? url : 'https://' + url;
                const parsed = new URL(normalized);
                return { title: parsed.hostname, icon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128` };
            } catch {
                return { title: url, icon: '' };
            }
        }
    }

    // Helpers for icon fallbacks and preview
    function getDomainFromUrl(url) {
        try {
            const normalized = url.startsWith('http') ? url : 'https://' + url;
            return new URL(normalized).hostname;
        } catch { return ''; }
    }

    function faviconServiceUrlForDomain(domain, size = 128) {
        if (!domain) return '';
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
    }

    function updateIconPreviewAccordingToInputs() {
        if (!iconPreview) return;
        const currentIcon = iconInput.value.trim();
        if (!currentIcon) {
            iconPreview.src = '';
            iconPreview.style.display = 'none';
            return;
        }
        const domain = getDomainFromUrl(urlInput.value.trim());
        const fallback = faviconServiceUrlForDomain(domain, 128);
        iconPreview.style.display = 'inline-block';
        iconPreview.onerror = () => {
            if (fallback && iconPreview.src !== fallback) {
                iconPreview.src = fallback;
                iconInput.value = fallback;
            } else {
                iconPreview.style.display = 'none';
            }
        };
        iconPreview.src = currentIcon;
    }

    let isCancelled = false;

    // Render utility: replace button content with spinner + text, preserving size
    function setButtonLoading(button, isLoading, textWhenLoading) {
        if (!button) return;
        if (isLoading) {
            const rect = button.getBoundingClientRect();
            // Save original state once
            if (!button.dataset._origHtml) button.dataset._origHtml = button.innerHTML;
            if (!button.dataset._origH) button.dataset._origH = button.style.height || '';
            // Lock height only to avoid vertical layout shift
            button.style.height = rect.height + 'px';
            button.disabled = true;
            const textPart = textWhenLoading ? `<span>${textWhenLoading}</span>` : '';
            button.innerHTML = `<span class="btn-spinner-content"><span class="spinner"></span>${textPart}</span>`;
        } else {
            button.disabled = false;
            if (button.dataset._origHtml) {
                button.innerHTML = button.dataset._origHtml;
                delete button.dataset._origHtml;
            }
            // Restore original height
            if (button.dataset._origH !== undefined) {
                button.style.height = button.dataset._origH;
                delete button.dataset._origH;
            }
        }
    }

    // Save a new bookmark
    async function saveNewBookmark(groupName) {
    console.log("Saving new bookmark in group:", groupName);
    let url = urlInput.value.trim();
    let title = titleInput.value.trim();
    let icon = iconInput.value.trim();

    // Ensure the URL includes the https:// prefix
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (!url) {
        alert('URL is required');
        resetModal();
        return;
    }

    // Disable the save button and show loading spinner
    setButtonLoading(saveButton, true, 'Saving…');
    console.log("Save button disabled and loading spinner shown");

    if (!title || !icon) {
        const metadata = await fetchMetadata(url);
    if (isCancelled) {
            console.log("Save operation cancelled during metadata fetch");
            resetModal();
            return;
        }
        title = title || metadata.title;
        icon = icon || metadata.icon;
    }

    if (isCancelled) {
        console.log("Save operation cancelled before pushing bookmark");
        resetModal();
        return;
    }

    bookmarks[groupName].push({ url, title, icon, whiteBg: false });
    saveBookmarks();
    renderBookmarks(groupName);
    resetModal();
    closeModal();
    console.log("New bookmark saved successfully");
    }

    // Save an edited bookmark
    async function saveEditedBookmark(groupName, index) {
    console.log("Saving edited bookmark in group:", groupName, "at index:", index);
    let url = urlInput.value.trim();
    let title = titleInput.value.trim();
    let icon = iconInput.value.trim();

    // Ensure the URL includes the https:// prefix
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (!url) {
        alert('URL is required');
        resetModal();
        return;
    }

    // Disable the save button and show loading spinner
    setButtonLoading(saveButton, true, 'Saving…');
    console.log("Save button disabled and loading spinner shown");

    if (!title || !icon) {
        const metadata = await fetchMetadata(url);
    if (isCancelled) {
            console.log("Save operation cancelled during metadata fetch");
            resetModal();
            return;
        }
        title = title || metadata.title;
        icon = icon || metadata.icon;
    }

    if (isCancelled) {
        console.log("Save operation cancelled before updating bookmark");
        resetModal();
        return;
    }

    bookmarks[groupName][index] = { url, title, icon, whiteBg: iconPreview && iconPreview.classList.contains('white-bg') };
    saveBookmarks();
    renderBookmarks(groupName);
    resetModal();
    closeModal();
    console.log("Edited bookmark saved successfully");
    }

    // Cancel the modal
    cancelButton.onclick = () => {
        isCancelled = true;
        console.log("Cancel button clicked, isCancelled set to true");
        resetModal();
        closeModal();
        console.log("After cancel button clicked, modal closed");
    };

    // Close the modal and remove keydown event listener
    function closeModal() {
        console.log("Modal closed");
        modal.style.display = 'none';
        document.removeEventListener('keydown', handleKeyDown);
        if (iconPreview) { iconPreview.src = ''; iconPreview.style.display = 'none'; iconPreview.classList.remove('white-bg'); }
        // Restore save button
        setButtonLoading(saveButton, false);
        // Invalidate any pending async work tied to the previous modal session
        modalSessionId++;
    }
        
// Reset modal to default state
function resetModal() {
    console.log("Resetting modal to default state");
    saveButton.disabled = false; // Re-enable the save button
    document.getElementById('loadingIndicator').style.display = 'none'; // Hide loading indicator
    isCancelled = false; // Reset cancellation flag
}
    
    // [duplicate fetchMetadata removed]
    
    // Delete a bookmark
    function deleteBookmark(groupName, index) {
        console.log("Deleting bookmark in group:", groupName, "at index:", index);
        const confirmed = confirm("Are you sure you want to delete this bookmark?");
        if (!confirmed) {
            return;
        }
        bookmarks[groupName].splice(index, 1);
        saveBookmarks();
        renderBookmarks(groupName);
        closeModal();
    }

    // Delete all bookmarks
    function deleteAllBookmarks() {

        if (confirm("Are you sure you want to delete all bookmarks?")) {
            console.log("Deleting all bookmarks");
            bookmarks = { "default": [] };
            groupOrder = ["default"];
            saveBookmarks();
            renderBookmarkGroups();
        }
    }

    // Add a new group
    function addGroup() {
        console.log("Add Group clicked");
        const groupName = prompt("Enter group name:");
        if (groupName && !bookmarks.hasOwnProperty(groupName)) {
            bookmarks[groupName] = [];
            groupOrder.push(groupName);
            saveBookmarks();
            renderBookmarkGroups();
        } else if (groupName) {
            alert("Group name already exists.");
        }

    }

    // [duplicate cancel handler and closeModal removed]

    // Export bookmarks as JSON (includes groupOrder and collapsedGroups)
    function exportBookmarks() {
        const exportPayload = { version: 3, bookmarks, groupOrder, collapsedGroups: Array.from(collapsedGroups) };
        const bookmarksJson = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([bookmarksJson], { type: 'application/json' });

        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day} ${hours}${minutes}${seconds}`;
        const filename = `bookmarks ${formattedDate}.json`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Import bookmarks from JSON (supports legacy and new formats)
    function importBookmarks(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);

                    if (imported && typeof imported === 'object' && imported.bookmarks) {
                        // New format with bookmarks and groupOrder
                        const importedBookmarks = imported.bookmarks;
                        for (const group in importedBookmarks) {
                            if (!Array.isArray(importedBookmarks[group])) {
                                importedBookmarks[group] = [];
                            }
                        }
                        bookmarks = importedBookmarks;
                        groupOrder = Array.isArray(imported.groupOrder) ? imported.groupOrder : Object.keys(bookmarks);
                        collapsedGroups = new Set(Array.isArray(imported.collapsedGroups) ? imported.collapsedGroups : []);
                    } else if (Array.isArray(imported)) {
                        // Legacy format: array of bookmarks for default group
                        bookmarks = { "default": imported };
                        groupOrder = ["default"];
                        collapsedGroups = new Set();
                    } else if (imported && typeof imported === 'object') {
                        // Legacy object format: groups mapped to arrays
                        for (const group in imported) {
                            if (!Array.isArray(imported[group])) {
                                imported[group] = [];
                            }
                        }
                        bookmarks = imported;
                        groupOrder = Object.keys(bookmarks);
                        collapsedGroups = new Set();
                    } else {
                        console.error("Invalid bookmarks format.");
                    }
                    chrome.storage.local.set({ bookmarks, groupOrder, collapsedGroups: Array.from(collapsedGroups) }, () => {
                        console.log("Bookmarks imported:", bookmarks);
                        renderBookmarkGroups();
                    });
                } catch (error) {
                    console.error("Error reading bookmarks file:", error);
                }
            };
            reader.readAsText(file);
        }
    }

    // Trigger file input click when import button is clicked
    function triggerFileInput() {
        document.getElementById('importFile').click();
    }

    // Add event listeners
    document.getElementById('exportBookmarks').addEventListener('click', exportBookmarks);
    document.getElementById('importBookmarks').addEventListener('click', triggerFileInput);
    document.getElementById('importFile').addEventListener('change', importBookmarks);
    deleteAllButton.addEventListener('click', deleteAllBookmarks);
    addGroupButton.addEventListener('click', addGroup);
    // Keep preview in sync when user edits icon URL manually
    iconInput.addEventListener('input', () => {
        if (typeof updateIconPreviewAccordingToInputs === 'function') {
            updateIconPreviewAccordingToInputs();
        }
    });
    // Close modal when clicking outside content (same as cancel)
    modal.addEventListener('mousedown', (e) => {
        const content = document.getElementById('modalContent');
        if (e.target === modal && content && !content.contains(e.target)) {
            // Simulate cancel
            if (typeof cancelButton.click === 'function') cancelButton.click();
        }
    });

    
    // Load bookmarks initially
    loadBookmarks();
    
    
});
