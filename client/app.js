const API_URL = 'http://localhost:5000/api';

const urlParams = new URLSearchParams(window.location.search);
const activeGroupId = urlParams.get('groupId');

if (!activeGroupId) {
    window.location.replace('index.html');
    throw new Error('Group ID is required');
}

const MEMBER_VALUES = Array.from({ length: 11 }, (_, i) => i);
let families = [];
let activeGroup = null;
let isGroupReadOnly = false;

const expenseChart = new Chart(document.getElementById('expenseChart').getContext('2d'), {
    type: 'pie',
    data: { labels: [], datasets: [{ data: [], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'] }] },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label(context) {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0) || 1;
                        const percentage = Math.round((value / total) * 100);
                        return `${label}: ₹${value.toFixed(2)} (${percentage}%)`;
                    }
                }
            }
        }
    }
});

let dailyChart = null;

function initDailyChart() {
    const canvas = document.getElementById('dailyChart');
    if (!canvas) return;
    
    if (dailyChart) {
        dailyChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    dailyChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        maxRotation: window.innerWidth <= 768 ? 45 : 0,
                        minRotation: window.innerWidth <= 768 ? 45 : 0,
                        font: { size: window.innerWidth <= 768 ? 10 : 12 }
                    }
                },
                y: { 
                    beginAtZero: true, 
                    ticks: { callback: (value) => `₹${value.toFixed(0)}` } 
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    callbacks: { 
                        label: (context) => {
                            if (context.datasetIndex === 0) {
                                return `Total: ₹${context.raw.toFixed(2)}`;
                            }
                            return '';
                        }
                    } 
                }
            }
        }
    });
}

