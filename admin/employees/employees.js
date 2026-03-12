// Official Management Module

window.initEmployeeManagement = (supabase) => {
    // Get references to required functions and variables from parent scope
    const showToast = window.adminShowToast || function(msg) { console.log('Toast:', msg); };
    const showConfirmation = window.adminShowConfirmation || function(title, msg) { return Promise.resolve(confirm(msg)); };
    const getEmployeesList = () => window.adminEmployeesList || [];
    const setEmployeesList = (list) => { window.adminEmployeesList = list; };
    const renderEmployeesOptions = window.adminRenderEmployeesOptions || function() {};
    const renderUpdateEmployeesOptions = window.adminRenderUpdateEmployeesOptions || function() {};
    const getAdminEmployeesListForFilter = () => window.adminEmployeesListForFilter || [];
    const setAdminEmployeesListForFilter = (list) => { window.adminEmployeesListForFilter = list; };
    const getAdminFilterEmployeeSelect = () => document.getElementById('admin-filter-employee');

    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    };

    // Employee Management Functionality
    const employeeNameInput = document.getElementById("employee-name");
    const employeePositionInput = document.getElementById("employee-position");
    const employeePositionSuggestions = document.getElementById("employee-position-suggestions");
    const addEmployeeBtn = document.getElementById("add-employee-btn");
    const employeeStatus = document.getElementById("employee-status");
    const employeeListContainer = document.getElementById("employee-list");
    const employeeSummaryContainer = document.getElementById("employee-summary");
    const employeeSearchInput = document.getElementById("employee-search");
    let allEmployeesData = []; // Store all employees for filtering
    let allEmployeesCache = []; // Always holds the full unfiltered list
    const deleteEmployeeModal = document.getElementById("delete-employee-modal");
    const cancelDeleteEmployeeBtn = document.getElementById("cancel-delete-employee");
    const confirmDeleteEmployeeBtn = document.getElementById("confirm-delete-employee");
    const editEmployeeModal = document.getElementById("edit-employee-modal");
    const editEmployeeNameInput = document.getElementById("edit-employee-name");
    const editEmployeePositionInput = document.getElementById("edit-employee-position");
    const editEmployeeStatus = document.getElementById("edit-employee-status");
    const cancelEditEmployeeBtn = document.getElementById("cancel-edit-employee");
    const confirmEditEmployeeBtn = document.getElementById("confirm-edit-employee");
    let deleteEmployeeData = null;
    let editEmployeeData = null;

    const renderPositionSuggestions = (employees = []) => {
        if (!employeePositionSuggestions) return;

        const seen = new Set();
        const positions = [];

        (employees || []).forEach(emp => {
            const position = String(emp?.position || '').trim();
            if (!position) return;
            const key = position.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            positions.push(position);
        });

        positions.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        employeePositionSuggestions.innerHTML = positions
            .map(position => `<option value="${escapeHtml(position)}"></option>`)
            .join('');
    };

    const renderEmployeeList = async (filteredData = null) => {
        try {
            if (filteredData === null) {
                employeeListContainer.innerHTML = `
                    <div class="employee-table-header">
                        <span class="employee-header-name">Name</span>
                        <span class="employee-header-position">Position</span>
                        <span class="employee-header-action">Actions</span>
                    </div>
                    <p class="loading-text">Loading officials...</p>
                `;
                if (employeeSummaryContainer) {
                    employeeSummaryContainer.textContent = 'Total: 0 | Active: 0 | Inactive: 0';
                }
                
                const { data, error } = await supabase
                    .from("employee_list")
                    .select("id, name, position, is_active")
                    .order("is_active", { ascending: false })
                    .order("name", { ascending: true });

                if (error) throw error;
                
                allEmployeesData = data || [];
                allEmployeesCache = allEmployeesData.slice(); // keep a full copy
                
                // Clear search input when loading fresh data
                if (employeeSearchInput) {
                    employeeSearchInput.value = '';
                }
            } else {
                allEmployeesData = filteredData;
            }

            renderPositionSuggestions(allEmployeesCache);

            if (!allEmployeesData || allEmployeesData.length === 0) {
                employeeListContainer.innerHTML = `
                    <div class="employee-table-header">
                        <span class="employee-header-name">Name</span>
                        <span class="employee-header-position">Position</span>
                        <span class="employee-header-action">Actions</span>
                    </div>
                    <p class="no-employees">No officials found.</p>
                `;
                if (employeeSummaryContainer) {
                    employeeSummaryContainer.textContent = 'Total: 0 | Active: 0 | Inactive: 0';
                }
                return;
            }

            const tableHeader = `
                <div class="employee-table-header">
                    <span class="employee-header-name">Name</span>
                    <span class="employee-header-position">Position</span>
                    <span class="employee-header-action">Actions</span>
                </div>
            `;

            // Calculate employee counts
            const totalCount = allEmployeesData.length;
            const activeCount = allEmployeesData.filter(emp => emp.is_active !== false).length;
            const inactiveCount = totalCount - activeCount;

            const employeeItems = allEmployeesData.map(emp => {
                // Ensure is_active is properly boolean (handle null/undefined)
                const isActive = emp.is_active !== false; // Default to true if null/undefined
                const inactiveClass = !isActive ? ' employee-inactive' : '';
                const inactiveLabel = !isActive ? ' <span class="inactive-badge">Inactive</span>' : '';
                const toggleIcon = !isActive 
                    ? '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>' 
                    : '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
                const toggleLabel = !isActive ? 'Unhide official' : 'Hide official';
                return `
                <div class="employee-item${inactiveClass}">
                    <span class="employee-name">${escapeHtml(emp.name)}${inactiveLabel}</span>
                    <span class="employee-position">${escapeHtml(emp.position || '—')}</span>
                    <div class="employee-item-actions">
                        <button class="toggle-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" data-active="${isActive}" aria-label="${toggleLabel}" title="${toggleLabel}">
                            <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                                ${toggleIcon}
                            </svg>
                        </button>
                        <button class="edit-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" data-position="${escapeHtml(emp.position || '')}" aria-label="Update official" title="Update official">
                            <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                        </button>
                        <button class="delete-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" aria-label="Delete official" title="Delete official">
                            <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                                <path d="M9 3h6l1 2h4a1 1 0 1 1 0 2h-1l-1.1 12.1a2 2 0 0 1-2 1.9H8.1a2 2 0 0 1-2-1.9L5 7H4a1 1 0 0 1 0-2h4l1-2Zm1.1 7a1 1 0 1 0-2 0v7a1 1 0 1 0 2 0v-7Zm5.9 0a1 1 0 1 0-2 0v7a1 1 0 1 0 2 0v-7Z" />
                            </svg>
                        </button>
                    </div>
                </div>
                `;
            }).join('');

            employeeListContainer.innerHTML = tableHeader + employeeItems;
            
            // Update summary container
            if (employeeSummaryContainer) {
                employeeSummaryContainer.textContent = `Total: ${totalCount} | Active: ${activeCount} | Inactive: ${inactiveCount}`;
            }

            // Add toggle active/inactive button listeners
            document.querySelectorAll('.toggle-employee-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const employeeId = btn.getAttribute('data-id');
                    const employeeName = btn.getAttribute('data-name');
                    const activeAttr = btn.getAttribute('data-active');
                    // Handle boolean conversion: true, 'true', or anything else is false
                    const isActive = activeAttr === 'true' || activeAttr === true;
                    const newStatus = !isActive;
                    
                    // Determine action and meaningful message
                    const action = newStatus ? 'unhide' : 'hide';
                    const title = newStatus ? 'Unhide Official' : 'Hide Official';
                    const message = newStatus 
                        ? `Unhide "${employeeName}"?\n\nThis official will be marked as active and appear without the inactive tag.`
                        : `Hide "${employeeName}"?\n\nThis official will be marked as inactive and will appear with an "(Inactive)" tag in all dropdowns and selections. Existing records remain unchanged.`;
                    
                    // Show confirmation dialog
                    const confirmed = await showConfirmation(title, message);
                    if (!confirmed) {
                        return; // User cancelled
                    }
                    
                    try {
                        const { error } = await supabase
                            .from("employee_list")
                            .update({ is_active: newStatus })
                            .eq("id", employeeId);

                        if (error) throw error;

                        const statusText = newStatus ? 'unhidden' : 'hidden';
                        const toastType = newStatus ? 'success' : 'warning';
                        showToast(`Official "${employeeName}" ${statusText} successfully!`, toastType);
                        await renderEmployeeList();
                        // Refresh the global employee list for dropdowns
                        if (window.adminLoadEmployees) {
                            await window.adminLoadEmployees();
                        }
                    } catch (error) {
                        console.error("Toggle employee status error:", error);
                        showToast(`Failed to update official status: ${error.message}`, "error");
                    }
                });
            });

            // Add edit button listeners
            document.querySelectorAll('.edit-employee-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    editEmployeeData = {
                        id: btn.getAttribute('data-id'),
                        name: btn.getAttribute('data-name'),
                        position: btn.getAttribute('data-position') || ''
                    };
                    editEmployeeNameInput.value = editEmployeeData.name;
                    if (editEmployeePositionInput) {
                        editEmployeePositionInput.value = editEmployeeData.position || 'Not specified';
                    }
                    editEmployeeStatus.classList.add('hidden');
                    editEmployeeModal.classList.add('show');
                });
            });

            // Add delete button listeners
            document.querySelectorAll('.delete-employee-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    deleteEmployeeData = {
                        id: btn.getAttribute('data-id'),
                        name: btn.getAttribute('data-name')
                    };
                    deleteEmployeeModal.classList.add('show');
                });
            });

            // Reload employee options in multiselects and filter
            if (filteredData === null) {
                setEmployeesList(allEmployeesData || []);
                renderEmployeesOptions();
                renderUpdateEmployeesOptions();
                
                // Update admin filter dropdown
                const adminFilterEmployeeSelect = getAdminFilterEmployeeSelect();
                setAdminEmployeesListForFilter(allEmployeesData ? allEmployeesData : []);
                if (adminFilterEmployeeSelect) {
                        adminFilterEmployeeSelect.innerHTML = '<option value="">All Officials</option>' +
                        getAdminEmployeesListForFilter().map(emp => {
                            const inactiveLabel = emp.is_active === false ? ' (Inactive)' : '';
                            return `<option value="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}${inactiveLabel}</option>`;
                        }).join('');
                }
            }
        } catch (error) {
            console.error("Failed to load employees:", error);
            employeeListContainer.innerHTML = `
                <div class="employee-table-header">
                    <span class="employee-header-name">Name</span>
                    <span class="employee-header-position">Position</span>
                    <span class="employee-header-action">Actions</span>
                </div>
                <p class="error-text">Failed to load officials.</p>
            `;
            if (employeeSummaryContainer) {
                employeeSummaryContainer.textContent = 'Total: 0 | Active: 0 | Inactive: 0';
            }
        }
    };

    // Employee search functionality
    if (employeeSearchInput) {
        employeeSearchInput.addEventListener('input', () => {
            const searchTerm = employeeSearchInput.value.toLowerCase().trim();
            
            if (searchTerm === '') {
                // Show all employees
                renderEmployeeList(allEmployeesCache);
            } else {
                // Filter employees by name
                const filtered = allEmployeesCache.filter(emp => 
                    emp.name.toLowerCase().includes(searchTerm)
                );
                renderEmployeeList(filtered);
            }
        });
    }

    // Autocomplete functionality for "Add Official" field
    const autocompleteList = document.getElementById('employee-autocomplete-list');
    
    // Helper to show/hide dropdown with proper class management
    const setDropdownVisible = (visible) => {
        if (visible) {
            autocompleteList.style.display = 'block';
            employeeNameInput.classList.add('autocomplete-active');
        } else {
            autocompleteList.style.display = 'none';
            employeeNameInput.classList.remove('autocomplete-active');
        }
    };
    
    const showAutocompleteSuggestions = (inputValue) => {
        const trimmed = inputValue.toLowerCase().trim();
        
        if (!trimmed || trimmed.length === 0) {
            setDropdownVisible(false);
            return;
        }
        
        // Filter employees that match the input (only active employees)
        const matches = allEmployeesCache
            .filter(emp => emp.is_active !== false && emp.name.toLowerCase().includes(trimmed))
            .slice(0, 10); // Show max 10 suggestions
        
        if (matches.length === 0) {
            // Show "add employee" button when no matches
            autocompleteList.innerHTML = `
                <div class="autocomplete-no-options">
                    No matching officials found
                    <br>
                    <button type="button" class="autocomplete-add-btn">Add "${escapeHtml(employeeNameInput.value.trim())}"</button>
                </div>
            `;
            setDropdownVisible(true);
            
            // Add click handler for the add button
            const addBtn = autocompleteList.querySelector('.autocomplete-add-btn');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setDropdownVisible(false);
                    addEmployeeBtn.click(); // Trigger the add employee button
                });
            }
            return;
        }
        
        // Build the suggestions HTML
        autocompleteList.innerHTML = matches.map((emp, index) => {
            return `<div class="autocomplete-item" data-value="${escapeHtml(emp.name)}" data-index="${index}" role="option">${escapeHtml(emp.name)}</div>`;
        }).join('');
        
        setDropdownVisible(true);
        
        // Add click handlers to suggestions
        document.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                employeeNameInput.value = item.getAttribute('data-value');
                setDropdownVisible(false);
                employeeNameInput.focus();
            });
            
            item.addEventListener('mouseenter', () => {
                document.querySelectorAll('.autocomplete-item').forEach(i => i.classList.remove('highlighted'));
                item.classList.add('highlighted');
            });
        });
    };
    
    // Handle input event for autocomplete
    employeeNameInput.addEventListener('input', (e) => {
        showAutocompleteSuggestions(e.target.value);
    });
    
    // Handle keyboard navigation in autocomplete
    employeeNameInput.addEventListener('keydown', (e) => {
        const items = document.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;
        
        const highlighted = document.querySelector('.autocomplete-item.highlighted');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!highlighted) {
                items[0].classList.add('highlighted');
            } else {
                const nextIndex = Array.from(items).indexOf(highlighted) + 1;
                if (nextIndex < items.length) {
                    highlighted.classList.remove('highlighted');
                    items[nextIndex].classList.add('highlighted');
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlighted) {
                const prevIndex = Array.from(items).indexOf(highlighted) - 1;
                if (prevIndex >= 0) {
                    highlighted.classList.remove('highlighted');
                    items[prevIndex].classList.add('highlighted');
                } else {
                    highlighted.classList.remove('highlighted');
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted) {
                employeeNameInput.value = highlighted.getAttribute('data-value');
                setDropdownVisible(false);
            } else if (employeeNameInput.value.trim()) {
                // Trigger add button if Enter is pressed with no selection
                addEmployeeBtn.click();
            }
        } else if (e.key === 'Escape') {
            setDropdownVisible(false);
        }
    });
    
    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            setDropdownVisible(false);
        }
    });
    
    // Show autocomplete when field is focused
    employeeNameInput.addEventListener('focus', (e) => {
        if (e.target.value.length > 0) {
            showAutocompleteSuggestions(e.target.value);
        }
    });

    addEmployeeBtn.addEventListener("click", async () => {
        const employeeName = employeeNameInput.value.trim();
        const employeePosition = employeePositionInput.value.trim();

        if (!employeeName) {
            employeeStatus.textContent = "Please enter an official name.";
            employeeStatus.classList.add("status--error");
            employeeStatus.classList.remove("status--shake");
            void employeeStatus.offsetWidth;
            employeeStatus.classList.add("status--shake");
            return;
        }

        if (!employeePosition) {
            employeeStatus.textContent = "Please enter an official position.";
            employeeStatus.classList.add("status--error");
            employeeStatus.classList.remove("status--shake");
            void employeeStatus.offsetWidth;
            employeeStatus.classList.add("status--shake");
            return;
        }

        // Validate allowed characters
        const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
        if (!namePattern.test(employeeName)) {
            employeeStatus.textContent = "Only letters, hyphens, apostrophes, periods, and commas are allowed.";
            employeeStatus.classList.add("status--error");
            employeeStatus.classList.remove("status--shake");
            void employeeStatus.offsetWidth;
            employeeStatus.classList.add("status--shake");
            return;
        }

        // Validate length
        if (employeeName.length > 30) {
            employeeStatus.textContent = "Official name cannot exceed 30 characters.";
            employeeStatus.classList.add("status--error");
            employeeStatus.classList.remove("status--shake");
            void employeeStatus.offsetWidth;
            employeeStatus.classList.add("status--shake");
            return;
        }

        try {
            employeeStatus.textContent = "Adding official...";
            employeeStatus.classList.remove("status--error");

            // Check if employee already exists in the current list
            const existingEmployee = getEmployeesList().find(emp => emp.name.toLowerCase() === employeeName.toLowerCase());
            if (existingEmployee) {
                throw new Error(`Official "${existingEmployee.name}" already exists.`);
            }

            const { error } = await supabase
                .from("employee_list")
                .insert([{ name: employeeName, position: employeePosition, is_active: true }]);

            if (error) {
                console.error("Database insert error:", error);
                if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                    // Try to fetch the conflicting record
                    const { data: existingData } = await supabase
                        .from("employee_list")
                        .select("*")
                        .ilike("name", employeeName)
                        .limit(1);
                    
                    if (existingData && existingData.length > 0) {
                        throw new Error(`Official "${existingData[0].name}" already exists (ID: ${existingData[0].id}).`);
                    } else {
                        throw new Error("This official name already exists in the database.");
                    }
                }
                throw error;
            }

            employeeStatus.textContent = "Official added successfully!";
            employeeNameInput.value = "";
            employeePositionInput.value = "";
            setDropdownVisible(false);
            await renderEmployeeList();
            // Refresh the global employee list for dropdowns
            if (window.adminLoadEmployees) {
                await window.adminLoadEmployees();
            }
            showToast("Official added successfully!", "success");
        } catch (error) {
            console.error("Add employee error:", error);
            const message = error && error.message ? error.message : "Failed to add official.";
            employeeStatus.textContent = message;
            employeeStatus.classList.add("status--error");
            employeeStatus.classList.remove("status--shake");
            void employeeStatus.offsetWidth;
            employeeStatus.classList.add("status--shake");
        }
    });

    cancelDeleteEmployeeBtn.addEventListener("click", () => {
        deleteEmployeeModal.classList.remove("show");
        deleteEmployeeData = null;
    });

    confirmDeleteEmployeeBtn.addEventListener("click", async () => {
        if (!deleteEmployeeData || !deleteEmployeeData.id) return;

        try {
            const { error } = await supabase
                .from("employee_list")
                .delete()
                .eq("id", deleteEmployeeData.id);

            if (error) throw error;

            deleteEmployeeModal.classList.remove("show");
            deleteEmployeeData = null;
            await renderEmployeeList();
            // Refresh the global employee list for dropdowns
            if (window.adminLoadEmployees) {
                await window.adminLoadEmployees();
            }
            showToast("Official removed successfully!", "success");
        } catch (error) {
            console.error("Delete employee error:", error);
            showToast("Failed to remove official.", "error");
        }
    });

    deleteEmployeeModal.addEventListener("click", (e) => {
        if (e.target === deleteEmployeeModal) {
            deleteEmployeeModal.classList.remove("show");
            deleteEmployeeData = null;
        }
    });

    cancelEditEmployeeBtn.addEventListener("click", () => {
        editEmployeeModal.classList.remove("show");
        editEmployeeData = null;
        editEmployeeNameInput.value = "";
        if (editEmployeePositionInput) {
            editEmployeePositionInput.value = "";
        }
        editEmployeeStatus.classList.add("hidden");
    });

    confirmEditEmployeeBtn.addEventListener("click", async () => {
        if (!editEmployeeData || !editEmployeeData.id) return;

        const newName = editEmployeeNameInput.value.trim();
        const newPosition = (editEmployeePositionInput?.value || '').trim() || 'Not specified';
        if (!newName) {
            editEmployeeStatus.textContent = "Please enter an official name.";
            editEmployeeStatus.classList.remove("hidden", "status--success", "status--shake");
            editEmployeeStatus.classList.add("status--error");
            void editEmployeeStatus.offsetWidth; // Force reflow to restart animation
            editEmployeeStatus.classList.add("status--shake");
            return;
        }

        // Validate allowed characters
        const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
        if (!namePattern.test(newName)) {
            editEmployeeStatus.textContent = "Only letters, spaces, hyphens, apostrophes, periods, and commas are allowed.";
            editEmployeeStatus.classList.remove("hidden", "status--success", "status--shake");
            editEmployeeStatus.classList.add("status--error");
            void editEmployeeStatus.offsetWidth;
            editEmployeeStatus.classList.add("status--shake");
            return;
        }

        // Validate length
        if (newName.length > 30) {
            editEmployeeStatus.textContent = "Official name cannot exceed 30 characters.";
            editEmployeeStatus.classList.remove("hidden", "status--success", "status--shake");
            editEmployeeStatus.classList.add("status--error");
            void editEmployeeStatus.offsetWidth;
            editEmployeeStatus.classList.add("status--shake");
            return;
        }

        const originalPosition = (editEmployeeData.position || '').trim() || 'Not specified';

        if (newName === editEmployeeData.name && newPosition === originalPosition) {
            editEmployeeStatus.textContent = "No changes made.";
            editEmployeeStatus.classList.remove("hidden", "status--error", "status--shake");
            editEmployeeStatus.classList.add("status--success");
            void editEmployeeStatus.offsetWidth; // Force reflow to restart animation
            editEmployeeStatus.classList.add("status--shake");
            return;
        }

        try {
            editEmployeeStatus.textContent = "Updating official...";
            editEmployeeStatus.classList.remove("hidden", "status--error", "status--success");

            const { data: updatedRows, error } = await supabase
                .from("employee_list")
                .update({ name: newName, position: newPosition })
                .eq("id", editEmployeeData.id)
                .select();

            if (error) {
                if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                    throw new Error("This official name already exists.");
                }
                throw error;
            }

            // Ensure the update actually affected a row (useful to surface RLS/permission issues)
            if (!updatedRows || updatedRows.length === 0) {
                throw new Error("Update failed — record not found or insufficient permissions.");
            }

            editEmployeeStatus.textContent = "Official updated successfully!";
            editEmployeeStatus.classList.add("status--success");
            editEmployeeStatus.classList.remove("status--error");
            
            setTimeout(() => {
                editEmployeeModal.classList.remove("show");
                editEmployeeData = null;
                editEmployeeNameInput.value = "";
                if (editEmployeePositionInput) {
                    editEmployeePositionInput.value = "";
                }
                editEmployeeStatus.classList.add("hidden");
            }, 1000);
            
            await renderEmployeeList();
            // Refresh the global employee list for dropdowns
            if (window.adminLoadEmployees) {
                await window.adminLoadEmployees();
            }
            showToast(`Official "${newName}" updated (Position: ${newPosition}).`, "success");
        } catch (error) {
            console.error("Edit employee error:", error);
            const message = error && error.message ? error.message : "Failed to update official.";
            editEmployeeStatus.textContent = message;
            editEmployeeStatus.classList.remove("hidden", "status--success", "status--shake");
            editEmployeeStatus.classList.add("status--error");
            void editEmployeeStatus.offsetWidth;
            editEmployeeStatus.classList.add("status--shake");
        }
    });

    editEmployeeModal.addEventListener("click", (e) => {
        if (e.target === editEmployeeModal) {
            editEmployeeModal.classList.remove("show");
            editEmployeeData = null;
            editEmployeeNameInput.value = "";
            if (editEmployeePositionInput) {
                editEmployeePositionInput.value = "";
            }
            editEmployeeStatus.classList.add("hidden");
        }
    });

    // Initialize - Load employees when module is initialized
    renderEmployeeList();

    // Expose renderEmployeeList to window for panel switching
    window.employeeRenderList = renderEmployeeList;

    // Realtime subscription for employee_list changes
    let employeeRealtimeChannel = null;
    const setupEmployeeRealtimeSubscription = () => {
        // Clean up existing subscription if any
        if (employeeRealtimeChannel) {
            supabase.removeChannel(employeeRealtimeChannel);
        }

        // Subscribe to all changes (INSERT, UPDATE, DELETE) on employee_list table
        employeeRealtimeChannel = supabase
            .channel('employee_list_admin_changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events
                    schema: 'public',
                    table: 'employee_list'
                },
                (payload) => {
                    // Refresh the employee table
                    renderEmployeeList();
                    
                    // Refresh upload multi-select dropdowns
                    if (window.adminLoadEmployees) {
                        window.adminLoadEmployees();
                    }
                    
                    // Refresh admin view filter dropdown
                    if (window.adminLoadEmployeesForFilter) {
                        window.adminLoadEmployeesForFilter();
                    }
                    
                    // Show toast notification with employee name
                    let message = '';
                    let employeeName = '';
                    
                    switch(payload.eventType) {
                        case 'INSERT':
                            employeeName = payload.new?.name || 'Official';
                            message = `${employeeName} has been added to officials`;
                            break;
                        case 'UPDATE':
                            employeeName = payload.new?.name || payload.old?.name || 'Official';
                            message = `${employeeName} has been updated in officials`;
                            break;
                        case 'DELETE':
                            employeeName = payload.old?.name || 'Official';
                            message = `${employeeName} has been removed from officials`;
                            break;
                    }
                    showToast(message, 'success', 3000);
                }
            )
            .subscribe((status) => {});
    };

    // Initialize realtime subscription
    setupEmployeeRealtimeSubscription();
};
