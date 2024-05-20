document.addEventListener('DOMContentLoaded', () => {
    console.log("Document loaded");

    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const modal = document.getElementById('modal');
    const urlInput = document.getElementById('url');
    const titleInput = document.getElementById('title');
    const iconInput = document.getElementById('icon');
    const saveButton = document.getElementById('save');
    const deleteButton = document.getElementById('delete');
    const cancelButton = document.getElementById('cancel');
    const deleteAllButton = document.getElementById('deleteAll');
    const addGroupButton = document.getElementById('addGroup');

    let bookmarks = { "default": [] };
    let groupOrder = ["default"];

    // Load bookmarks from storage
    function loadBookmarks() {
        chrome.storage.local.get(['bookmarks', 'groupOrder'], (result) => {
            if (result.bookmarks) {
                bookmarks = result.bookmarks;
                groupOrder = result.groupOrder || Object.keys(bookmarks);
                console.log("Bookmarks loaded:", bookmarks);
                validateBookmarks();
            } else {
                console.log("No bookmarks found in storage. Initializing with default.");
                bookmarks = { "default": [] };
                groupOrder = ["default"];
            }
            renderBookmarkGroups();
        });
    }

    // Save bookmarks to storage
    function saveBookmarks() {
        chrome.storage.local.set({ bookmarks, groupOrder }, () => {
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
            groupElement.innerHTML = `
                <div class="group-heading" data-group="${groupName}">
                    <div class="group-title">
                        ${groupName}
                        <div class="delete-link" data-group="${groupName}">Delete</div>
                    </div>
                    <div class="add-bookmark" data-group="${groupName}">+</div>
                </div>
                <div class="bookmarkGrid" id="grid-${groupName}" data-group="${groupName}">
                </div>
            `;
            bookmarkContainer.appendChild(groupElement);
            // end 
            renderBookmarks(groupName);
        });

        document.querySelectorAll('.add-bookmark').forEach(button => {
            button.addEventListener('click', (event) => {
                const groupName = event.target.dataset.group;
                openAddModal(groupName);
            });
        });

        document.querySelectorAll('.group-heading').forEach(title => {
            title.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                enableGroupTitleEditing(event.target);
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
    }

    // Function to delete a group
    function deleteGroup(groupName) {
        console.log(`Clicked Delete Group: ${groupName}`);
        if (confirm(`Are you sure you want to delete the group "${groupName}"?`)) {
            delete bookmarks[groupName];
            groupOrder = groupOrder.filter(name => name !== groupName);
            saveBookmarks();
            renderBookmarkGroups();
        }
    }


    // Ensure the groups are rendered when the document is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Document loaded");
        loadBookmarks(); // Ensure bookmarks are loaded from localStorage
        renderBookmarkGroups();
    });


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
            <img src="${bookmark.icon}" alt="${bookmark.title}">
            <div class="title">${bookmark.title}</div>
        `;
        bookmarkElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            openEditModal(groupName, index);
        });
        bookmarkElement.addEventListener('click', () => {
            window.location.href = bookmark.url.startsWith('http') ? bookmark.url : 'https://' + bookmark.url;
        });
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
                    } else {
                        const [movedItem] = bookmarks[oldGroup].splice(oldIndex, 1);
                        bookmarks[oldGroup].splice(newIndex, 0, movedItem);
                    }

                    // Move the DOM element to the new position
                    if (oldGroup !== newGroup) {
                        event.to.insertBefore(event.item, event.to.children[newIndex]);
                    } else {
                        if (oldIndex < newIndex) {
                            event.from.insertBefore(event.item, event.from.children[newIndex + 1]);
                        } else {
                            event.from.insertBefore(event.item, event.from.children[newIndex]);
                        }
                    }

                    saveBookmarks();
                }
            });
        });
    }

    // Enable inline editing for group title
function enableGroupTitleEditing(titleElement) {
    const groupName = titleElement.parentElement.dataset.group; // Update to capture group name
    const currentTitle = titleElement.firstChild.textContent.trim();

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'edit-group-heading';
    titleElement.firstChild.textContent = ''; // Clear the existing title
    titleElement.insertBefore(input, titleElement.firstChild);

    input.focus();

    let isRenaming = false;

    function handleBlur() {
        if (!isRenaming) {
            isRenaming = true;
            saveGroupTitle(input, groupName, currentTitle);
            cleanUp();
        }
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !isRenaming) {
            event.preventDefault();
            isRenaming = true;
            saveGroupTitle(input, groupName, currentTitle);
            cleanUp();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelGroupTitleEditing(titleElement, input, currentTitle);
            cleanUp();
        }
    }

    function cleanUp() {
        input.removeEventListener('blur', handleBlur);
        input.removeEventListener('keydown', handleKeyDown);
    }

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
function cancelGroupTitleEditing(titleElement, input, currentTitle) {
    titleElement.firstChild.textContent = currentTitle;
    titleElement.removeChild(input);
    input.removeEventListener('blur', handleBlur);
    input.removeEventListener('keydown', handleKeyDown);
}


    // Open the modal for adding a new bookmark
    function openAddModal(groupName) {
        console.log("Add modal opened for group:", groupName);
        urlInput.value = '';
        titleInput.value = '';
        iconInput.value = '';
        saveButton.disabled = false; // Ensure save button is enabled when modal opens
        saveButton.onclick = () => saveNewBookmark(groupName);
        deleteButton.style.display = 'none'; // Hide the delete button for new bookmarks
        modal.style.display = 'flex';

        // Add keydown event listener for Enter and Escape keys
        modal.addEventListener('keydown', handleKeyDown);
    }

    // Open the modal for editing an existing bookmark
    function openEditModal(groupName, index) {
        console.log("Edit modal opened for group:", groupName, "index:", index);
        const bookmark = bookmarks[groupName][index];
        urlInput.value = bookmark.url;
        titleInput.value = bookmark.title;
        iconInput.value = bookmark.icon;
        saveButton.disabled = false; // Ensure save button is enabled when modal opens
        saveButton.onclick = () => saveEditedBookmark(groupName, index);
        deleteButton.onclick = () => deleteBookmark(groupName, index); // Set the delete button's onclick handler
        deleteButton.style.display = 'inline-block'; // Show the delete button for editing bookmarks
        modal.style.display = 'flex';

        // Add keydown event listener for Enter and Escape keys
        modal.addEventListener('keydown', handleKeyDown);
    }

// Handle keydown events for Enter and Escape keys
function handleKeyDown(event) {
    if (event.key === 'Enter') {
        console.log("Pressed 'Enter'");
        event.preventDefault();
        saveButton.click();
    } else if (event.key === 'Escape') {
        console.log("Pressed 'Espace'");
        event.preventDefault();
        cancelButton.click();
    }
}

    // Fetch and extract the best icon URL and title using Clearbit's Logo API
    async function fetchMetadata(url) {
        try {
            // Ensure the URL includes the https:// prefix
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            const formattedUrl = new URL(url);
            const domain = formattedUrl.hostname;

            // Fetch title and fallback icon from the website
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            let title = url;
            const titleTag = doc.querySelector('title');
            if (titleTag) {
                title = titleTag.textContent;
            }

            // Fetch high-resolution icon from Clearbit
            const icon = `https://logo.clearbit.com/${domain}`;

            return { title, icon };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            return { title: url, icon: `https://www.google.com/s2/favicons?domain=${formattedUrl.hostname}` };
        }
    }

    let isCancelled = false;

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

    // Disable the save button and show loading indicator
    saveButton.disabled = true;
    document.getElementById('loadingIndicator').style.display = 'block';
    console.log("Save button disabled and loading indicator shown");

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

    bookmarks[groupName].push({ url, title, icon });
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

    // Disable the save button and show loading indicator
    saveButton.disabled = true;
    document.getElementById('loadingIndicator').style.display = 'block';
    console.log("Save button disabled and loading indicator shown");

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

    bookmarks[groupName][index] = { url, title, icon };
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
        modal.removeEventListener('keydown', handleKeyDown);
        isCancelled = false; // Reset cancellation flag in case it wasn't reset in resetModal
    }
        