function formatFamilyLabel(name = '') {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatCurrency(value = 0) {
    return `₹${Number(value || 0).toFixed(2)}`;
}

function buildGroupUrl(path) {
    return `${API_URL}${path}?groupId=${encodeURIComponent(activeGroupId)}`;
}

function updateLockDependentUI() {
    const lockedAlert = document.getElementById('groupLockedAlert');
    lockedAlert.classList.toggle('d-none', !isGroupReadOnly);

    const disableForm = (form) => {
        if (!form) return;
        Array.from(form.elements).forEach(element => {
            if (element.dataset.ignoreLock === 'true') return;
            element.disabled = isGroupReadOnly;
        });
    };

    disableForm(document.getElementById('expenseForm'));
    disableForm(document.getElementById('addFamilyForm'));
}

function renderGroupHeader() {
    if (!activeGroup) return;

    document.getElementById('groupTitle').textContent = activeGroup.name;
    document.getElementById('groupDescription').textContent = activeGroup.description || '';
    
    const statusBadge = document.getElementById('groupStatusBadge');
    statusBadge.textContent = activeGroup.status === 'active' ? 'Active' : 'Closed';
    statusBadge.className = `badge ${activeGroup.status === 'active' ? 'bg-success' : 'bg-secondary'}`;

    const metrics = activeGroup.metrics || {};
    document.getElementById('groupMetrics').textContent = `Total: ${formatCurrency(metrics.totalExpenses)} • ${metrics.expenseCount || 0} expenses • ${metrics.familyCount || 0} families`;
}

async function loadGroupDetails() {
    try {
        const response = await fetch(`${API_URL}/groups/${activeGroupId}`);
        if (response.status === 404) {
            alert('Group not found. Redirecting to groups page.');
            window.location.replace('index.html');
            return;
        }
        activeGroup = await response.json();
        isGroupReadOnly = activeGroup.status === 'closed';
        renderGroupHeader();
        updateLockDependentUI();
    } catch (error) {
        console.error('Error loading group:', error);
        alert('Unable to load group details.');
        window.location.replace('index.html');
    }
}

async function loadGroupData() {
    await loadFamilies();
    await Promise.all([loadExpenses(), loadSettlements()]);
}

async function refreshAll() {
    await loadGroupDetails();
    await loadGroupData();
}

// Families
async function loadFamilies() {
    try {
        const response = await fetch(buildGroupUrl('/families'));
        families = await response.json();
        renderFamilyOptions();
        renderFamilyManagement();
    } catch (error) {
        console.error('Error loading families:', error);
        families = [];
    }
}

function renderFamilyOptions() {
    const select = document.getElementById('familyName');
    if (!select) return;

    if (!families.length) {
        select.innerHTML = '<option value="">Add a family first</option>';
        select.disabled = true;
        return;
    }

    const currentValue = select.value;
    select.disabled = false;
    select.innerHTML = families.map(family => `
        <option value="${family.name}">
            ${formatFamilyLabel(family.name)} (${family.members} members)
        </option>
    `).join('');

    const hasCurrent = families.some(family => family.name === currentValue);
    select.value = hasCurrent ? currentValue : families[0].name;
}

function renderFamilyManagement() {
    const container = document.getElementById('familyManagement');
    if (!container) return;

    if (!families.length) {
        container.innerHTML = '<p class="text-muted mb-0">No families yet. Add one above.</p>';
        return;
    }

    const rows = families.map(family => {
        const memberControl = isGroupReadOnly
            ? `<span>${family.members}</span>`
            : `
                <form class="family-count-form d-flex flex-wrap gap-2 align-items-center" data-family-id="${family._id}">
                    ${renderMemberSelect(family.members)}
                    <button class="btn btn-sm btn-outline-primary" type="submit">Update</button>
                </form>
            `;

        const deleteDisabled = family.hasExpenses || isGroupReadOnly;
        let deleteNote = '';
        if (family.hasExpenses) {
            deleteNote = 'Remove expenses first';
        } else if (isGroupReadOnly) {
            deleteNote = 'Group closed';
        }

        return `
            <tr>
                <td>${formatFamilyLabel(family.name)}</td>
                <td>${memberControl}</td>
                <td class="text-end">
                    <button
                        class="btn btn-sm btn-outline-danger delete-family-btn"
                        data-family-id="${family._id}"
                        data-family-name="${formatFamilyLabel(family.name)}"
                        ${deleteDisabled ? 'disabled' : ''}
                    >
                        Delete
                    </button>
                    ${deleteNote ? `<small class="text-muted d-block">${deleteNote}</small>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table mb-0">
                <thead>
                    <tr>
                        <th>Family</th>
                        <th>Members</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderMemberSelect(selectedValue) {
    const options = MEMBER_VALUES.map(value => `
        <option value="${value}" ${value === selectedValue ? 'selected' : ''}>${value}</option>
    `).join('');
    return `
        <select class="form-select form-select-sm w-auto" name="members" aria-label="Select members">
            ${options}
        </select>
    `;
}

// Expenses
async function loadExpenses() {
    try {
        const response = await fetch(buildGroupUrl('/expenses'));
        const expenses = await response.json();

        let historyHtml = '';
        if (!expenses.length) {
            historyHtml = `<tr><td colspan="5" class="text-center text-muted">No expenses yet.</td></tr>`;
        } else {
            historyHtml = expenses.map(expense => renderExpenseRow(expense)).join('');
        }

        document.getElementById('expenseHistory').innerHTML = historyHtml;

        // Family totals for pie chart
        const familyTotals = {};
        expenses.forEach(expense => {
            familyTotals[expense.familyName] = (familyTotals[expense.familyName] || 0) + expense.amount;
        });
        expenseChart.data.labels = Object.keys(familyTotals);
        expenseChart.data.datasets[0].data = Object.values(familyTotals);
        expenseChart.update();

        // Daily spending chart - only days with expenses, with family breakdown
        if (expenses.length > 0) {
            // Aggregate expenses by date and family
            const dailyData = {};
            const dailyFamilyData = {};
            
            expenses.forEach(expense => {
                const date = new Date(expense.date);
                const dateKey = date.toDateString();
                const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = { total: 0, label: dateLabel };
                    dailyFamilyData[dateKey] = {};
                }
                
                dailyData[dateKey].total += expense.amount;
                if (!dailyFamilyData[dateKey][expense.familyName]) {
                    dailyFamilyData[dateKey][expense.familyName] = 0;
                }
                dailyFamilyData[dateKey][expense.familyName] += expense.amount;
            });
            
            // Only include days with expenses
            const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
            const labels = sortedDates.map(key => dailyData[key].label);
            const data = sortedDates.map(key => dailyData[key].total);
            
            // Prepare family breakdown data for tooltip
            const familyBreakdown = sortedDates.map(key => dailyFamilyData[key]);
            
            // Reduced height (2.5x smaller)
            const dayCount = sortedDates.length;
            const baseHeight = 100;
            const mobileBaseHeight = 80;
            const heightPerDay = window.innerWidth <= 768 ? 6 : 8;
            const calculatedHeight = Math.max(
                window.innerWidth <= 768 ? mobileBaseHeight : baseHeight,
                (window.innerWidth <= 768 ? mobileBaseHeight : baseHeight) + (dayCount * heightPerDay)
            );
            
            const container = document.getElementById('dailyChartContainer');
            if (container) {
                container.style.height = `${calculatedHeight}px`;
            }
            
            if (!dailyChart) {
                initDailyChart();
            }
            
            if (dailyChart) {
                dailyChart.data.labels = labels;
                dailyChart.data.datasets = [
                    {
                        label: 'Total',
                        data: data,
                        backgroundColor: '#36A2EB',
                        borderColor: '#1E88E5',
                        borderWidth: 1,
                        order: 1
                    },
                    {
                        label: 'Family Breakdown',
                        data: data,
                        type: 'line',
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#FF6384',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        showLine: false,
                        order: 0,
                        yAxisID: 'y'
                    }
                ];
                
                // Store family breakdown for tooltip
                dailyChart.familyBreakdown = familyBreakdown;
                
                // Custom tooltip for family breakdown
                dailyChart.options.plugins.tooltip.callbacks.afterBody = (context) => {
                    if (context[0].datasetIndex !== 1) return '';
                    const index = context[0].dataIndex;
                    const breakdown = dailyChart.familyBreakdown[index];
                    if (!breakdown || Object.keys(breakdown).length === 0) return '';
                    
                    const families = Object.entries(breakdown)
                        .filter(([_, amount]) => amount > 0)
                        .map(([family, amount]) => `${formatFamilyLabel(family)}: ₹${amount.toFixed(2)}`)
                        .join('\n');
                    
                    return families ? `\n${families}` : '';
                };
                
                dailyChart.options.scales.x.ticks.maxRotation = window.innerWidth <= 768 ? 45 : 0;
                dailyChart.options.scales.x.ticks.minRotation = window.innerWidth <= 768 ? 45 : 0;
                dailyChart.update();
            }
        } else {
            if (!dailyChart) {
                initDailyChart();
            }
            dailyChart.data.labels = [];
            dailyChart.data.datasets = [{ label: 'Amount', data: [], backgroundColor: '#36A2EB', borderColor: '#1E88E5', borderWidth: 1 }];
            dailyChart.update();
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

function renderExpenseRow(expense) {
    const formattedDate = new Date(expense.date).toLocaleString();
    const familyLabel = formatFamilyLabel(expense.familyName);
    const actionsHtml = isGroupReadOnly
        ? '<span class="badge bg-secondary">Locked</span>'
        : `
            <button class="btn btn-sm btn-outline-primary me-2 edit-expense-btn" data-expense-id="${expense._id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-expense-btn" data-expense-id="${expense._id}">Delete</button>
        `;

    const editRow = isGroupReadOnly ? '' : `
        <tr class="expense-edit-row d-none" data-edit-row-for="${expense._id}">
            <td colspan="5">
                <form class="expense-edit-form row g-2 align-items-end" data-expense-id="${expense._id}">
                    <div class="col-md-4">
                        <label class="form-label mb-1">Amount</label>
                        <input type="number" class="form-control form-control-sm" name="amount" value="${expense.amount}" min="0" step="0.01" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label mb-1">Family</label>
                        <select class="form-select form-select-sm" name="familyName" required>
                            ${renderFamilyChoiceOptions(expense.familyName)}
                        </select>
                    </div>
                    <div class="col-md-4 d-flex gap-2">
                        <button type="submit" class="btn btn-sm btn-success flex-fill">Save</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary flex-fill cancel-expense-edit" data-expense-id="${expense._id}">Cancel</button>
                    </div>
                </form>
            </td>
        </tr>
    `;

    return `
        <tr data-expense-id="${expense._id}">
            <td>${formattedDate}</td>
            <td>${expense.description}</td>
            <td>${formatCurrency(expense.amount)}</td>
            <td>${familyLabel}</td>
            <td class="text-end">${actionsHtml}</td>
        </tr>
        ${editRow}
    `;
}

function renderFamilyChoiceOptions(selectedFamily) {
    if (!families.length) {
        return `
            <option value="${selectedFamily}" selected>${formatFamilyLabel(selectedFamily)}</option>
        `;
    }

    return families.map(family => `
        <option value="${family.name}" ${family.name === selectedFamily ? 'selected' : ''}>
            ${formatFamilyLabel(family.name)} (${family.members} members)
        </option>
    `).join('');
}

// Settlements
async function loadSettlements() {
    try {
        const response = await fetch(buildGroupUrl('/expenses/settlements'));
        const data = await response.json();

        const settlementsHtml = `
            <div class="mb-3">
                <h4 style="font-size: 1.1rem;">Summary</h4>
                <p class="mb-1">Total Expenses: ${formatCurrency(data.totalExpenses)}</p>
                <p class="mb-1">Total Members: ${data.totalMembers}</p>
                <p class="mb-1">Per Person Share: ${formatCurrency(data.perPersonShare)}</p>
            </div>
            <div class="mb-3">
                <h4 style="font-size: 1.1rem;">Family Balances</h4>
                <ul class="list-group">
                    ${data.familyBalances.map(balance => {
                        const balanceText = balance.balance >= 0
                            ? `+ ${formatCurrency(balance.balance)}`
                            : `- ${formatCurrency(Math.abs(balance.balance))}`;
                        return `
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                ${formatFamilyLabel(balance.family)} (${balance.members} members)
                                <span class="badge ${balance.balance >= 0 ? 'bg-success' : 'bg-danger'} rounded-pill">
                                    ${balanceText}
                                </span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
            <div>
                <h4 style="font-size: 1.1rem;">Required Settlements</h4>
                ${data.settlements.length === 0 ? 
                    '<p class="text-muted mb-0">No settlements required. All balances are settled.</p>' :
                    data.settlements.map(settlement => `
                        <div class="card mb-2" style="border-left: 4px solid #dc3545;">
                            <div class="card-body p-3">
                                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="badge bg-danger">${formatFamilyLabel(settlement.from)}</span>
                                        <span style="font-size: 1.2rem;">→</span>
                                        <span class="badge bg-success">${formatFamilyLabel(settlement.to)}</span>
                                    </div>
                                    <div>
                                        <span class="badge bg-primary" style="font-size: 1rem; padding: 0.5rem 1rem;">
                                            ₹${parseFloat(settlement.amount).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;

        document.getElementById('settlements').innerHTML = settlementsHtml;
    } catch (error) {
        console.error('Error loading settlements:', error);
    }
}

// Event handlers
document.getElementById('backToGroupsBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isGroupReadOnly) {
        alert('This group is closed. Reopen it to add expenses.');
        return;
    }

    const submitButton = document.querySelector('#expenseForm button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        Adding...
    `;

    const payload = {
        description: document.getElementById('description').value,
        amount: parseFloat(document.getElementById('amount').value),
        familyName: document.getElementById('familyName').value,
        groupId: activeGroupId
    };

    try {
        const response = await fetch(`${API_URL}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error adding expense');
        }

        document.getElementById('expenseForm').reset();
        await refreshAll();
    } catch (error) {
        console.error('Error adding expense:', error);
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
});

document.getElementById('addFamilyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isGroupReadOnly) {
        alert('This group is closed. Reopen it to modify families.');
        return;
    }

    const password = window.prompt('Enter password to add a family:');
    if (password === null) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';

    try {
        const payload = {
            name: document.getElementById('newFamilyName').value,
            members: parseInt(document.getElementById('newFamilyMembers').value, 10),
            groupId: activeGroupId,
            password
        };
        const response = await fetch(`${API_URL}/families`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add family');
        }

        document.getElementById('addFamilyForm').reset();
        await refreshAll();
    } catch (error) {
        console.error('Error adding family:', error);
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
});

document.addEventListener('submit', async (e) => {
    if (!e.target.matches('.family-count-form')) return;
    if (isGroupReadOnly) {
        alert('This group is closed. Reopen it to modify families.');
        return;
    }

    e.preventDefault();
    const form = e.target;
    const familyId = form.dataset.familyId;
    const membersSelect = form.querySelector('select[name="members"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;

    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
        const response = await fetch(`${API_URL}/families/${familyId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members: parseInt(membersSelect.value, 10) })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update family');
        }

        await refreshAll();
    } catch (error) {
        console.error('Error updating family:', error);
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
});

document.addEventListener('click', async (e) => {
    const button = e.target.closest('.delete-family-btn');
    if (!button) return;
    if (isGroupReadOnly || button.disabled) {
        alert('Cannot delete family while group is closed.');
        return;
    }

    const familyId = button.dataset.familyId;
    const familyName = button.dataset.familyName || 'this family';

    if (!window.confirm(`Delete ${familyName}? This cannot be undone.`)) return;

    const password = window.prompt('Enter password to delete this family:');
    if (password === null) return;

    const originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Deleting...';

    try {
        const response = await fetch(`${API_URL}/families/${familyId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete family');
        }
        await refreshAll();
    } catch (error) {
        console.error('Error deleting family:', error);
        alert(error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
});

document.addEventListener('click', async (e) => {
    const button = e.target.closest('.delete-expense-btn');
    if (!button) return;
    if (isGroupReadOnly) {
        alert('This group is closed. Reopen it to modify expenses.');
        return;
    }

    const expenseId = button.dataset.expenseId;
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;

    const originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Deleting...';

    try {
        const response = await fetch(`${API_URL}/expenses/${expenseId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete expense');
        }
        await refreshAll();
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert(error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
});

document.addEventListener('click', (e) => {
    if (isGroupReadOnly) return;
    const editButton = e.target.closest('.edit-expense-btn');
    if (!editButton) return;
    toggleExpenseEditRow(editButton.dataset.expenseId);
});

document.addEventListener('click', (e) => {
    const cancelButton = e.target.closest('.cancel-expense-edit');
    if (!cancelButton) return;
    hideExpenseEditRow(cancelButton.dataset.expenseId);
});

function toggleExpenseEditRow(expenseId) {
    const rows = document.querySelectorAll('.expense-edit-row');
    rows.forEach(row => {
        if (row.dataset.editRowFor === expenseId) {
            row.classList.toggle('d-none');
        } else {
            row.classList.add('d-none');
        }
    });
}

function hideExpenseEditRow(expenseId) {
    const row = document.querySelector(`.expense-edit-row[data-edit-row-for="${expenseId}"]`);
    if (row) row.classList.add('d-none');
}

document.addEventListener('submit', async (e) => {
    if (!e.target.matches('.expense-edit-form')) return;
    if (isGroupReadOnly) {
        alert('This group is closed. Reopen it to modify expenses.');
        return;
    }

    e.preventDefault();
    const form = e.target;
    const expenseId = form.dataset.expenseId;
    const amountInput = form.querySelector('input[name="amount"]');
    const familySelect = form.querySelector('select[name="familyName"]');

    if (!window.confirm('Update this expense?')) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
        const payload = {
            amount: parseFloat(amountInput.value),
            familyName: familySelect.value
        };

        const response = await fetch(`${API_URL}/expenses/${expenseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update expense');
        }

        hideExpenseEditRow(expenseId);
        await refreshAll();
    } catch (error) {
        console.error('Error updating expense:', error);
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
});

// Initialize chart on page load
initDailyChart();

// Handle window resize for mobile/desktop switching
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (dailyChart) {
            loadExpenses();
        }
    }, 250);
});

// Initialize
refreshAll();

