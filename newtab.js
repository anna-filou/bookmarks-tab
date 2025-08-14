document.addEventListener('DOMContentLoaded', () => {
    console.log("Document loaded");

    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const modal = document.getElementById('modal');
    const modalContentEl = document.getElementById('modalContent');
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
    // Track fastest proxy per host to order future races
    const fastestProxyByHost = new Map();

    // Modal saving overlay helpers
    function showModalSavingState() {
        if (!modalContentEl) return;
        // If already shown, do nothing
        if (modalContentEl.querySelector('.modal-saving')) return;
        // Hide existing children
        Array.from(modalContentEl.children).forEach(child => {
            if (child.classList && child.classList.contains('modal-saving')) return;
            child.dataset._prevDisplay = child.style.display || '';
            child.setAttribute('data-hidden-for-saving', '1');
            child.style.display = 'none';
        });
        // Add saving view
        const saving = document.createElement('div');
        saving.className = 'modal-saving';
        saving.innerHTML = '<span class="spinner"></span><span>Saving…</span>';
        modalContentEl.appendChild(saving);
    }

    function restoreModalContent() {
        if (!modalContentEl) return;
        // Remove saving view if present
        const saving = modalContentEl.querySelector('.modal-saving');
        if (saving) saving.remove();
        // Unhide original children
        Array.from(modalContentEl.children).forEach(child => {
            if (child.hasAttribute('data-hidden-for-saving')) {
                child.style.display = child.dataset._prevDisplay || '';
                delete child.dataset._prevDisplay;
                child.removeAttribute('data-hidden-for-saving');
            }
        });
    }

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
        if (!bookmarkGrid) {
            console.warn('renderBookmarks: grid element not found for group', groupName);
            // Recover by fully re-rendering groups once
            renderBookmarkGroups();
            return;
        }
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
    async function fetchMetadata(url, externalSignal) {
        // Timing + logging helpers
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = () => Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        const ts = () => `+${elapsedMs()}ms @ ${new Date().toISOString()}`;
        const logI = (label, data) => console.log(`fetchMetadata ${ts()} ${label}`, data);
        const logW = (label, data) => console.warn(`fetchMetadata ${ts()} ${label}`, data);
        const logE = (label, data) => console.error(`fetchMetadata ${ts()} ${label}`, data);
        // Helpers
        const fetchWithTimeout = async (resource, { responseType = 'text', externalSignal } = {}) => {
            const controller = new AbortController();
            const onExternalAbort = () => controller.abort();
            if (externalSignal) {
                if (externalSignal.aborted) controller.abort();
                else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
            }
            try {
                const res = await fetch(resource, { signal: controller.signal });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    logW('non-OK response', { resource, status: res.status, bodySnippet: body.slice(0, 200) });
                    throw new Error(`HTTP ${res.status}`);
                }
                if (responseType === 'json') return await res.json();
                return await res.text();
            } finally {
                if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
            }
        };
        const raceHtmlViaProxiesAny = async (targetUrl, externalSignal) => {
            const host = (() => { try { return new URL(targetUrl).hostname; } catch { return ''; } })();
            const proxies = [
                { key: 'jina', url: withNoCache(`https://r.jina.ai/${targetUrl}`) },
                { key: 'ao',   url: withNoCache(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`) }
            ];
            // Reorder based on fastest proxy observed for this host
            const prefKey = fastestProxyByHost.get(host);
            const ordered = prefKey ? [
                ...proxies.filter(p => p.key === prefKey),
                ...proxies.filter(p => p.key !== prefKey)
            ] : proxies;
            const endpointControllers = ordered.map(() => new AbortController());
            // Propagate outer abort to all endpoints
            const outerAbortHandlers = [];
            if (externalSignal) {
                const forwardAbort = () => endpointControllers.forEach(c => c.abort());
                externalSignal.addEventListener('abort', forwardAbort);
                outerAbortHandlers.push({ forwardAbort });
            }
            let settled = false;
            const attempts = ordered.map((p, idx) => {
                logI('trying proxy', { endpoint: p.url });
                return fetchWithTimeout(p.url, { responseType: 'text', externalSignal: endpointControllers[idx].signal })
                    .then(html => {
                        logI('proxy success', { endpoint: p.url, length: html.length });
                        return { html, endpoint: p.url, idx, key: p.key };
                    })
                    .catch(err => {
                        logW('proxy failed', { endpoint: p.url, error: String(err) });
                        throw err;
                    });
            });
            try {
                const winner = await Promise.any(attempts);
                if (!settled) {
                    settled = true;
                    // Abort losers except keep AllOrigins running if Jina won (we may need raw HTML for icons)
                    endpointControllers.forEach((c, i) => {
                        const isWinner = i === winner.idx;
                        const loserKey = ordered[i]?.key;
                        const keepRunning = (winner.key === 'jina' && loserKey === 'ao');
                        if (!isWinner && !keepRunning) {
                            try { c.abort(); } catch {}
                        }
                    });
                }
                // Save fastest proxy key for host
                if (host && winner.key) fastestProxyByHost.set(host, winner.key);
                // Also return a pending AllOrigins promise if Jina won
                let pendingAllOriginsPromise = null;
                if (winner.key === 'jina') {
                    const aoIdx = ordered.findIndex(p => p.key === 'ao');
                    if (aoIdx !== -1) {
                        pendingAllOriginsPromise = attempts[aoIdx].catch(() => null);
                    }
                }
                return { html: winner.html, endpoint: winner.endpoint, pendingAllOriginsPromise };
            } catch (aggregate) {
                throw new Error('All proxy attempts failed');
            } finally {
                // Cleanup outer abort listeners
                if (externalSignal && outerAbortHandlers.length) {
                    try { externalSignal.removeEventListener('abort', outerAbortHandlers[0].forwardAbort); } catch {}
                }
            }
        };

        // Fetch only the <head> of the raw HTML via AllOrigins and stop reading as soon as </head> is seen (no timeouts)
        const fetchHeadHtmlViaAllOrigins = async (targetUrl, externalSignal) => {
            const endpoint = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`; // allow proxy cache
            logI('head fetch: starting', { endpoint });
            const controller = new AbortController();
            const onExternalAbort = () => controller.abort();
            if (externalSignal) {
                if (externalSignal.aborted) controller.abort();
                else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
            }
            try {
                const res = await fetch(endpoint, { signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                if (!res.body || !res.body.getReader) {
                    const full = await res.text();
                    logI('head fetch: no stream, using full text', { length: full.length });
                    return full;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let done = false;
                let buffer = '';
                let bytes = 0;
                const MAX_BYTES = 512 * 1024; // 512KB cap to avoid huge reads
                while (!done) {
                    const { value, done: rdDone } = await reader.read();
                    done = rdDone;
                    if (value && value.length) {
                        bytes += value.length;
                        buffer += decoder.decode(value, { stream: true });
                        const lower = buffer.toLowerCase();
                        const idx = lower.indexOf('</head>');
                        if (idx !== -1) {
                            const headHtml = buffer.slice(0, idx + 7);
                            try { controller.abort(); } catch {}
                            logI('head fetch: captured head', { bytesRead: bytes, length: headHtml.length });
                            return headHtml;
                        }
                        if (bytes >= MAX_BYTES) {
                            try { controller.abort(); } catch {}
                            logW('head fetch: max bytes reached, returning partial', { bytesRead: bytes, length: buffer.length });
                            return buffer;
                        }
                    }
                }
                logI('head fetch: stream ended without </head>', { bytesRead: bytes, length: buffer.length });
                return buffer;
            } finally {
                if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
            }
        };
        const withNoCache = (u) => `${u}${u.includes('?') ? '&' : '?'}nocache=${Date.now()}`;
        const prettyTitleFromHostname = (hostname) => {
            try {
                const parts = (hostname || '').split('.').filter(Boolean);
                if (parts.length === 0) return hostname || '';
                const tld = parts[parts.length - 1].toLowerCase();
                const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
                const capitalize = (s) => s ? s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
                const tldUpperSet = new Set(['ai','io','tv','fm','so','app','dev']);
                const sldPretty = capitalize(sld);
                if (tldUpperSet.has(tld)) return `${sldPretty} ${tld.toUpperCase()}`.trim();
                // Default: just SLD
                return sldPretty;
            } catch { return hostname || ''; }
        };
        const extractTitle = (doc, pageUrl, rawText, usedEndpoint) => {
            const titleTag = doc.querySelector('title');
            const og = doc.querySelector('meta[property="og:title"]');
            const tw = doc.querySelector('meta[name="twitter:title"]');
            let rawTitle = (titleTag && titleTag.textContent) ? titleTag.textContent.trim() : '';
            // If using r.jina.ai (readable text, not HTML), try to extract a Title: ... line
            if (!rawTitle && usedEndpoint && usedEndpoint.includes('r.jina.ai') && typeof rawText === 'string') {
                const m = rawText.match(/(?:^|\n)\s*Title:\s*([^\n]+)/i);
                if (m && m[1]) {
                    rawTitle = m[1].trim();
                    logI('extracted title from readable text', { rawTitle });
                }
            }
            const ogTitle = og && og.getAttribute('content') ? og.getAttribute('content').trim() : '';
            const twTitle = tw && tw.getAttribute('content') ? tw.getAttribute('content').trim() : '';
            logI('title candidates', { rawTitle, ogTitle, twTitle });
            const finalTitle = rawTitle || ogTitle || twTitle || prettyTitleFromHostname(pageUrl.hostname);
            return finalTitle;
        };
        logI('start', { inputUrl: url });
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
        const computeRelScore = (rel) => {
            if (!rel) return 0;
            // Normalize rel tokens
            const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
            const hasIcon = tokens.includes('icon');
            const hasShortcut = tokens.includes('shortcut');
            const isApple = tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed');
            const isMask = tokens.includes('mask-icon');
            if (hasIcon && hasShortcut) return 100; // Prefer classic shortcut icon when present
            if (hasIcon) return 80;                 // Generic icon links
            if (isApple) return 60;                 // Apple touch icons
            if (isMask) return 40;                  // Safari mask icon
            return 10;
        };
        const computeFileTypeScore = (urlOrType) => {
            const u = (urlOrType || '').toLowerCase();
            if (u.includes('image/svg') || u.endsWith('.svg')) return 40;
            if (u.includes('image/png') || u.endsWith('.png')) return 20;
            if (u.includes('image/x-icon') || u.endsWith('.ico') || u.endsWith('.ico?v=')) return 10;
            return 0;
        };
        const addCandidate = (arr, href, size, baseUrl) => {
            const abs = toAbsoluteUrl(baseUrl, href);
            if (abs) arr.push({ url: abs, size: size || 0, score: 0 });
        };
        const addCandidateWithMeta = (arr, href, size, baseUrl, rel, type) => {
            const abs = toAbsoluteUrl(baseUrl, href);
            if (abs) arr.push({ url: abs, size: size || 0, score: computeRelScore(rel || '') + computeFileTypeScore(type || abs) });
        };

        try {
            // Normalize URL
            const normalized = url.startsWith('http') ? url : 'https://' + url;
            const pageUrl = new URL(normalized);
            logI('normalized URL', { normalized, pageHref: pageUrl.href, hostname: pageUrl.hostname });

            // Fetch page HTML via CORS proxy
            if (externalSignal && externalSignal.aborted) {
                logI('aborted before fetching page');
                throw new DOMException('Aborted', 'AbortError');
            }
            logI('fetching page (with fallbacks)');
            const { html: text, endpoint: usedEndpoint, pendingAllOriginsPromise } = await raceHtmlViaProxiesAny(pageUrl.href, externalSignal);
            logI('page fetched', { usedEndpoint, length: text.length, snippet: text.slice(0, 200) });
            const doc = new DOMParser().parseFromString(text, 'text/html');

            // Title
            const title = extractTitle(doc, pageUrl, text, usedEndpoint);
            logI('final title decided', { title });

            // Collect icon candidates
            const iconCandidates = [];

            // 1) Web App Manifest icons
            try {
                const manifestLink = doc.querySelector('link[rel="manifest"]');
                if (manifestLink && manifestLink.getAttribute('href')) {
                    const manifestHref = toAbsoluteUrl(pageUrl.href, manifestLink.getAttribute('href'));
                    if (manifestHref) {
                        if (externalSignal && externalSignal.aborted) {
                            logI('aborted before fetching manifest');
                            throw new DOMException('Aborted', 'AbortError');
                        }
                        logI('fetching manifest (with fallbacks)', { manifestHref });
                        let manifestJson = null;
                        try {
                            const { html: manifestText, endpoint: manifestEndpoint } = await raceHtmlViaProxiesAny(manifestHref, externalSignal);
                            logI('manifest fetched', { manifestEndpoint, length: manifestText.length });
                            manifestJson = JSON.parse(manifestText);
                        } catch (e) {
                            logW('manifest fetch/parse failed', { error: String(e) });
                            manifestJson = null;
                        }
                        if (!manifestJson) {
                            throw new Error('Manifest not available');
                        }
                        logI('manifest parsed', { hasIcons: Array.isArray(manifestJson.icons), iconsCount: Array.isArray(manifestJson.icons) ? manifestJson.icons.length : 0 });
                        const icons = Array.isArray(manifestJson.icons) ? manifestJson.icons : [];
                        for (const icon of icons) {
                            const size = parseSize(icon.sizes) || 0;
                            if (icon.src) addCandidate(iconCandidates, icon.src, size, manifestHref);
                        }
                    }
                }
            } catch (e) {
            logW('manifest fetch failed', e);
            }

            // 2) Apple touch icons and other link rel icons (prefer large sizes)
            const linkSelectors = [
                'link[rel~="apple-touch-icon"]',
                'link[rel~="apple-touch-icon-precomposed"]',
                'link[rel~="icon"]',
                'link[rel~="shortcut icon"]',
                'link[rel~="mask-icon"]'
            ];
            const linkNodes = doc.querySelectorAll(linkSelectors.join(','));
            logI('link rel icons found', { count: linkNodes.length });
            linkNodes.forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                const sizesAttr = link.getAttribute('sizes');
                const size = parseSize(sizesAttr) || 0;
                const rel = link.getAttribute('rel') || '';
                const type = link.getAttribute('type') || '';
                addCandidateWithMeta(iconCandidates, href, size, pageUrl.href, rel, type);
            });
            logI('icon candidates after links', { count: iconCandidates.length });

            // If readability proxy was used and found no icons, fetch just the <head> via raw HTML proxy and parse rel icons
            if (iconCandidates.length === 0 && usedEndpoint && usedEndpoint.includes('r.jina.ai')) {
                try {
                    logI('no rel icons via readability; fetching <head> only for rel icons');
                    const headHtml = await fetchHeadHtmlViaAllOrigins(pageUrl.href, externalSignal);
                    const headDoc = new DOMParser().parseFromString(headHtml, 'text/html');
                    const linkNodesH = headDoc.querySelectorAll(linkSelectors.join(','));
                    logI('head-only link rel icons found', { count: linkNodesH.length });
                    linkNodesH.forEach(link => {
                        const href = link.getAttribute('href');
                        if (!href) return;
                        const sizesAttr = link.getAttribute('sizes');
                        const size = parseSize(sizesAttr) || 0;
                        const rel = link.getAttribute('rel') || '';
                        const type = link.getAttribute('type') || '';
                        addCandidateWithMeta(iconCandidates, href, size, pageUrl.href, rel, type);
                    });
                    logI('icon candidates after head-only fetch', { count: iconCandidates.length });
                } catch (e) {
                    logW('head-only icon fetch failed', { error: String(e) });
                    // Fall back to conventional if still empty
                    if (iconCandidates.length === 0) {
                        addCandidate(iconCandidates, '/favicon.ico', 32, pageUrl.origin + '/');
                        addCandidate(iconCandidates, '/favicon.png', 32, pageUrl.origin + '/');
                        addCandidate(iconCandidates, '/favicon.jpg', 32, pageUrl.origin + '/');
                        addCandidate(iconCandidates, '/favicon.jpeg', 32, pageUrl.origin + '/');
                        addCandidate(iconCandidates, '/favicon.svg', 32, pageUrl.origin + '/');
                    }
                }
            }

            // 3) If no candidates yet, try conventional favicon filenames
            if (iconCandidates.length === 0) {
                logI('adding conventional favicon fallbacks');
                addCandidate(iconCandidates, '/favicon.ico', 32, pageUrl.origin + '/');
                addCandidate(iconCandidates, '/favicon.png', 32, pageUrl.origin + '/');
                addCandidate(iconCandidates, '/favicon.jpg', 32, pageUrl.origin + '/');
                addCandidate(iconCandidates, '/favicon.jpeg', 32, pageUrl.origin + '/');
                addCandidate(iconCandidates, '/favicon.svg', 32, pageUrl.origin + '/');
            }

            // Choose by score (rel preference), then by size
            iconCandidates.sort((a, b) => {
                const s = (b.score || 0) - (a.score || 0);
                return s !== 0 ? s : (b.size - a.size);
            });
            let icon = iconCandidates.length > 0 ? iconCandidates[0].url : '';
            logI('chosen icon', { icon, totalCandidates: iconCandidates.length });

            // Fallback to Google's S2 favicon service with size hint
            if (!icon) {
                icon = `https://www.google.com/s2/favicons?domain=${pageUrl.hostname}&sz=128`;
                logI('using Google S2 fallback icon', { icon });
            }

            logI('done', { title, icon });
            return { title, icon };
        } catch (error) {
            logE('error', error);
            try {
                const normalized = url.startsWith('http') ? url : 'https://' + url;
                const parsed = new URL(normalized);
                const fallbackTitle = prettyTitleFromHostname(parsed.hostname);
                const fallback = { title: fallbackTitle, icon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128` };
                logI('returning fallback', fallback);
                return fallback;
            } catch {
                const fallback = { title: url, icon: '' };
                logI('returning basic fallback', fallback);
                return fallback;
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

    // Background metadata refresh that does not block Save
    async function backgroundRefreshBookmarkMetadata(groupName, index, url, hadMissingTitle, hadMissingIcon) {
        try {
            const result = await fetchMetadata(url);
            if (!result) return;
            const group = bookmarks[groupName];
            if (!group || !group[index]) return;
            let updated = false;
            if (hadMissingTitle && result.title && result.title.trim()) {
                const newTitle = result.title.trim();
                if (group[index].title !== newTitle) {
                    console.log('backgroundRefresh: updating title', { from: group[index].title, to: newTitle });
                    group[index].title = newTitle;
                    updated = true;
                }
            }
            if (hadMissingIcon && result.icon && result.icon.trim()) {
                group[index].icon = result.icon.trim();
                updated = true;
            }
            if (updated) {
                saveBookmarks();
                try { renderBookmarks(groupName); } catch { renderBookmarkGroups(); }
            }
        } catch (e) {
            console.warn('backgroundRefreshBookmarkMetadata failed', e);
        }
    }

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

    // Switch modal to saving state
    showModalSavingState();
    // Disable save to prevent double submit (kept for safety)
    setButtonLoading(saveButton, true, 'Saving…');
    console.log("Modal switched to saving state");

    try {
        // Track whether user left fields blank at the start
        const missingTitleBefore = !title || !title.trim();
        const missingIconBefore = !icon || !icon.trim();
        if (missingTitleBefore || missingIconBefore) {
            console.log('saveNewBookmark: need metadata', { missingTitle: missingTitleBefore, missingIcon: missingIconBefore, currentTitle: title, currentIcon: icon });
            const controller = new AbortController();
            const metadata = await fetchMetadata(url, controller.signal);
            if (isCancelled) {
                console.log("saveNewBookmark: cancelled during metadata fetch");
                controller.abort();
                return;
            }
            // Graceful fallback if metadata is slow/empty
            const receivedTitle = (metadata.title || '').trim();
            const receivedIcon = (metadata.icon || '').trim();
            const finalTitle = (title || receivedTitle).trim() || new URL(url).hostname;
            const finalIcon = (icon || receivedIcon).trim();
            console.log('saveNewBookmark: after metadata fetch', { receivedTitle, receivedIcon, finalTitle, finalIcon });
            title = finalTitle;
            icon = finalIcon;
            // Compute if we used fallback values (so we can refresh in background)
            var usedFallbackTitle = missingTitleBefore && !receivedTitle;
            var usedFallbackIcon = missingIconBefore && !receivedIcon;
        } else {
            var usedFallbackTitle = false;
            var usedFallbackIcon = false;
        }

        if (isCancelled) {
            console.log("saveNewBookmark: cancelled before persisting");
            return;
        }

        // Persist and render
        const hadMissingTitle = usedFallbackTitle;
        const hadMissingIcon = usedFallbackIcon;
        bookmarks[groupName].push({ url, title, icon: icon || faviconServiceUrlForDomain(getDomainFromUrl(url), 128), whiteBg: false });
        console.log('saveNewBookmark: persisting bookmark');
        saveBookmarks();
        try {
            renderBookmarks(groupName);
        } catch (e) {
            console.error('Failed to render bookmarks after save; re-rendering groups', e);
            renderBookmarkGroups();
        }
        const newIndex = bookmarks[groupName].length - 1;
        console.log('saveNewBookmark: saved', { groupName, index: newIndex, titleUsed: title, iconUsed: icon || faviconServiceUrlForDomain(getDomainFromUrl(url), 128) });
        // Kick a background metadata refresh to fill title/icon if needed
        if (hadMissingTitle || hadMissingIcon) {
            backgroundRefreshBookmarkMetadata(groupName, newIndex, url, hadMissingTitle, hadMissingIcon);
        }
        console.log("New bookmark saved successfully");
    } finally {
        // Always restore UI state
        console.log('saveNewBookmark: closing modal and restoring content');
        resetModal();
        closeModal();
        // In case modal stayed open for any reason, restore original content
        restoreModalContent();
    }
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

    // Switch modal to saving state
    showModalSavingState();
    setButtonLoading(saveButton, true, 'Saving…');
    console.log("Modal switched to saving state");

    try {
        const missingTitleBefore = !title || !title.trim();
        const missingIconBefore = !icon || !icon.trim();
        if (missingTitleBefore || missingIconBefore) {
            console.log('saveEditedBookmark: need metadata', { missingTitle: missingTitleBefore, missingIcon: missingIconBefore, currentTitle: title, currentIcon: icon });
            const controller = new AbortController();
            const metadata = await fetchMetadata(url, controller.signal);
            if (isCancelled) {
                console.log("saveEditedBookmark: cancelled during metadata fetch");
                controller.abort();
                return;
            }
            const receivedTitle = (metadata.title || '').trim();
            const receivedIcon = (metadata.icon || '').trim();
            const finalTitle = (title || receivedTitle).trim() || new URL(url).hostname;
            const finalIcon = (icon || receivedIcon).trim();
            console.log('saveEditedBookmark: after metadata fetch', { receivedTitle, receivedIcon, finalTitle, finalIcon });
            title = finalTitle;
            icon = finalIcon;
            var usedFallbackTitle = missingTitleBefore && !receivedTitle;
            var usedFallbackIcon = missingIconBefore && !receivedIcon;
        } else {
            var usedFallbackTitle = false;
            var usedFallbackIcon = false;
        }

        if (isCancelled) {
            console.log("saveEditedBookmark: cancelled before updating bookmark");
            return;
        }

        const hadMissingTitle = usedFallbackTitle;
        const hadMissingIcon = usedFallbackIcon;
        const hadWhiteBg = iconPreview && iconPreview.classList.contains('white-bg');
        bookmarks[groupName][index] = { url, title, icon: icon || faviconServiceUrlForDomain(getDomainFromUrl(url), 128), whiteBg: hadWhiteBg };
        console.log('saveEditedBookmark: persisting');
        saveBookmarks();
        try {
            renderBookmarks(groupName);
        } catch (e) {
            console.error('Failed to render bookmarks after edit; re-rendering groups', e);
            renderBookmarkGroups();
        }
        console.log('saveEditedBookmark: saved', { groupName, index, titleUsed: title, iconUsed: icon || faviconServiceUrlForDomain(getDomainFromUrl(url), 128), whiteBg: hadWhiteBg });
        if (hadMissingTitle || hadMissingIcon) {
            backgroundRefreshBookmarkMetadata(groupName, index, url, hadMissingTitle, hadMissingIcon);
        }
        console.log("Edited bookmark saved successfully");
    } finally {
        console.log('saveEditedBookmark: closing modal and restoring content');
        resetModal();
        closeModal();
        restoreModalContent();
    }
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
