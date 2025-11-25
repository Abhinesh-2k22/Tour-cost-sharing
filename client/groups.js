const API_URL = 'https://krp-expense-backend.onrender.com/api';

const groupListEl = document.getElementById('groupList');
const createCardEl = document.getElementById('createGroupCard');
const emptyStateEl = document.getElementById('emptyState');
const openCreateBtn = document.getElementById('openCreateGroupBtn');
const cancelCreateBtn = document.getElementById('cancelCreateGroupBtn');
const emptyCreateBtn = document.getElementById('emptyCreateBtn');
const createForm = document.getElementById('createGroupForm');
const nameInput = document.getElementById('newGroupName');
const descriptionInput = document.getElementById('newGroupDescription');

let groups = [];

function formatCurrency(amount = 0) {
    return `₹${Number(amount || 0).toFixed(2)}`;
}

function renderGroups() {
    if (!groups.length) {
        emptyStateEl.classList.remove('d-none');
        groupListEl.innerHTML = '';
        return;
    }

    emptyStateEl.classList.add('d-none');
    groupListEl.innerHTML = groups.map(group => {
        const isActive = group.status === 'active';
        const metrics = group.metrics || {};
        return `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card group-card h-100">
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <div class="fw-semibold fs-5">${group.name}</div>
                                <small class="text-muted">${group.description || 'No description added yet'}</small>
                            </div>
                            <span class="status-pill ${isActive ? 'active' : 'closed'}">
                                ${isActive ? 'Active' : 'Closed'}
                            </span>
                        </div>
                        <div class="mt-3 metric-line">
                            <div class="fw-semibold text-dark">${formatCurrency(metrics.totalExpenses)}</div>
                            <div>${metrics.expenseCount || 0} expenses • ${metrics.familyCount || 0} families</div>
                        </div>
                        <div class="mt-3 d-flex gap-2 flex-wrap">
                            <button class="btn btn-sm btn-outline-primary flex-grow-1" data-open-group="${group._id}">
                                Open
                            </button>
                            <button class="btn btn-sm ${isActive ? 'btn-outline-warning' : 'btn-outline-success'}" data-toggle-group="${group._id}">
                                ${isActive ? 'Close' : 'Reopen'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function loadGroups() {
    try {
        const response = await fetch(`${API_URL}/groups`);
        groups = await response.json();
        renderGroups();
    } catch (error) {
        console.error('Error loading groups:', error);
        alert('Failed to load groups. Please ensure the backend is running.');
    }
}

function showCreateCard(show) {
    createCardEl.style.display = show ? 'block' : 'none';
    if (show) {
        nameInput.focus();
    } else {
        createForm.reset();
    }
}

openCreateBtn.addEventListener('click', () => showCreateCard(true));
cancelCreateBtn.addEventListener('click', () => showCreateCard(false));
emptyCreateBtn.addEventListener('click', () => showCreateCard(true));

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = window.prompt('Enter password to create a new group:');
    if (password === null) return;
    
    const payload = {
        name: nameInput.value,
        description: descriptionInput.value,
        password
    };

    const submitBtn = createForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Creating...';

    try {
        const response = await fetch(`${API_URL}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create group');
        }

        await loadGroups();
        showCreateCard(false);
    } catch (error) {
        console.error('Error creating group:', error);
        alert(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

groupListEl.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-open-group]');
    if (openBtn) {
        const groupId = openBtn.dataset.openGroup;
        window.location.href = `group.html?groupId=${encodeURIComponent(groupId)}`;
        return;
    }

    const toggleBtn = e.target.closest('[data-toggle-group]');
    if (toggleBtn) {
        const groupId = toggleBtn.dataset.toggleGroup;
        const group = groups.find(g => g._id === groupId);
        if (!group) return;
        await toggleGroupStatus(group);
    }
});

async function toggleGroupStatus(group) {
    const nextStatus = group.status === 'active' ? 'closed' : 'active';
    const password = window.prompt(`Enter password to ${nextStatus === 'closed' ? 'close' : 'reopen'} this group:`);
    if (password === null) return;
    
    const payload = { status: nextStatus, password };

    try {
        const response = await fetch(`${API_URL}/groups/${group._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Unable to update group status');
        }
        await loadGroups();
    } catch (error) {
        console.error('Error updating group status:', error);
        alert(error.message);
    }
}

loadGroups();