// Reset modal to default state
function resetModal() {
    console.log("Resetting modal to default state");
    saveButton.disabled = false; // Re-enable the save button
    document.getElementById('loadingIndicator').style.display = 'none'; // Hide loading indicator
    isCancelled = false; // Reset cancellation flag
}
    
    // Fetch and extract the best icon URL and title using Clearbit's Logo API
    async function fetchMetadata(url) {
        try {
            // Ensure the URL includes the https:// prefix
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            const formattedUrl = new URL(url);
            const domain = formattedUrl.hostname;
    
            // Fetch title and fallback icon from the website
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
    
            let title = url;
            const titleTag = doc.querySelector('title');
            if (titleTag) {
                title = titleTag.textContent;
            }
    
            // Fetch high-resolution icon from Clearbit
            const icon = `https://logo.clearbit.com/${domain}`;
    
            return { title, icon };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            return { title: url, icon: `https://www.google.com/s2/favicons?domain=${formattedUrl.hostname}` };
        }
    }
    
    // Delete a bookmark
    function deleteBookmark(groupName, index) {
        console.log("Deleting bookmark in group:", groupName, "at index:", index);
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

    // Cancel the modal
    cancelButton.onclick = closeModal;

    // Close the modal and remove keydown event listener
    function closeModal() {
        console.log("Modal closed");
        modal.style.display = 'none';
        modal.removeEventListener('keydown', handleKeyDown);
    }

    // Export bookmarks as JSON
    function exportBookmarks() {
        const bookmarksJson = JSON.stringify(bookmarks, null, 2);
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

    // Import bookmarks from JSON
    function importBookmarks(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedBookmarks = JSON.parse(e.target.result);
                    if (Array.isArray(importedBookmarks)) {
                        // Handle the old format where bookmarks are an array
                        bookmarks["default"] = importedBookmarks;
                        groupOrder = ["default"];
                    } else if (typeof importedBookmarks === 'object' && importedBookmarks !== null) {
                        // Handle the new format where bookmarks are an object of groups
                        for (const group in importedBookmarks) {
                            if (!Array.isArray(importedBookmarks[group])) {
                                importedBookmarks[group] = [];
                            }
                        }
                        bookmarks = importedBookmarks;
                        groupOrder = Object.keys(bookmarks);
                    } else {
                        console.error("Invalid bookmarks format.");
                    }
                    chrome.storage.local.set({ bookmarks, groupOrder }, () => {
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

    
    // Load bookmarks initially
    loadBookmarks();
    
    
});
