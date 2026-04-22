// Import Supabase
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { supabaseConfig } from "../config.js";
import { initAutoLogout } from "../auto-logout.js";

// Initialize Supabase
const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const markCurrentUserOffline = async () => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;

        const offlineTimestamp = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
        const { error } = await supabase
            .from("profiles")
            .update({ last_seen: offlineTimestamp })
            .eq("id", userId);

        if (error) {
            console.warn("Failed to mark user offline:", error.message);
        }
    } catch (error) {
        console.warn("Offline marker skipped:", error.message);
    }
};

const clearAdminClientState = () => {
    localStorage.removeItem('admin_session_token');
    localStorage.removeItem('adminActivePanel');
    localStorage.removeItem('adminSidebarCollapsed');
    localStorage.removeItem('adminFilters');
    localStorage.removeItem('adminSort');
    sessionStorage.removeItem('adminLoginMarker');
};

// Initialize auto-logout (5 minutes warning, 6 minutes total)
initAutoLogout(supabase, {
    warningTime: 5 * 60 * 1000, // 5 minutes
    logoutTime: 6 * 60 * 1000,   // 6 minutes (5 min warning + 1 min countdown)
    onLogout: async () => {
        await markCurrentUserOffline();
    }
});

// Load upload panel
const uploadPanelLoaded = fetch('upload/upload-panel.html')
    .then(r => r.text())
    .then(panelHTML => {
        document.getElementById('upload-panel-container').innerHTML = panelHTML;
        return true;
    })
    .catch(error => {
        console.error('Error loading upload panel:', error);
        return false;
    });

// Load OCR modal
const ocrModalLoaded = fetch('upload/ocr-modal.html')
    .then(r => r.text())
    .then(modalHTML => {
        document.getElementById('ocr-modal-container').innerHTML = modalHTML;
        // Init after HTML is injected so getElementById calls inside succeed
        if (window.initOCRModal) window.initOCRModal();
        return true;
    })
    .catch(error => {
        console.error('Error loading OCR modal:', error);
        return false;
    });

// Load view panel and modals
const viewPanelLoaded = Promise.all([
    fetch('view/view-panel.html').then(r => r.text()),
    fetch('view/view-modals.html').then(r => r.text())
]).then(([panelHTML, modalsHTML]) => {
    document.getElementById('view-panel-container').innerHTML = panelHTML;
    document.getElementById('view-modals-container').innerHTML = modalsHTML;
    return true;
}).catch(error => {
    console.error('Error loading view components:', error);
    return false;
});

// Load employee panel and modals
const employeePanelLoaded = Promise.all([
    fetch('employees/employees-panel.html').then(r => r.text()),
    fetch('employees/employees-modals.html').then(r => r.text())
]).then(([panelHTML, modalsHTML]) => {
    document.getElementById('employees-panel-container').innerHTML = panelHTML;
    document.getElementById('employees-modals-container').innerHTML = modalsHTML;
    
    // Initialize employee management after loading
    if (window.initEmployeeManagement) {
        window.initEmployeeManagement(supabase);
    }
    return true;
}).catch(error => {
    console.error('Error loading employee components:', error);
    return false;
});

// Load users panel lazily (super users only)
let usersPanelLoadedPromise = null;
const loadUsersPanel = () => {
    if (usersPanelLoadedPromise) {
        return usersPanelLoadedPromise;
    }

    usersPanelLoadedPromise = fetch('users/users-panel.html')
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch users panel: ${response.status}`);
            }
            return response.text();
        })
        .then((panelHTML) => {
            document.getElementById('users-panel-container').innerHTML = panelHTML;
            return true;
        })
        .catch((error) => {
            console.error('Error loading users panel:', error);
            usersPanelLoadedPromise = null;
            return false;
        });

    return usersPanelLoadedPromise;
};

// Realtime subscription to monitor current admin's access status
const setupAccessMonitoring = async () => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        // Subscribe to changes on current user's profile
        const accessChannel = supabase
            .channel('admin_access_monitoring')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${user.id}`
                },
                (payload) => {
                    
                    // Check if access was disabled
                    if (payload.new && payload.new.access_enabled === false) {
                        showToast("Access disabled: You have been logged out.", "error");
                        
                        // Immediate logout
                        setTimeout(async () => {
                            try {
                                await markCurrentUserOffline();
                                clearAdminClientState();
                                await supabase.auth.signOut();
                            } catch (e) {
                                console.warn('Semi-graceful logout:', e);
                            }
                            window.location.href = '../index.html';
                        }, 1000);
                        return;
                    }

                    // Check if session_token changed — another device logged in
                    if (payload.new && payload.new.session_token !== undefined) {
                        const localToken = localStorage.getItem('admin_session_token');
                        if (localToken && payload.new.session_token !== localToken) {
                            showToast("Logged out: Another device logged into this account.", "warning");
                            setTimeout(async () => {
                                try {
                                    await markCurrentUserOffline();
                                    clearAdminClientState();
                                    await supabase.auth.signOut();
                                } catch (e) {
                                    console.warn('Semi-graceful logout:', e);
                                }
                                window.location.href = '../index.html';
                            }, 1000);
                        }
                    }
                }
            )
            .subscribe((status) => {});
    } catch (err) {
        console.error("Error setting up admin access monitoring:", err);
    }
};

// Initialize access monitoring
setupAccessMonitoring();

// Single-session enforcement for admin users using realtime
// ⚠️ WARNING: This uses localStorage which users can view/modify via DevTools
// However, we validate against the database token, so manipulation won't grant access
// The database session_token field is the source of truth
const setupSessionMonitoring = async () => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        const localToken = localStorage.getItem('admin_session_token');
        if (!localToken) return;

        // Initial check: verify session token is set in database
        const { data, error } = await supabase
            .from("profiles")
            .select("session_token")
            .eq("id", user.id)
            .maybeSingle();

        if (!error && data) {
            // If database token is null, update it (in case initial update failed)
            if (data.session_token === null) {
                await supabase
                    .from("profiles")
                    .update({ session_token: localToken })
                    .eq("id", user.id);
            } else if (data.session_token !== localToken) {
                // Already logged in elsewhere - immediate logout
                showToast("Logged out: Another device logged into this account.", "warning");
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    await markCurrentUserOffline();
                    clearAdminClientState();
                    await supabase.auth.signOut();
                } catch (e) {
                    console.warn('Semi-graceful logout:', e);
                }
                window.location.href = '../index.html';
            }
        }
    } catch (err) {
        console.error("Error setting up session monitoring:", err);
    }
};

// Initialize session monitoring
setupSessionMonitoring();

const getUserRole = async (userId) => {
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data?.role || "user";
    } catch (error) {
        console.error("Role lookup error:", error);
        return "user";
    }
};

const requireAdmin = async () => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData?.session) {
        // No valid session - redirect to login
        console.warn("No valid session found. Redirecting to login.");
        window.location.href = "../index.html";
        return null;
    }

    const user = sessionData.session.user;
    
    // CRITICAL: Verify admin/super role from database (not localStorage which can be manipulated)
    const role = await getUserRole(user.id);
    
    if (role !== "admin" && role !== "super") {
        // User is not an admin or super - block access silently
        console.warn("Access denied: User is not an admin or super. Redirecting to dashboard.");
        window.location.href = "../dashboard/dashboard.html";
        return null;
    }

    if (role !== 'super' && localStorage.getItem('adminActivePanel') === 'users-panel') {
        localStorage.setItem('adminActivePanel', 'upload-panel');
    }

    // Clear persisted table state once per new authenticated admin session.
    try {
        const loginMarker = `${user.id}:${sessionData.session.access_token || ""}`;
        const previousLoginMarker = sessionStorage.getItem("adminLoginMarker");

        if (previousLoginMarker !== loginMarker) {
            localStorage.removeItem("adminFilters");
            localStorage.removeItem("adminSort");
            sessionStorage.setItem("adminLoginMarker", loginMarker);
        }
    } catch (storageError) {
        console.warn("Unable to reset admin table state for new login:", storageError);
    }
    
    // Additional check: Verify session token matches database
    const localToken = localStorage.getItem('admin_session_token');
    if (!localToken) {
        console.warn("No session token found. Redirecting to login.");
        window.location.href = "../index.html";
        return;
    }

    const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("session_token")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profileData) {
        console.error("Failed to verify session token:", profileError);
        window.location.href = "../index.html";
        return;
    }

    // If DB token exists and doesn't match, another session is active
    if (profileData.session_token && profileData.session_token !== localToken) {
        console.warn("Session token mismatch. Another device logged in.");
        await markCurrentUserOffline();
        clearAdminClientState();
        await supabase.auth.signOut();
        window.location.href = "../index.html";
        return;
    }

    // Update token in DB if it's null (recovery from failed initial update)
    if (!profileData.session_token) {
        await supabase
            .from("profiles")
            .update({ session_token: localToken })
            .eq("id", user.id);
    }
    
    return role; // Return the role for UI customization

    // Note: Actual access control for admin operations (upload, delete) 
    // is enforced by Supabase RLS policies, not this client-side check.
    // This check is for UX and adds defense-in-depth, but RLS is the real security.
};

// Periodic session validation to detect session termination
// WARNING: Users can disable this in DevTools, so server-side security (RLS) is critical
const validateAdminSession = async () => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData?.session) {
        console.warn("Session expired or invalid. Redirecting to login.");
        window.location.href = "../index.html";
        return;
    }

    // Re-verify admin/super role
    const role = await getUserRole(sessionData.session.user.id);
    if (role !== "admin" && role !== "super") {
        console.warn("User is no longer an admin or super. Redirecting.");
        await markCurrentUserOffline();
        clearAdminClientState();
        await supabase.auth.signOut();
        window.location.href = "../index.html";
        return;
    }

    // Verify session token against database (catches parallel logins missed by realtime)
    const localToken = localStorage.getItem('admin_session_token');
    if (localToken) {
        const { data: tokenData } = await supabase
            .from("profiles")
            .select("session_token")
            .eq("id", sessionData.session.user.id)
            .maybeSingle();

        if (tokenData && tokenData.session_token && tokenData.session_token !== localToken) {
            console.warn("Session token mismatch detected in periodic check. Logging out.");
            showToast("Logged out: Another device logged into this account.", "warning");
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                await markCurrentUserOffline();
                clearAdminClientState();
                await supabase.auth.signOut();
            } catch (e) {
                console.warn('Semi-graceful logout:', e);
            }
            window.location.href = "../index.html";
        }
    }
};

// Check session validity every 30 seconds
setInterval(validateAdminSession, 30000);

// Define header button initialization function
let headerButtonsInitialized = false;
window.initHeaderButtons = () => {
    if (headerButtonsInitialized) return;
    
    const userMenuBtn = document.getElementById('user-menu-btn');
    const headerPopup = document.getElementById('header-popup-panel');
    const draftTaOption = document.getElementById('header-draft-ta-option');
    const settingsOption = document.getElementById('header-settings-option');
    const logoutOption = document.getElementById('header-logout-option');
    const draftTaModal = document.getElementById('header-draft-ta-modal');
    const draftTaForm = document.getElementById('header-draft-ta-form');
    const draftTaCloseBtn = document.getElementById('header-draft-ta-close');
    const draftTaClearBtn = document.getElementById('header-draft-ta-clear');
    const draftTaCreateBtn = document.getElementById('header-draft-ta-create');
    const draftTaPurposeInput = document.getElementById('header-draft-ta-purpose');
    const draftTaDestinationInput = document.getElementById('header-draft-ta-destination');
    const draftTaTravelTypeSelect = document.getElementById('header-draft-ta-travel-type');
    const draftTaFundingOptionSelect = document.getElementById('header-draft-ta-funding-option');
    const draftTaDateRequestInput = document.getElementById('header-draft-ta-date-request');
    const draftTaTravelDateInput = document.getElementById('header-draft-ta-travel-date');
    const draftTaTravelEndInput = document.getElementById('header-draft-ta-travel-end');
    const draftTaOfficialsDisplay = document.getElementById('header-draft-ta-officials-display');
    const draftTaOfficialsDropdown = document.getElementById('header-draft-ta-officials-dropdown');
    const draftTaOfficialsSearch = document.getElementById('header-draft-ta-officials-search');
    const draftTaOfficialsOptions = document.getElementById('header-draft-ta-officials-options');
    const userEmailElement = document.getElementById('header-user-email');
    const userNameElement = document.getElementById('header-user-name');
    const headerDraftSelectedEmployees = [];
    let headerDraftEmployeesMultiSelect = null;

    window.headerDraftSelectedEmployees = headerDraftSelectedEmployees;

    const capitalizeWords = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    };

    const setResponsiveHeaderName = (rawFName, rawLName, fallbackName) => {
        if (!userNameElement) return;

        const fname = capitalizeWords(rawFName || '');
        const lname = capitalizeWords(rawLName || '');
        const fullName = `${fname} ${lname}`.trim();

        const renderName = () => {
            const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
            if (isSmallScreen && fname) {
                const initials = fname
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(word => word.charAt(0).toUpperCase())
                    .join('');
                const compactName = `${initials} ${lname}`.trim();
                userNameElement.textContent = compactName || fullName || fallbackName;
                return;
            }

            userNameElement.textContent = fullName || fallbackName;
        };

        renderName();

        if (window.__headerNameResizeHandler) {
            window.removeEventListener('resize', window.__headerNameResizeHandler);
        }
        window.__headerNameResizeHandler = renderName;
        window.addEventListener('resize', window.__headerNameResizeHandler);
    };

    const getTodayLocalISO = () => {
        const now = new Date();
        const tzOffsetMs = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
    };

    const setDraftTaDateRequestDefault = () => {
        if (draftTaDateRequestInput && !draftTaDateRequestInput.value) {
            draftTaDateRequestInput.value = getTodayLocalISO();
        }
    };

    const setDraftTaOptionDefaults = () => {
        if (draftTaTravelTypeSelect && !draftTaTravelTypeSelect.value) {
            draftTaTravelTypeSelect.value = 'official_business';
        }
        if (draftTaFundingOptionSelect && !draftTaFundingOptionSelect.value) {
            draftTaFundingOptionSelect.value = 'reimbursement';
        }
    };

    const loadHeaderDraftEmployees = async () => {
        try {
            await loadEmployees();
        } catch (error) {
            console.error('Failed to load officials for Draft TA:', error);
        }
    };

    const createHeaderDraftOfficialsMultiSelect = () => {
        if (!draftTaOfficialsDisplay || !draftTaOfficialsDropdown || !draftTaOfficialsSearch || !draftTaOfficialsOptions) {
            return null;
        }

        const closeDropdown = () => {
            draftTaOfficialsSearch.value = '';
            draftTaOfficialsDropdown.classList.remove('show');
        };

        const updateDisplay = () => {
            if (headerDraftSelectedEmployees.length === 0) {
                draftTaOfficialsDisplay.innerHTML = '<span class="multiselect-placeholder">Select officials...</span>';
                return;
            }

            draftTaOfficialsDisplay.innerHTML = headerDraftSelectedEmployees.map(name =>
                `<span class="multiselect-tag">${escapeHtml(name)}<button type="button" class="multiselect-remove" data-name="${escapeHtml(name)}">&times;</button></span>`
            ).join('');

            draftTaOfficialsDisplay.querySelectorAll('.multiselect-remove').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = btn.getAttribute('data-name');
                    const index = headerDraftSelectedEmployees.indexOf(name);

                    if (index > -1) {
                        headerDraftSelectedEmployees.splice(index, 1);
                        updateDisplay();
                        renderOptions();
                    }
                });
            });
        };

        const renderOptions = () => {
            const searchTerm = draftTaOfficialsSearch.value.toLowerCase();
            const filteredEmployees = employeesList.filter((emp) =>
                emp.name.toLowerCase().includes(searchTerm) && !headerDraftSelectedEmployees.includes(emp.name)
            );

            if (filteredEmployees.length === 0) {
                if (searchTerm.trim()) {
                    draftTaOfficialsOptions.innerHTML = `
                        <div class="multiselect-no-options">
                            No matching officials found
                            <br>
                            <button type="button" class="multiselect-add-btn">Add "${escapeHtml(draftTaOfficialsSearch.value.trim())}"</button>
                        </div>
                    `;

                    const addBtn = draftTaOfficialsOptions.querySelector('.multiselect-add-btn');
                    if (addBtn) {
                        addBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const nameToAdd = draftTaOfficialsSearch.value.trim();

                            if (!nameToAdd) return;

                            const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
                            if (!namePattern.test(nameToAdd)) {
                                alert('Only letters, spaces, hyphens, apostrophes, periods, and commas are allowed.');
                                return;
                            }

                            if (nameToAdd.length > 30) {
                                alert('Official name cannot exceed 30 characters.');
                                return;
                            }

                            const existingEmployee = employeesList.find(emp => emp.name.toLowerCase() === nameToAdd.toLowerCase());
                            if (existingEmployee) {
                                if (!headerDraftSelectedEmployees.includes(existingEmployee.name)) {
                                    headerDraftSelectedEmployees.push(existingEmployee.name);
                                    draftTaOfficialsSearch.value = '';
                                    updateDisplay();
                                    renderOptions();
                                }
                                return;
                            }

                            if (!headerDraftSelectedEmployees.includes(nameToAdd)) {
                                headerDraftSelectedEmployees.push(nameToAdd);
                            }

                            draftTaOfficialsSearch.value = '';
                            updateDisplay();
                            renderOptions();
                        });
                    }
                } else {
                    draftTaOfficialsOptions.innerHTML = '<div class="multiselect-no-options">No officials available</div>';
                }
                return;
            }

            draftTaOfficialsOptions.innerHTML = filteredEmployees.map((emp) => {
                const inactiveClass = emp.is_active === false ? ' inactive-employee' : '';
                const inactiveLabel = emp.is_active === false ? ' <span class="inactive-label">(Inactive)</span>' : '';
                return `<div class="multiselect-option${inactiveClass}" data-name="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}${inactiveLabel}</div>`;
            }).join('');

            draftTaOfficialsOptions.querySelectorAll('.multiselect-option').forEach((option) => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = option.getAttribute('data-name');

                    if (!headerDraftSelectedEmployees.includes(name)) {
                        headerDraftSelectedEmployees.push(name);
                        draftTaOfficialsSearch.value = '';
                        updateDisplay();
                        renderOptions();
                    }
                });
            });
        };

        draftTaOfficialsDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            const shouldOpen = !draftTaOfficialsDropdown.classList.contains('show');

            if (!shouldOpen) {
                closeDropdown();
                return;
            }

            draftTaOfficialsDropdown.classList.add('show');
            renderOptions();
            draftTaOfficialsSearch.focus();
        });

        draftTaOfficialsSearch.addEventListener('input', renderOptions);
        draftTaOfficialsSearch.addEventListener('click', (e) => e.stopPropagation());

        document.addEventListener('click', (e) => {
            if (headerPopup.contains(e.target) || e.target === userMenuBtn || userMenuBtn.contains(e.target)) {
                return;
            }

            closeDropdown();
        });

        return { updateDisplay, renderOptions, closeDropdown };
    };

    const ensureHeaderDraftOfficialsMultiSelect = async () => {
        if (!headerDraftEmployeesMultiSelect) {
            headerDraftEmployeesMultiSelect = createHeaderDraftOfficialsMultiSelect();
            headerDraftEmployeesMultiSelect?.updateDisplay();
        }

        await loadHeaderDraftEmployees();
        headerDraftEmployeesMultiSelect?.renderOptions();
    };

    if (!userMenuBtn || !headerPopup) {
        return; // Header not loaded yet, allow retry
    }
    
    headerButtonsInitialized = true;

    const closeDraftTaModal = () => {
        if (!draftTaModal) return;
        headerDraftEmployeesMultiSelect?.closeDropdown();
        draftTaModal.classList.remove('show');
        document.body.classList.remove('header-modal-open');

        // Clear all form fields
        if (draftTaPurposeInput) draftTaPurposeInput.value = '';
        if (draftTaDestinationInput) draftTaDestinationInput.value = '';
        if (draftTaTravelTypeSelect) draftTaTravelTypeSelect.value = 'official_business';
        if (draftTaFundingOptionSelect) draftTaFundingOptionSelect.value = 'reimbursement';
        if (draftTaDateRequestInput) draftTaDateRequestInput.value = '';
        if (draftTaTravelDateInput) draftTaTravelDateInput.value = '';
        if (draftTaTravelEndInput) {
            draftTaTravelEndInput.value = '';
            draftTaTravelEndInput.setCustomValidity('');
        }

        // Clear selected officials
        headerDraftSelectedEmployees.length = 0;
        headerDraftEmployeesMultiSelect?.updateDisplay();
    };

    const clearDraftTaForm = () => {
        // Clear all form fields but keep modal open
        if (draftTaPurposeInput) draftTaPurposeInput.value = '';
        if (draftTaDestinationInput) draftTaDestinationInput.value = '';
        if (draftTaTravelTypeSelect) draftTaTravelTypeSelect.value = 'official_business';
        if (draftTaFundingOptionSelect) draftTaFundingOptionSelect.value = 'reimbursement';
        if (draftTaDateRequestInput) draftTaDateRequestInput.value = getTodayLocalISO();
        if (draftTaTravelDateInput) draftTaTravelDateInput.value = '';
        if (draftTaTravelEndInput) {
            draftTaTravelEndInput.value = '';
            draftTaTravelEndInput.setCustomValidity('');
        }

        // Clear selected officials
        headerDraftSelectedEmployees.length = 0;
        headerDraftEmployeesMultiSelect?.updateDisplay();

        // Focus back on purpose input
        draftTaPurposeInput?.focus();
    };

    const openDraftTaModal = async () => {
        if (!draftTaModal) return;
        await ensureHeaderDraftOfficialsMultiSelect();
        setDraftTaDateRequestDefault();
        setDraftTaOptionDefaults();
        headerPopup.classList.remove('show');
        draftTaModal.classList.add('show');
        document.body.classList.add('header-modal-open');
        window.requestAnimationFrame(() => {
            draftTaPurposeInput?.focus();
        });
    };

    // Fetch and display user email and name
    if (userEmailElement || userNameElement) {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user?.email) {
                if (userEmailElement) {
                    userEmailElement.textContent = session.user.email;
                }
                
                // Fetch user's first and last name from profiles
                try {
                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('FName, LName')
                        .eq('id', session.user.id)
                        .maybeSingle();
                    
                    if (!error && profile) {
                        setResponsiveHeaderName(
                            profile.FName,
                            profile.LName,
                            session.user.email.split('@')[0]
                        );
                    } else if (userNameElement) {
                        setResponsiveHeaderName('', '', session.user.email.split('@')[0]);
                    }
                } catch (err) {
                    console.error('Error fetching user name:', err);
                    if (userNameElement) {
                        setResponsiveHeaderName('', '', session.user.email.split('@')[0]);
                    }
                }
            } else {
                if (userEmailElement) {
                    userEmailElement.textContent = 'Not available';
                }
                if (userNameElement) {
                    setResponsiveHeaderName('', '', 'User');
                }
            }
        }).catch(() => {
            if (userEmailElement) {
                userEmailElement.textContent = 'Not available';
            }
            if (userNameElement) {
                setResponsiveHeaderName('', '', 'User');
            }
        });
    }

    // Toggle popup when user menu button is clicked
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerPopup.classList.toggle('show');
    });

    if (draftTaForm) {
        draftTaForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });
    }

    if (draftTaOption) {
        draftTaOption.addEventListener('click', () => {
            void openDraftTaModal();
        });
    }

    if (draftTaCloseBtn) {
        draftTaCloseBtn.addEventListener('click', closeDraftTaModal);
    }

    if (draftTaClearBtn) {
        draftTaClearBtn.addEventListener('click', clearDraftTaForm);
    }

    if (draftTaTravelDateInput && draftTaTravelEndInput) {
        const validateTravelDates = () => {
            const travelDate = draftTaTravelDateInput.value;
            const travelEnd = draftTaTravelEndInput.value;

            if (travelDate && travelEnd && travelEnd < travelDate) {
                draftTaTravelEndInput.setCustomValidity('Travel end date cannot be before travel date');
            } else {
                draftTaTravelEndInput.setCustomValidity('');
            }
        };

        draftTaTravelDateInput.addEventListener('change', validateTravelDates);
        draftTaTravelEndInput.addEventListener('change', validateTravelDates);
    }

    if (draftTaCreateBtn) {
        draftTaCreateBtn.addEventListener('click', () => {
            // Validate required fields
            if (!draftTaPurposeInput?.value.trim()) {
                alert('Please enter the purpose of travel.');
                draftTaPurposeInput?.focus();
                return;
            }

            if (!draftTaDestinationInput?.value.trim()) {
                alert('Please enter the destination.');
                draftTaDestinationInput?.focus();
                return;
            }

            if (!draftTaTravelDateInput?.value) {
                alert('Please select the travel date.');
                draftTaTravelDateInput?.focus();
                return;
            }

            if (headerDraftSelectedEmployees.length === 0) {
                alert('Please select at least one official.');
                return;
            }

            // Check date validation
            const travelDate = draftTaTravelDateInput.value;
            const travelEnd = draftTaTravelEndInput?.value;
            const dateRequest = draftTaDateRequestInput?.value || getTodayLocalISO();
            const travelType = draftTaTravelTypeSelect?.value || 'official_business';
            const fundingOption = draftTaFundingOptionSelect?.value || 'reimbursement';

            if (travelDate && travelEnd && travelEnd < travelDate) {
                alert('Travel end date cannot be before travel date.');
                draftTaTravelEndInput?.focus();
                return;
            }

            // Format dates
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr + 'T00:00:00');
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            };

            // Prepare officials data with positions
            const officialsData = headerDraftSelectedEmployees.map(name => {
                const cleanName = String(name || '').trim();
                const employee = employeesList.find(emp => String(emp.name || '').trim() === cleanName);
                return {
                    name: cleanName,
                    position: employee ? employee.position : ''
                };
            });

            // Prepare form data
            const formData = {
                purpose: draftTaPurposeInput.value.trim(),
                destination: draftTaDestinationInput.value.trim(),
                travelType,
                fundingOption,
                dateRequested: dateRequest,
                dateRequestedFormatted: formatDate(dateRequest),
                travelDateFormatted: formatDate(travelDate),
                travelEndFormatted: travelEnd ? formatDate(travelEnd) : '',
                travelEnd: travelEnd,
                officials: officialsData
            };

            // Generate PDF
            if (window.generateTAPDF) {
                window.generateTAPDF(formData);
                closeDraftTaModal();
            } else {
                alert('PDF generator not loaded. Please refresh the page.');
            }
        });
    }

    if (draftTaModal) {
        draftTaModal.addEventListener('click', (e) => {
            if (e.target === draftTaModal) {
                closeDraftTaModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && draftTaModal?.classList.contains('show')) {
            closeDraftTaModal();
        }
    });

    // Handle settings option click
    if (settingsOption) {
        settingsOption.addEventListener('click', () => {
            headerPopup.classList.remove('show');
            document.getElementById('settings-modal').classList.add('show');
        });
    }

    // Handle logout option click
    if (logoutOption) {
        logoutOption.addEventListener('click', async () => {
            headerPopup.classList.remove('show');
            
            // Check if showConfirmation is available
            if (!window.adminShowConfirmation) {
                console.error('showConfirmation not available');
                return;
            }
            
            // Show confirmation dialog
            const confirmed = await window.adminShowConfirmation(
                'Confirm Logout',
                'Are you sure you want to log out?'
            );

            if (!confirmed) {
                return; // User cancelled
            }

            try {
                await markCurrentUserOffline();
                clearAdminClientState();
                await supabase.auth.signOut();
                window.location.href = "../index.html";
            } catch (error) {
                console.error("Logout error:", error);
                clearAdminClientState();
                window.location.href = "../index.html";
            }
        });
    }

    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (!headerPopup.contains(e.target) && 
            e.target !== userMenuBtn && !userMenuBtn.contains(e.target)) {
            headerPopup.classList.remove('show');
        }
    });
};

// Multi-select employees functionality
let employeesList = [];
window.adminEmployeesList = employeesList;
let selectedEmployees = [];
let updateSelectedEmployees = [];

const loadEmployees = async () => {
    try {
        const { data, error } = await supabase
            .from("employee_list")
            .select("name, position, is_active")
            .order("is_active", { ascending: false })
            .order("name", { ascending: true });

        if (error) throw error;
        employeesList = data || [];
        // Don't call render functions here - they'll be called after multi-selects are created
        if (window.adminRenderEmployeesOptions) {
            window.adminRenderEmployeesOptions();
        }
        if (window.adminRenderUpdateEmployeesOptions) {
            window.adminRenderUpdateEmployeesOptions();
        }
    } catch (error) {
        console.error("Failed to load employees:", error);
        employeesList = [];
    }
};

// Expose loadEmployees globally so it can be called from employees.js
window.adminLoadEmployees = loadEmployees;

const createMultiSelect = (displayId, dropdownId, searchId, optionsId, selectedArray, supabase) => {
    const display = document.getElementById(displayId);
    const dropdown = document.getElementById(dropdownId);
    const search = document.getElementById(searchId);
    const options = document.getElementById(optionsId);

    const updateDisplay = () => {
        if (selectedArray.length === 0) {
            display.innerHTML = '<span class=\"multiselect-placeholder\">Select officials...</span>';
        } else {
            display.innerHTML = selectedArray.map(name => 
                `<span class=\"multiselect-tag\">${escapeHtml(name)}<button type=\"button\" class=\"multiselect-remove\" data-name=\"${escapeHtml(name)}\">&times;</button></span>`
            ).join('');
            
            display.querySelectorAll('.multiselect-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = e.target.getAttribute('data-name');
                    const index = selectedArray.indexOf(name);
                    if (index > -1) {
                        selectedArray.splice(index, 1);
                        updateDisplay();
                        renderOptions();
                    }
                });
            });
        }
    };

    const renderOptions = () => {
        const searchTerm = search.value.toLowerCase();
        const filtered = employeesList.filter(emp => 
            emp.name.toLowerCase().includes(searchTerm) && !selectedArray.includes(emp.name)
        );
        
        if (filtered.length === 0) {
            if (searchTerm.trim()) {
                // If there's a search term but no matches, offer to add it
                options.innerHTML = `
                    <div class="multiselect-no-options">
                        No matching officials found
                        <br>
                        <button type="button" class="multiselect-add-btn">Add "${escapeHtml(search.value.trim())}"</button>
                    </div>
                `;
                
                // Add click handler for the add button
                const addBtn = options.querySelector('.multiselect-add-btn');
                if (addBtn) {
                    addBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const nameToAdd = search.value.trim();
                        
                        if (!nameToAdd) return;
                        
                        // Validate allowed characters
                        const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
                        if (!namePattern.test(nameToAdd)) {
                            alert('Only letters, hyphens, apostrophes, periods, and commas are allowed.');
                            return;
                        }
                        
                        // Validate length
                        if (nameToAdd.length > 30) {
                            alert('Official name cannot exceed 30 characters.');
                            return;
                        }
                        
                        // Check if already exists in the list
                        const existingEmployee = employeesList.find(emp => emp.name.toLowerCase() === nameToAdd.toLowerCase());
                        if (existingEmployee) {
                            // If exists, just add to selection
                            if (!selectedArray.includes(existingEmployee.name)) {
                                selectedArray.push(existingEmployee.name);
                                search.value = '';
                                updateDisplay();
                                renderOptions();
                            }
                            return;
                        }
                        
                        try {
                            // Disable button during operation
                            addBtn.disabled = true;
                            addBtn.textContent = 'Adding...';
                            
                            // Insert into database
                            const { error } = await supabase
                                .from('employee_list')
                                .insert([{ name: nameToAdd, position: 'Not specified', is_active: true }]);
                            
                            if (error) {
                                console.error('Database insert error:', error);
                                if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                                    alert('This official name already exists in the database.');
                                } else {
                                    alert('Failed to add official: ' + error.message);
                                }
                                addBtn.disabled = false;
                                addBtn.textContent = `Add "${nameToAdd}"`;
                                return;
                            }
                            
                            // Reload employees list
                            await loadEmployees();
                            
                            // Add to selection
                            if (!selectedArray.includes(nameToAdd)) {
                                selectedArray.push(nameToAdd);
                            }
                            
                            search.value = '';
                            updateDisplay();
                            renderOptions();
                        } catch (error) {
                            console.error('Error adding official:', error);
                            alert('Failed to add official.');
                            addBtn.disabled = false;
                            addBtn.textContent = `Add "${nameToAdd}"`;
                        }
                    });
                }
            } else {
                options.innerHTML = '<div class="multiselect-no-options">No options available</div>';
            }
        } else {
            options.innerHTML = filtered.map(emp => {
                const inactiveClass = emp.is_active === false ? ' inactive-employee' : '';
                const inactiveLabel = emp.is_active === false ? ' <span class=\"inactive-label\">(Inactive)</span>' : '';
                return `<div class=\"multiselect-option${inactiveClass}\" data-name=\"${escapeHtml(emp.name)}\">${escapeHtml(emp.name)}${inactiveLabel}</div>`;
            }).join('');
            
            options.querySelectorAll('.multiselect-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = opt.getAttribute('data-name');
                    if (!selectedArray.includes(name)) {
                        selectedArray.push(name);
                        search.value = ''; // Clear search input after selection
                        updateDisplay();
                        renderOptions();
                    }
                });
            });
        }
    };

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
        if (dropdown.classList.contains('show')) {
            renderOptions(); // Render options when dropdown opens
            search.focus();
        }
    });

    search.addEventListener('input', renderOptions);
    search.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
        // Don't close dropdown if clicking on header popup elements
        const headerPopup = document.getElementById('header-popup-panel');
        const userMenuBtn = document.getElementById('user-menu-btn');
        if (headerPopup && (headerPopup.contains(e.target) || e.target === userMenuBtn || userMenuBtn?.contains(e.target))) {
            return;
        }
        if (dropdown.classList.contains('show')) {
            search.value = ''; // Clear search input when closing dropdown
        }
        dropdown.classList.remove('show');
    });

    return { updateDisplay, renderOptions };
};

// Wait for upload panel to load before initializing multi-selects
uploadPanelLoaded.then(async () => {
    // Load employees first
    await loadEmployees();
    
    const employeesMultiSelect = createMultiSelect(
        'employees-display',
        'employees-dropdown',
        'employees-search',
        'employees-options',
        selectedEmployees,
        supabase
    );
    
    // Store reference globally for renderEmployeesOptions
    window.uploadEmployeesMultiSelect = employeesMultiSelect;

    // Initialize upload panel with required dependencies
    if (window.initUploadPanel) {
        window.initUploadPanel(supabase, selectedEmployees, employeesMultiSelect);
    }

    // Apply demo checkbox visibility setting after panel is loaded
    if (window.applyDemoCheckboxVisibility) {
        window.applyDemoCheckboxVisibility(window.getDemoCheckboxVisible());
    }
});

// updateEmployeesMultiSelect will be initialized after view modals load
let updateEmployeesMultiSelect = null;

// Initialize update multi-select after view panel/modals are loaded
viewPanelLoaded.then(() => {
    updateEmployeesMultiSelect = createMultiSelect(
        'update-employees-display',
        'update-employees-dropdown',
        'update-employees-search',
        'update-employees-options',
        updateSelectedEmployees,
        supabase
    );
    // Render options now if employees already loaded
    if (employeesList.length > 0) {
        updateEmployeesMultiSelect.renderOptions();
    }

    // Apply demo checkbox visibility setting after modals are loaded
    if (window.applyDemoCheckboxVisibility) {
        window.applyDemoCheckboxVisibility(window.getDemoCheckboxVisible());
    }
});

// Parse a comma-separated employee string, respecting names that contain commas (e.g. "Aban, Jr.")
const parseEmployeeNames = (employeesStr) => {
    if (!employeesStr) return [];
    const knownNames = employeesList.map(emp => emp.name);
    // Sort by length descending so longer names (with commas) match first
    const sortedNames = knownNames.slice().sort((a, b) => b.length - a.length);
    const result = [];
    let remaining = employeesStr.trim();

    while (remaining.length > 0) {
        let matched = false;
        for (const name of sortedNames) {
            if (remaining.startsWith(name)) {
                result.push(name);
                remaining = remaining.substring(name.length).replace(/^,\s*/, '');
                matched = true;
                break;
            }
        }
        if (!matched) {
            // Fallback: take until next comma
            const commaIdx = remaining.indexOf(',');
            if (commaIdx > -1) {
                result.push(remaining.substring(0, commaIdx).trim());
                remaining = remaining.substring(commaIdx + 1).trim();
            } else {
                if (remaining.trim()) result.push(remaining.trim());
                remaining = '';
            }
        }
    }
    return result.filter(name => name);
};
window.adminParseEmployeeNames = parseEmployeeNames;

const renderEmployeesOptions = () => {
    if (window.uploadEmployeesMultiSelect) {
        window.uploadEmployeesMultiSelect.renderOptions();
    }
};
window.adminRenderEmployeesOptions = renderEmployeesOptions;

const renderUpdateEmployeesOptions = () => {
    if (updateEmployeesMultiSelect) {
        updateEmployeesMultiSelect.renderOptions();
    }
};
window.adminRenderUpdateEmployeesOptions = renderUpdateEmployeesOptions;

const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

const safeUrl = (url) => {
    if (!url) return '#';
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return url;
        }
    } catch (e) {}
    return '#';
};

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 0) return 'File size: -';
    if (bytes < 1024) return `File size: ${bytes} B`;
    if (bytes < 1024 * 1024) return `File size: ${(bytes / 1024).toFixed(1)} KB`;
    return `File size: ${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fileSizeCache = new Map();

const fetchFileSizeBytes = async (url) => {
    if (!url || url === '#') return null;
    if (fileSizeCache.has(url)) return fileSizeCache.get(url);

    try {
        const headResponse = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        const contentLength = headResponse.headers.get('content-length');
        const headSize = Number(contentLength);
        if (headResponse.ok && Number.isFinite(headSize) && headSize > 0) {
            fileSizeCache.set(url, headSize);
            return headSize;
        }
    } catch (error) {
        console.warn('HEAD size lookup failed:', error);
    }

    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        const blob = await response.blob();
        const size = blob.size;
        if (Number.isFinite(size) && size > 0) {
            fileSizeCache.set(url, size);
            return size;
        }
    } catch (error) {
        console.warn('Blob size lookup failed:', error);
    }

    return null;
};

const updateViewFileSize = async (fileUrl) => {
    const sizeEl = document.getElementById('view-file-size');
    const linkEl = document.getElementById('view-file-link');
    if (!sizeEl || !linkEl) return;
    if (!fileUrl || fileUrl === '#') {
        sizeEl.textContent = 'File size: -';
        return;
    }

    sizeEl.textContent = 'File size: Loading...';
    const expectedUrl = fileUrl;
    const size = await fetchFileSizeBytes(fileUrl);

    if ((linkEl.dataset.fileUrl || linkEl.getAttribute('href') || '') !== expectedUrl) {
        return;
    }

    sizeEl.textContent = size ? formatFileSize(size) : 'File size: Unavailable';
};

const formatFileLabel = (_value) => "Download";

const isValidTaNumber = (value) => /^\d{4}-\d{2}-\d{4}$/.test(value);
window.isValidTaNumber = isValidTaNumber; // Expose for upload.js

const formatTaNumber = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const part1 = digits.slice(0, 4);
    const part2 = digits.slice(4, 6);
    const part3 = digits.slice(6, 10);
    if (digits.length <= 4) return part1;
    if (digits.length <= 6) return `${part1}-${part2}`;
    return `${part1}-${part2}-${part3}`;
};

const bindTaFormatter = (input) => {
    if (!input) return; // Guard against null elements
    input.addEventListener("input", () => {
        input.value = formatTaNumber(input.value);
    });
};
window.bindTaFormatter = bindTaFormatter; // Expose for upload.js

// Panel switching logic
const adminPanelSwitcher = document.querySelector(".admin-panel-switcher");
const switchButtons = document.querySelectorAll(".switch-btn");

// Sidebar collapse toggle
const adminSidebar = document.getElementById('admin-sidebar');
const adminSidebarToggle = document.getElementById('admin-sidebar-toggle');
const adminWrapper = document.getElementById('admin-wrapper');

const savedAdminSidebarCollapsed = localStorage.getItem('adminSidebarCollapsed') === 'true';
if (adminSidebar && savedAdminSidebarCollapsed) {
    adminSidebar.classList.add('collapsed');
    if (adminWrapper) adminWrapper.classList.add('sidebar-collapsed');
}

if (adminSidebar && adminSidebarToggle) {
    adminSidebarToggle.addEventListener('click', () => {
        const isNowCollapsed = adminSidebar.classList.toggle('collapsed');
        if (adminWrapper) adminWrapper.classList.toggle('sidebar-collapsed', isNowCollapsed);
        localStorage.setItem('adminSidebarCollapsed', isNowCollapsed);
    });
}

const updateAdminSwitcherLayout = () => {
    if (!adminPanelSwitcher) return;

    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
    if (!isSmallScreen) {
        adminPanelSwitcher.classList.remove("compact-icons");
        return;
    }

    adminPanelSwitcher.classList.remove("compact-icons");
    window.requestAnimationFrame(() => {
        const hasOverflow = adminPanelSwitcher.scrollWidth > (adminPanelSwitcher.clientWidth + 2);
        adminPanelSwitcher.classList.toggle("compact-icons", hasOverflow);
    });
};

const updateAdminSwitcherStickyState = () => {
    if (!adminPanelSwitcher) return;

    const stickyTop = parseFloat(window.getComputedStyle(adminPanelSwitcher).top) || 0;
    const { top } = adminPanelSwitcher.getBoundingClientRect();
    const isStuck = window.scrollY > 0 && top <= (stickyTop + 1);
    adminPanelSwitcher.classList.toggle("is-stuck", isStuck);
};

window.addEventListener("resize", updateAdminSwitcherLayout);
window.addEventListener("load", updateAdminSwitcherLayout);
window.addEventListener("resize", updateAdminSwitcherStickyState);
window.addEventListener("load", updateAdminSwitcherStickyState);
window.addEventListener("scroll", updateAdminSwitcherStickyState, { passive: true });
updateAdminSwitcherLayout();
updateAdminSwitcherStickyState();

const isSuperUser = () => window.adminCurrentRole === 'super';

const enforceUsersPanelAccess = () => {
    const usersPanelBtn = document.getElementById('users-panel-btn');
    const usersPanel = document.getElementById('users-panel');
    const shouldHideUsersAccess = !isSuperUser();

    if (usersPanelBtn) {
        usersPanelBtn.classList.toggle('hidden', shouldHideUsersAccess);
        usersPanelBtn.toggleAttribute('hidden', shouldHideUsersAccess);
    }

    if (!isSuperUser() && usersPanel) {
        usersPanel.classList.add('hidden');
    }

    if (!isSuperUser() && localStorage.getItem('adminActivePanel') === 'users-panel') {
        localStorage.setItem('adminActivePanel', 'upload-panel');
    }

    updateAdminSwitcherLayout();
};

const revealAdminPanel = (panelEl) => {
    if (!panelEl) return;

    panelEl.classList.remove("hidden");
    panelEl.classList.remove("admin-panel-enter");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    // Force reflow so the enter animation reliably restarts on each switch.
    void panelEl.offsetWidth;
    panelEl.classList.add("admin-panel-enter");
};

const activateAdminPanel = (targetPanel) => {
    if (!targetPanel) return;

    // Super-only panel hard gate.
    if (targetPanel === 'users-panel' && !isSuperUser()) {
        console.warn('Users panel is restricted to super users.');
        activateAdminPanel('upload-panel');
        return;
    }

    // Persist active panel
    localStorage.setItem("adminActivePanel", targetPanel);

    // Update active button
    switchButtons.forEach((button) => {
        const isActive = button.getAttribute("data-panel") === targetPanel;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // Get dynamically loaded panels (they're loaded asynchronously)
    const uploadPanel = document.getElementById("upload-panel");
    const viewPanel = document.getElementById("view-panel");
    const employeesPanel = document.getElementById("employees-panel");
    const usersPanel = document.getElementById("users-panel");

    const allPanels = [uploadPanel, viewPanel, employeesPanel, usersPanel];

    // Show/hide panels
    allPanels.forEach((panelEl) => {
        if (!panelEl) return;
        panelEl.classList.add("hidden");
        panelEl.classList.remove("admin-panel-enter");
    });

    if (targetPanel === "upload-panel") {
        if (uploadPanel) {
            revealAdminPanel(uploadPanel);
        }
    } else if (targetPanel === "view-panel") {
        if (viewPanel) {
            revealAdminPanel(viewPanel);
            // Call loadTravelAuthoritiesIfNeeded if it exists on window
            if (window.loadTravelAuthoritiesIfNeeded) {
                window.loadTravelAuthoritiesIfNeeded();
            }
        }
    } else if (targetPanel === "employees-panel") {
        if (employeesPanel) {
            revealAdminPanel(employeesPanel);
            // Call renderEmployeeList if it exists on window
            if (window.employeeRenderList) {
                window.employeeRenderList();
            }
        }
    } else if (targetPanel === "users-panel") {
        const showUsersPanel = () => {
            const currentUsersPanel = document.getElementById("users-panel");
            if (!currentUsersPanel) {
                return;
            }

            revealAdminPanel(currentUsersPanel);
            loadUsers();
        };

        if (usersPanel) {
            showUsersPanel();
        } else {
            loadUsersPanel().then((loaded) => {
                if (loaded) {
                    showUsersPanel();
                }
            });
        }
    }
};

switchButtons.forEach((button) => {
    button.addEventListener("click", () => {
        activateAdminPanel(button.getAttribute("data-panel"));
    });
});

// ============================================
// VIEW PANEL FUNCTIONALITY  
// ============================================

// Wait for view panel to load before initializing
viewPanelLoaded.then(() => {
let latestKnownTimestamp = null;
// Table view functionality
const viewBody = document.getElementById("view-body");
        const viewStatus = document.getElementById("view-status");
        const viewMoreBtn = document.getElementById("view-more");
const deleteModal = document.getElementById("delete-modal");
const viewModal = document.getElementById("view-modal");
const updateModal = document.getElementById("update-modal");
const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const cancelConfirmBtn = document.getElementById("cancel-confirm");
const confirmConfirmBtn = document.getElementById("confirm-confirm");
        const cancelDeleteBtn = document.getElementById("cancel-delete");
        const closeViewBtn = document.getElementById("close-view");
const confirmDeleteBtn = document.getElementById("confirm-delete");
const cancelUpdateBtn = document.getElementById("cancel-update");
const confirmUpdateBtn = document.getElementById("confirm-update");
const updateOcrBtn = document.getElementById("update-ocr-btn");
if (updateOcrBtn) {
    updateOcrBtn.addEventListener("click", async () => {
        const updateScanFile = document.getElementById("update-scan-file");
        const file = updateScanFile && updateScanFile.files && updateScanFile.files[0];
        if (!file) {
            const hint = document.getElementById("update-ocr-hint");
            if (hint) {
                hint.textContent = "No file attached. Upload a scanned file first.";
                hint.classList.add("status--error");
                setTimeout(() => { hint.textContent = "Scan the attached file to autofill purpose and destination."; hint.classList.remove("status--error"); }, 3000);
            }
            return;
        }
        if (typeof window.autoFillFieldOCR !== "function") {
            console.warn("[OCR] autoFillFieldOCR not ready yet");
            return;
        }
        const originalHTML = updateOcrBtn.innerHTML;
        updateOcrBtn.disabled = true;
        updateOcrBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="animation:ocr-spin .7s linear infinite"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg> Scanning\u2026';
        const results = await Promise.allSettled([
            window.autoFillFieldOCR("purpose", file),
            window.autoFillFieldOCR("destination", file)
        ]);
        let filled = 0;
        [["purpose", "update-purpose"], ["destination", "update-destination"]].forEach(([key, elId], i) => {
            const r = results[i];
            if (r.status === "fulfilled" && r.value) {
                const el = document.getElementById(elId);
                if (el) { el.value = r.value; el.dispatchEvent(new Event("input", { bubbles: true })); filled++; }
            } else {
                console.warn(`[OCR] ${key}: ${results[i].reason?.message || "failed"}`);
            }
        });
        updateOcrBtn.innerHTML = filled === 2 ? "\u2713 Both filled!" : filled === 1 ? "\u2713 1 of 2 filled" : "\u2717 Not found \u2014 try a clearer scan";
        const hint = document.getElementById("update-ocr-hint");
        if (hint && filled > 0) hint.textContent = "Please review and correct any misscanned text before updating.";
        setTimeout(() => { updateOcrBtn.innerHTML = originalHTML; updateOcrBtn.disabled = false; }, 2500);
    });
}
const viewTaNumber = document.getElementById("view-ta-number");
const viewPurpose = document.getElementById("view-purpose");
const viewDestination = document.getElementById("view-destination");
const viewEmployees = document.getElementById("view-employees");
const viewTravelDate = document.getElementById("view-travel-date");
const viewTravelUntil = document.getElementById("view-travel-until");
const viewFileLink = document.getElementById("view-file-link");
const viewFileSize = document.getElementById("view-file-size");
const updateTaInput = document.getElementById("update-ta-number");
const updatePurposeInput = document.getElementById("update-purpose");
const updateDestinationInput = document.getElementById("update-destination");
const updateTravelDateInput = document.getElementById("update-travel-date");
const updateTravelUntilInput = document.getElementById("update-travel-until");
const updateScanFileInput = document.getElementById("update-scan-file");
const updateIsDemoCheckbox = document.getElementById("update-is-demo-checkbox");
const updateStatus = document.getElementById("update-status");
const toast = document.getElementById("toast");
bindTaFormatter(updateTaInput);

const autoResizeUpdateTextarea = (el) => {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    const minH = parseFloat(getComputedStyle(el).minHeight) || 0;
    const newH = Math.min(Math.max(el.scrollHeight, minH), 170);
    el.style.height = newH + 'px';
    el.style.overflowY = el.scrollHeight > 170 ? 'auto' : 'hidden';
};
[updatePurposeInput, updateDestinationInput].forEach(el => {
    if (el) el.addEventListener('input', () => autoResizeUpdateTextarea(el));
});

// Upload panel TA validation will be handled in upload.js after panel loads

// Real-time TA number validation for update modal
let updateTaCheckTimer = null;
updateTaInput.addEventListener("input", async () => {
    const taNumber = updateTaInput.value.trim();
    
    // Clear existing timer
    if (updateTaCheckTimer) {
        clearTimeout(updateTaCheckTimer);
    }
    
    // Only check if TA number is valid (matches pattern)
    if (isValidTaNumber(taNumber)) {
        // Debounce the database check by 500ms
        updateTaCheckTimer = setTimeout(async () => {
            try {
                // Check if TA exists in a different record (not the current one being updated)
                const { data, error } = await supabase
                    .from("travel_authorities")
                    .select("id, ta_number")
                    .eq("ta_number", taNumber)
                    .maybeSingle();
                
                if (error && error.code !== 'PGRST116') {
                    // PGRST116 is "no rows returned" - that's expected if TA doesn't exist
                    console.error("Error checking TA number:", error);
                    return;
                }
                
                // Only warn if TA exists AND it's a different record than the one being updated
                if (data && updateRecordData && data.id !== updateRecordData.id) {
                    showToast(`TA ${taNumber} already exists in another record.`, "warning");
                }
            } catch (err) {
                console.error("Error checking TA number:", err);
            }
        }, 500);
    }
});

const recordCache = new Map();
let viewRows = [];
const currentYear = new Date().getFullYear().toString();
let deleteRecordData = null;
let updateRecordData = null;
let toastTimer = null;
let adminActiveFilters = {
    taNumber: "",
    employee: "",
    year: currentYear,
    travelDate: "",
    matchAll: true
};
let adminActiveSort = {
    by: "",
    order: "asc"
};
let adminEmployeesListForFilter = [];
window.adminEmployeesListForFilter = adminEmployeesListForFilter;

// Helper functions for localStorage persistence
const saveAdminFiltersToStorage = () => {
    localStorage.setItem('adminFilters', JSON.stringify(adminActiveFilters));
};

const loadAdminFiltersFromStorage = () => {
    const saved = localStorage.getItem('adminFilters');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            adminActiveFilters = { ...adminActiveFilters, ...parsed };
        } catch (e) {
            console.error('Failed to parse saved admin filters:', e);
        }
    }
};

const saveAdminSortToStorage = () => {
    localStorage.setItem('adminSort', JSON.stringify(adminActiveSort));
};

const loadAdminSortFromStorage = () => {
    const saved = localStorage.getItem('adminSort');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            adminActiveSort = { ...adminActiveSort, ...parsed };
        } catch (e) {
            console.error('Failed to parse saved admin sort:', e);
        }
    }
};

const updateAdminButtonStates = () => {
    const adminFilterToggleBtn = document.getElementById("admin-filter-toggle-btn");
    const adminSortToggleBtn = document.getElementById("admin-sort-toggle-btn");
    
    // Check if filters are active (not default)
    const isFilterActive = adminActiveFilters.taNumber || 
        adminActiveFilters.employee || 
        (adminActiveFilters.year && adminActiveFilters.year !== new Date().getFullYear().toString()) || 
        adminActiveFilters.travelDate ||
        adminActiveFilters.matchAll === false;
    
    // Check if sort is active
    const isSortActive = adminActiveSort.by !== "";
    
    if (adminFilterToggleBtn) {
        if (isFilterActive) {
            adminFilterToggleBtn.classList.add('active');
        } else {
            adminFilterToggleBtn.classList.remove('active');
        }
    }
    
    if (adminSortToggleBtn) {
        if (isSortActive) {
            adminSortToggleBtn.classList.add('active');
        } else {
            adminSortToggleBtn.classList.remove('active');
        }
    }
};

const showToast = (message, type = 'success', duration = 2600) => {
    if (!toast) return;
    toast.textContent = message;
    // Remove any existing type classes
    toast.classList.remove('toast--success', 'toast--info', 'toast--warning', 'toast--error');
    // Add the new type class
    toast.classList.add(`toast--${type}`);
    toast.classList.add("show");
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    if (duration > 0) toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
};
// Expose for upload.js
window.showToast = showToast;
window.adminShowToast = showToast;

const isGzipFileLink = (fileUrl, fileName = "") => {
    const fromUrl = /\.gz(?:$|[?#])/i.test(String(fileUrl || ""));
    const fromName = /\.gz$/i.test(String(fileName || ""));
    return fromUrl || fromName;
};

const getReconstructedMimeType = (fileName = "") => {
    const lower = String(fileName).toLowerCase().replace(/\.gz$/, "");
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
};

const openStoredFile = async (fileUrl, fileName = "") => {
    const safeFileUrl = safeUrl(fileUrl);
    if (safeFileUrl === '#') return;

    // Check if browser supports DecompressionStream (most modern desktop browsers)
    const supportsDecompression = typeof DecompressionStream === 'function';
    const isCompressed = isGzipFileLink(safeFileUrl, fileName);

    // If compressed and browser supports decompression, decompress before opening
    if (isCompressed && supportsDecompression) {
        try {
            showToast('Opening compressed file...', 'info', 1800);
            const response = await fetch(safeFileUrl, { cache: 'no-store' });
            if (!response.ok || !response.body) {
                throw new Error(`Download failed (${response.status})`);
            }

            const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
            const decompressedBlob = await new Response(decompressedStream).blob();
            const mimeType = getReconstructedMimeType(fileName);
            const rebuiltBlob = new Blob([decompressedBlob], { type: mimeType });

            const objectUrl = URL.createObjectURL(rebuiltBlob);
            window.open(objectUrl, '_blank', 'noopener');
            
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
            return;
        } catch (error) {
            console.error('Failed to decompress file:', error);
            // Fall through to opening the URL directly
        }
    }

    // For non-compressed files or when decompression not supported/failed:
    // Open the file URL in a new tab
    window.open(safeFileUrl, '_blank', 'noopener');
    
    if (isCompressed && !supportsDecompression) {
        showToast('Opening file (note: compressed files may need external decompression on this browser)', 'info', 3000);
    }
};

// Show confirmation modal and return a Promise
const showConfirmation = (title, message) => {
    return new Promise((resolve) => {
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmModal.classList.add("show");
        
        // Apply red styling for logout confirmation
        const isLogout = title === 'Confirm Logout';
        if (isLogout) {
            confirmConfirmBtn.style.background = '#a1251b';
        }

        const handleConfirm = () => {
            confirmModal.classList.remove("show");
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            confirmModal.classList.remove("show");
            cleanup();
            resolve(false);
        };

        const handleClickOutside = (e) => {
            if (e.target === confirmModal) {
                confirmModal.classList.remove("show");
                cleanup();
                resolve(false);
            }
        };

        const cleanup = () => {
            confirmConfirmBtn.removeEventListener('click', handleConfirm);
            cancelConfirmBtn.removeEventListener('click', handleCancel);
            confirmModal.removeEventListener('click', handleClickOutside);
            // Reset button styling
            if (isLogout) {
                confirmConfirmBtn.style.background = '';
            }
        };

        confirmConfirmBtn.addEventListener('click', handleConfirm);
        cancelConfirmBtn.addEventListener('click', handleCancel);
        confirmModal.addEventListener('click', handleClickOutside);
    });
};
window.adminShowConfirmation = showConfirmation;

window.flatpickr(updateTravelDateInput, {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    static: false,
    monthSelectorType: 'static',
    position: 'auto center'
});

window.flatpickr(updateTravelUntilInput, {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    static: false,
    monthSelectorType: 'static',
    position: 'auto center'
});

const applyAdminClientFilters = (rows) => {
    // If no filters are active, return all rows
    if (!adminActiveFilters.taNumber && !adminActiveFilters.employee && !adminActiveFilters.year && !adminActiveFilters.travelDate) {
        return rows;
    }

    return rows.filter(row => {
        const checks = [];

        // Check TA Number filter
        if (adminActiveFilters.taNumber) {
            const matchesTa = row.ta_number && row.ta_number.toLowerCase().includes(adminActiveFilters.taNumber.toLowerCase());
            checks.push(matchesTa);
        }

        // Check Employee filter (contains match for comma-separated values)
        if (adminActiveFilters.employee) {
            const matchesEmployee = row.employees && row.employees.toLowerCase().includes(adminActiveFilters.employee.toLowerCase());
            checks.push(matchesEmployee);
        }

        // Check Year filter
        if (adminActiveFilters.year) {
            const matchesYear = row.travel_date && row.travel_date.startsWith(adminActiveFilters.year);
            checks.push(matchesYear);
        }

        // Check Travel Date filter
        if (adminActiveFilters.travelDate) {
            const matchesDate = row.travel_date && row.travel_date === adminActiveFilters.travelDate;
            checks.push(matchesDate);
        }

        // Return based on match mode (AND or OR)
        if (adminActiveFilters.matchAll) {
            // AND: all filters must match
            return checks.every(check => check === true);
        } else {
            // OR: at least one filter must match
            return checks.some(check => check === true);
        }
    });
};

const applyAdminClientSorting = (rows) => {
    if (!adminActiveSort.by) {
        return rows;
    }

    const sorted = [...rows].sort((a, b) => {
        let aVal, bVal;

        if (adminActiveSort.by === 'ta') {
            aVal = a.ta_number || '';
            bVal = b.ta_number || '';
        } else if (adminActiveSort.by === 'travel-date') {
            aVal = a.travel_date || '';
            bVal = b.travel_date || '';
        }

        if (adminActiveSort.order === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });

    return sorted;
};

const renderViewRows = (rows) => {
    const filteredRows = applyAdminClientFilters(rows);
    const sortedRows = applyAdminClientSorting(filteredRows);
    
    if (!sortedRows.length) {
        recordCache.clear();
        viewBody.innerHTML = "<tr><td colspan=\"8\">No records match the current filters.</td></tr>";
        return;
    }

    recordCache.clear();
    sortedRows.forEach((row) => {
        recordCache.set(String(row.id), row);
    });

    viewBody.innerHTML = sortedRows.map((row) => {
        const dateText = row.travel_date ? new Date(row.travel_date).toLocaleDateString() : "-";
        const untilText = row.travel_until ? new Date(row.travel_until).toLocaleDateString() : "-";
        const fileUrl = safeUrl(row.file_url);
        const safeName = row.file_name || "Download";
        const displayName = formatFileLabel(safeName);
        const hasFile = !!row.file_url;
        const isDemoClass = row.is_demo ? " is-demo" : "";
        
        // Truncate employees to show max 2
        let employeesText = row.employees || "-";
        if (employeesText !== "-") {
            const employeeArray = parseEmployeeNames(employeesText);
            if (employeeArray.length > 2) {
                employeesText = employeeArray.slice(0, 2).join(", ") + "...";
            }
        }

        return `
            <tr data-id="${escapeHtml(row.id)}" class="${isDemoClass}">
                <td>
                    <button class="view-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="View details">
                        <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        </svg>
                    </button>
                </td>
                <td>${escapeHtml(row.ta_number) || "-"}</td>
                <td><span class="truncate">${escapeHtml(row.purpose) || "-"}</span></td>
                <td style="text-align: left;"><span class="truncate">${escapeHtml(row.destination) || "-"}</span></td>
                <td style="text-align: left;"><span class="truncate">${escapeHtml(employeesText)}</span></td>
                <td>${dateText}</td>
                <td>${untilText}</td>
                <td>
                    ${hasFile
                        ? `<a class="file-link open-file-link" href="${fileUrl}" data-file-url="${fileUrl}" data-file-name="${escapeHtml(safeName)}" target="_blank" rel="noopener">${escapeHtml(displayName)}</a>`
                        : `<span class="file-not-ready">Unavailable</span>`
                    }
                </td>
                <td class="actions-cell">
                    <button class="update-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="Update" title="Update">
                        <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                    </button>
                    <button class="delete-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="Delete" title="Delete">
                        <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                            <path d="M9 3h6l1 2h4a1 1 0 1 1 0 2h-1l-1.1 12.1a2 2 0 0 1-2 1.9H8.1a2 2 0 0 1-2-1.9L5 7H4a1 1 0 0 1 0-2h4l1-2Zm1.1 7a1 1 0 1 0-2 0v7a1 1 0 1 0 2 0v-7Zm5.9 0a1 1 0 1 0-2 0v7a1 1 0 1 0 2 0v-7Z" />
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Add delete button event listeners
    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            const recordId = (row?.getAttribute("data-id") || "").trim();
            const record = recordCache.get(recordId);
            deleteRecordData = {
                id: recordId,
                file_url: record?.file_url || ""
            };
            deleteModal.classList.add("show");
        });
    });

    document.querySelectorAll(".update-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            if (!row) return;
            const recordId = (row.getAttribute("data-id") || "").trim();
            const record = recordCache.get(recordId);
            if (!recordId || !record) return;

            updateRecordData = {
                id: recordId,
                file_url: record.file_url || "",
                file_name: record.file_name || "",
                ta_number: record.ta_number || "",
                purpose: record.purpose || "",
                destination: record.destination || "",
                employees: record.employees || "",
                travel_date: record.travel_date || "",
                travel_until: record.travel_until || "",
                is_demo: record.is_demo || false
            };

            updateTaInput.value = record.ta_number || "";
            updatePurposeInput.value = record.purpose || "";
            updateDestinationInput.value = record.destination || "";
            autoResizeUpdateTextarea(updatePurposeInput);
            autoResizeUpdateTextarea(updateDestinationInput);
            updateTravelDateInput.value = record.travel_date || "";
            updateTravelUntilInput.value = record.travel_until || "";
            updateScanFileInput.value = "";
            if (updateIsDemoCheckbox) updateIsDemoCheckbox.checked = record.is_demo || false;
            
            // Populate employees multiselect
            updateSelectedEmployees.length = 0;
            if (record.employees) {
                const employeeNames = parseEmployeeNames(record.employees);
                updateSelectedEmployees.push(...employeeNames);
            }
            updateEmployeesMultiSelect.updateDisplay();
            updateEmployeesMultiSelect.renderOptions();
            
            updateStatus.textContent = "";
            updateStatus.classList.remove("status--error");
            updateStatus.classList.add("hidden");

            updateModal.classList.add("show");
        });
    });

    document.querySelectorAll(".open-file-link").forEach(link => {
        link.addEventListener("click", async (e) => {
            e.preventDefault();
            const fileUrl = e.currentTarget?.getAttribute('data-file-url') || e.currentTarget?.getAttribute('href') || '';
            const fileName = e.currentTarget?.getAttribute('data-file-name') || 'Download';
            await openStoredFile(fileUrl, fileName);
        });
    });

    document.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            if (!row) return;
            const recordId = (row.getAttribute("data-id") || "").trim();
            const record = recordCache.get(recordId);
            if (!recordId || !record) return;

            viewTaNumber.textContent = record.ta_number || "-";
            viewPurpose.textContent = record.purpose || "-";
            viewDestination.textContent = record.destination || "-";
            viewEmployees.textContent = record.employees || "-";
            viewTravelDate.textContent = record.travel_date
                ? new Date(record.travel_date).toLocaleDateString()
                : "-";
            viewTravelUntil.textContent = record.travel_until
                ? new Date(record.travel_until).toLocaleDateString()
                : "-";

            if (record.file_url) {
                const safeFileUrl = safeUrl(record.file_url);
                viewFileLink.href = safeFileUrl;
                viewFileLink.dataset.fileUrl = safeFileUrl;
                viewFileLink.dataset.fileName = record.file_name || 'Open file';
                viewFileLink.textContent = record.file_name || "Open file";
                updateViewFileSize(safeFileUrl);
            } else {
                viewFileLink.href = "#";
                viewFileLink.dataset.fileUrl = '';
                viewFileLink.dataset.fileName = '';
                viewFileLink.textContent = "No file";
                if (viewFileSize) viewFileSize.textContent = 'File size: -';
            }

            viewModal.classList.add("show");
            document.body.style.overflow = 'hidden';
            document.getElementById("view-edit-btn")._currentRecordId = recordId;
        });
    });

    document.querySelectorAll(".update-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            if (!row) return;
            const recordId = (row.getAttribute("data-id") || "").trim();
            const record = recordCache.get(recordId);
            if (!recordId || !record) return;

            updateRecordData = {
                id: recordId,
                file_url: record.file_url || "",
                file_name: record.file_name || "",
                ta_number: record.ta_number || "",
                purpose: record.purpose || "",
                destination: record.destination || "",
                employees: record.employees || "",
                travel_date: record.travel_date || "",
                travel_until: record.travel_until || "",
                is_demo: record.is_demo || false
            };

            updateTaInput.value = record.ta_number || "";
            updatePurposeInput.value = record.purpose || "";
            updateDestinationInput.value = record.destination || "";
            autoResizeUpdateTextarea(updatePurposeInput);
            autoResizeUpdateTextarea(updateDestinationInput);
            updateTravelDateInput.value = record.travel_date || "";
            updateTravelUntilInput.value = record.travel_until || "";
            updateScanFileInput.value = "";
            if (updateIsDemoCheckbox) updateIsDemoCheckbox.checked = record.is_demo || false;

            updateSelectedEmployees.length = 0;
            if (record.employees) {
                const employeeNames = parseEmployeeNames(record.employees);
                updateSelectedEmployees.push(...employeeNames);
            }
            updateEmployeesMultiSelect.updateDisplay();
            updateEmployeesMultiSelect.renderOptions();

            updateStatus.textContent = "";
            updateStatus.classList.remove("status--error");
            updateStatus.classList.add("hidden");

            updateModal.classList.add("show");
        });
    });
};

// Set up modal event listeners (only once, not on every render)
viewFileLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const fileUrl = viewFileLink.dataset.fileUrl || viewFileLink.getAttribute('href') || '';
    const fileName = viewFileLink.dataset.fileName || viewFileLink.textContent || 'Open file';
    if (!fileUrl || fileUrl === '#') return;
    await openStoredFile(fileUrl, fileName);
});

document.getElementById("view-edit-btn").addEventListener("click", () => {
    const recordId = document.getElementById("view-edit-btn")._currentRecordId;
    const record = recordCache.get(recordId);
    if (!recordId || !record) return;

    viewModal.classList.remove("show");
    document.body.style.overflow = '';

    updateRecordData = {
        id: recordId,
        file_url: record.file_url || "",
        file_name: record.file_name || "",
        ta_number: record.ta_number || "",
        purpose: record.purpose || "",
        destination: record.destination || "",
        employees: record.employees || "",
        travel_date: record.travel_date || "",
        travel_until: record.travel_until || "",
        is_demo: record.is_demo || false
    };

    updateTaInput.value = record.ta_number || "";
    updatePurposeInput.value = record.purpose || "";
    updateDestinationInput.value = record.destination || "";
    autoResizeUpdateTextarea(updatePurposeInput);
    autoResizeUpdateTextarea(updateDestinationInput);
    updateTravelDateInput.value = record.travel_date || "";
    updateTravelUntilInput.value = record.travel_until || "";
    updateScanFileInput.value = "";
    if (updateIsDemoCheckbox) updateIsDemoCheckbox.checked = record.is_demo || false;

    updateSelectedEmployees.length = 0;
    if (record.employees) {
        const employeeNames = parseEmployeeNames(record.employees);
        updateSelectedEmployees.push(...employeeNames);
    }
    updateEmployeesMultiSelect.updateDisplay();
    updateEmployeesMultiSelect.renderOptions();

    updateStatus.textContent = "";
    updateStatus.classList.remove("status--error");
    updateStatus.classList.add("hidden");

    updateModal.classList.add("show");
});

const updateViewFooter = () => {
    const filteredCount = applyAdminClientFilters(viewRows).length;
    const hasActiveFilters = adminActiveFilters.taNumber || adminActiveFilters.employee || adminActiveFilters.year || adminActiveFilters.travelDate;
    
    if (!viewRows.length) {
        viewStatus.textContent = "No records yet.";
    } else if (hasActiveFilters) {
        viewStatus.textContent = `Showing ${filteredCount} of ${viewRows.length} record${viewRows.length === 1 ? "" : "s"} (filtered).`;
    } else {
        viewStatus.textContent = `Loaded ${viewRows.length} record${viewRows.length === 1 ? "" : "s"}.`;
    }
};

const loadTravelAuthorities = async (reset = false) => {
    if (reset) {
        viewRows = [];
        viewBody.innerHTML = "<tr><td colspan=\"8\">Loading records...</td></tr>";
    }

    viewStatus.textContent = "Fetching travel authorities.";
    try {
        const { data, error } = await supabase
            .from("travel_authorities")
            .select("id, ta_number, purpose, destination, employees, travel_date, travel_until, file_name, file_url, created_at, is_demo")
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        viewRows = data || [];
        latestKnownTimestamp = viewRows[0]?.created_at || latestKnownTimestamp;
        const adminLastUpdated = document.getElementById("admin-last-updated");
        if (adminLastUpdated && latestKnownTimestamp) {
            const diff = Date.now() - new Date(latestKnownTimestamp).getTime();
            const mins = Math.floor(diff / 60000);
            const hrs = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : days === 1 ? 'yesterday' : `${days} days ago`;
            adminLastUpdated.textContent = `Last record added ${rel}`;
        }
        renderViewRows(viewRows);
        updateViewFooter();
        await populateAdminYearFilter();
    } catch (error) {
        console.error("View load error:", error);
        viewBody.innerHTML = "<tr><td colspan=\"9\">Unable to load records.</td></tr>";
        viewStatus.textContent = "Failed to load travel authorities.";
    }
};

// Expose loadTravelAuthorities for use in upload.js and panel switching
window.loadTravelAuthorities = loadTravelAuthorities;

// Helper function for panel switching - only loads if no data yet
window.loadTravelAuthoritiesIfNeeded = () => {
    if (viewRows.length === 0) {
        loadTravelAuthorities(true);
    }
};

// Fade scrollbar in on scroll, fade out after idle
(function () {
    const wrap = document.querySelector('#view-panel .table-wrap');
    if (!wrap) return;
    let fadeTimer;
    wrap.addEventListener('scroll', () => {
        wrap.classList.add('is-scrolling');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => wrap.classList.remove('is-scrolling'), 1000);
    }, { passive: true });
})();

// Track recent admin actions to suppress own realtime notifications
window.adminRecentUploadTimestamp = 0;
window.adminRecentUpdateTimestamp = 0;
window.adminRecentDeleteTimestamp = 0;

// Realtime subscription for travel_authorities changes
let realtimeChannel = null;
const setupRealtimeSubscription = () => {
    // Clean up existing subscription if any
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }

    // Subscribe to all changes (INSERT, UPDATE, DELETE) on travel_authorities table
    realtimeChannel = supabase
        .channel('travel_authorities_admin_changes')
        .on(
            'postgres_changes',
            {
                event: '*', // Listen to all events
                schema: 'public',
                table: 'travel_authorities'
            },
            (payload) => {
                // Check if this is from the admin's own recent action
                const now = Date.now();
                const timeSinceUpload = now - window.adminRecentUploadTimestamp;
                const timeSinceUpdate = now - window.adminRecentUpdateTimestamp;
                const timeSinceDelete = now - window.adminRecentDeleteTimestamp;
                
                const isOwnUpload = payload.eventType === 'INSERT' && timeSinceUpload < 3000;
                const isOwnUpdate = payload.eventType === 'UPDATE' && timeSinceUpdate < 3000;
                const isOwnDelete = payload.eventType === 'DELETE' && timeSinceDelete < 3000;
                
                if (isOwnUpload || isOwnUpdate || isOwnDelete) {
                    return;
                }
                
                // Show notification with flashing refresh button
                let message = '';
                switch(payload.eventType) {
                    case 'INSERT':
                        message = 'New record added';
                        break;
                    case 'UPDATE':
                        message = 'Record updated';
                        break;
                    case 'DELETE':
                        message = 'Record deleted';
                        break;
                }
                
                const adminRefreshBtnEl = document.getElementById("admin-refresh-btn");
                if (adminRefreshBtnEl) {
                    adminRefreshBtnEl.classList.add("has-new-data");
                }
                
                showToast(`${message} - Click Reload to refresh`, 'info', 30000);
            }
        )
        .subscribe((status) => {});
};

// Initialize realtime subscription
setupRealtimeSubscription();

// Delete modal handlers
cancelDeleteBtn.addEventListener("click", () => {
    deleteModal.classList.remove("show");
    deleteRecordData = null;
});

cancelUpdateBtn.addEventListener("click", () => {
    updateModal.classList.remove("show");
    updateRecordData = null;
});

// Demo checkbox handler for edit modal
if (updateIsDemoCheckbox) {
    const disclaimerModal = document.getElementById("demo-disclaimer-modal");
    const undemoModal = document.getElementById("undemo-disclaimer-modal");
    const cancelBtn = document.getElementById("cancel-demo-disclaimer");
    const confirmBtn = document.getElementById("confirm-demo-disclaimer");
    const cancelUndemoBtn = document.getElementById("cancel-undemo-disclaimer");
    const confirmUndemoBtn = document.getElementById("confirm-undemo-disclaimer");
    
    let isCheckPending = false;
    
    updateIsDemoCheckbox.addEventListener("change", () => {
        if (updateIsDemoCheckbox.checked && !isCheckPending) {
            isCheckPending = true;
            if (disclaimerModal) {
                disclaimerModal.classList.add("show");
            }
        } else if (!updateIsDemoCheckbox.checked && !isCheckPending) {
            isCheckPending = true;
            if (undemoModal) {
                undemoModal.classList.add("show");
            }
        }
        isCheckPending = false;
    });
    
    // Demo checkbox handlers
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            updateIsDemoCheckbox.checked = false;
            if (disclaimerModal) {
                disclaimerModal.classList.remove("show");
            }
        });
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
            if (disclaimerModal) {
                disclaimerModal.classList.remove("show");
            }
        });
    }
    
    if (disclaimerModal) {
        disclaimerModal.addEventListener("click", (e) => {
            if (e.target === disclaimerModal) {
                updateIsDemoCheckbox.checked = false;
                disclaimerModal.classList.remove("show");
            }
        });
    }
    
    // Undemo checkbox handlers
    if (cancelUndemoBtn) {
        cancelUndemoBtn.addEventListener("click", () => {
            updateIsDemoCheckbox.checked = true;
            if (undemoModal) {
                undemoModal.classList.remove("show");
            }
        });
    }
    
    if (confirmUndemoBtn) {
        confirmUndemoBtn.addEventListener("click", () => {
            if (undemoModal) {
                undemoModal.classList.remove("show");
            }
        });
    }
    
    if (undemoModal) {
        undemoModal.addEventListener("click", (e) => {
            if (e.target === undemoModal) {
                updateIsDemoCheckbox.checked = true;
                undemoModal.classList.remove("show");
            }
        });
    }
}

// Hide load more button since we load all records now
if (viewMoreBtn) {
    viewMoreBtn.style.display = 'none';
}

closeViewBtn.addEventListener("click", () => {
    viewModal.classList.remove("show");
    document.body.style.overflow = '';
});

// Refresh button
const adminRefreshBtn = document.getElementById("admin-refresh-btn");
if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", () => {
        adminRefreshBtn.classList.remove("has-new-data");
        if (toastTimer) clearTimeout(toastTimer);
        if (toast) toast.classList.remove('show');
        loadTravelAuthorities(true);
    });
}

// Admin filter panel functionality
const adminFilterToggleBtn = document.getElementById("admin-filter-toggle-btn");
const adminFilterPanel = document.getElementById("admin-filter-panel");
const adminApplyFilterBtn = document.getElementById("admin-apply-filter-btn");
const adminClearFilterBtn = document.getElementById("admin-clear-filter-btn");
const adminFilterTaNumberInput = document.getElementById("admin-filter-ta-number");
const adminFilterEmployeeInput = document.getElementById("admin-filter-employee");
const adminFilterYearSelect = document.getElementById("admin-filter-year");
const adminFilterTravelDateInput = document.getElementById("admin-filter-travel-date");
const adminFilterMatchAllCheckbox = document.getElementById("admin-filter-match-all");

// Load employees for admin filter
const loadAdminEmployeesForFilter = async () => {
    try {
        const { data, error } = await supabase
            .from("employee_list")
            .select("name, is_active")
            .order("is_active", { ascending: false })
            .order("name", { ascending: true });

        if (error) throw error;
        adminEmployeesListForFilter = data ? data : [];
    } catch (error) {
        console.error("Failed to load employees for admin filter:", error);
        adminEmployeesListForFilter = [];
    }
};

// Expose globally for realtime subscription in employees.js
window.adminLoadEmployeesForFilter = loadAdminEmployeesForFilter;

// Admin filter official autocomplete
const adminFilterEmployeeDropdown = document.getElementById("admin-filter-employee-autocomplete");

const setAdminFilterEmpDropdownVisible = (visible) => {
    if (adminFilterEmployeeDropdown) adminFilterEmployeeDropdown.style.display = visible ? 'block' : 'none';
};

const showAdminFilterEmpSuggestions = (inputValue) => {
    if (!adminFilterEmployeeDropdown) return;
    const trimmed = inputValue.toLowerCase().trim();
    if (!trimmed) { setAdminFilterEmpDropdownVisible(false); return; }

    const matches = adminEmployeesListForFilter
        .filter(emp => emp.name.toLowerCase().includes(trimmed))
        .slice(0, 10);

    if (matches.length === 0) {
        adminFilterEmployeeDropdown.innerHTML = '<div class="autocomplete-no-options">No officials found</div>';
        setAdminFilterEmpDropdownVisible(true);
        return;
    }

    adminFilterEmployeeDropdown.innerHTML = matches.map((emp, i) => {
        const badge = emp.is_active === false ? ' <span class="inactive-badge">Inactive</span>' : '';
        return `<div class="autocomplete-item" data-value="${escapeHtml(emp.name)}" data-index="${i}">${escapeHtml(emp.name)}${badge}</div>`;
    }).join('');
    setAdminFilterEmpDropdownVisible(true);

    adminFilterEmployeeDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            adminFilterEmployeeInput.value = item.getAttribute('data-value');
            setAdminFilterEmpDropdownVisible(false);
        });
        item.addEventListener('mouseenter', () => {
            adminFilterEmployeeDropdown.querySelectorAll('.autocomplete-item').forEach(i => i.classList.remove('highlighted'));
            item.classList.add('highlighted');
        });
    });
};

if (adminFilterEmployeeInput) {
    adminFilterEmployeeInput.addEventListener('input', () => showAdminFilterEmpSuggestions(adminFilterEmployeeInput.value));
    adminFilterEmployeeInput.addEventListener('focus', () => {
        if (adminFilterEmployeeInput.value.length > 0) showAdminFilterEmpSuggestions(adminFilterEmployeeInput.value);
    });
    adminFilterEmployeeInput.addEventListener('keydown', (e) => {
        const items = adminFilterEmployeeDropdown ? adminFilterEmployeeDropdown.querySelectorAll('.autocomplete-item') : [];
        if (!items.length) return;
        const highlighted = adminFilterEmployeeDropdown.querySelector('.autocomplete-item.highlighted');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!highlighted) { items[0].classList.add('highlighted'); }
            else {
                const next = Array.from(items).indexOf(highlighted) + 1;
                if (next < items.length) { highlighted.classList.remove('highlighted'); items[next].classList.add('highlighted'); }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlighted) {
                const prev = Array.from(items).indexOf(highlighted) - 1;
                highlighted.classList.remove('highlighted');
                if (prev >= 0) items[prev].classList.add('highlighted');
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted) {
                adminFilterEmployeeInput.value = highlighted.getAttribute('data-value');
                setAdminFilterEmpDropdownVisible(false);
            }
        } else if (e.key === 'Escape') {
            setAdminFilterEmpDropdownVisible(false);
        }
    });
}

document.addEventListener('click', (e) => {
    if (
        adminFilterEmployeeDropdown &&
        !adminFilterEmployeeDropdown.contains(e.target) &&
        e.target !== adminFilterEmployeeInput
    ) {
        setAdminFilterEmpDropdownVisible(false);
    }
});

// Populate year filter from available data
const populateAdminYearFilter = async () => {
    try {
        // Get all unique years from database
        const { data, error } = await supabase
            .from('travel_authorities')
            .select('travel_date');
            
        if (error) throw error;
        
        const years = new Set();
        data.forEach(row => {
            if (row.travel_date) {
                const year = row.travel_date.substring(0, 4);
                if (year && year.length === 4) {
                    years.add(year);
                }
            }
        });
        
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        adminFilterYearSelect.innerHTML = '<option value="">All Years</option>' +
            sortedYears.map(year => `<option value="${escapeHtml(year)}"${year === currentYear ? ' selected' : ''}>${escapeHtml(year)}</option>`).join('');
    } catch (error) {
        console.error('Error populating year filter:', error);
    }
};

// Auto-dash formatting for TA Number filter
const formatAdminTaNumber = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const part1 = digits.slice(0, 4);
    const part2 = digits.slice(4, 6);
    const part3 = digits.slice(6, 10);
    if (digits.length <= 4) return part1;
    if (digits.length <= 6) return `${part1}-${part2}`;
    return `${part1}-${part2}-${part3}`;
};

adminFilterTaNumberInput.addEventListener("input", () => {
    adminFilterTaNumberInput.value = formatAdminTaNumber(adminFilterTaNumberInput.value);
});

// Initialize flatpickr for admin date filter
window.flatpickr(adminFilterTravelDateInput, {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    static: false,
    monthSelectorType: 'static',
    position: 'auto center',
    onChange: function(selectedDates, dateStr) {
        // Auto-sync year filter when date is selected
        if (dateStr && dateStr.length >= 4) {
            const selectedYear = dateStr.substring(0, 4);
            // Check if this year exists in the dropdown
            const yearOption = Array.from(adminFilterYearSelect.options).find(opt => opt.value === selectedYear);
            if (yearOption) {
                adminFilterYearSelect.value = selectedYear;
            } else {
                // Year not available in records, set to "No selection"
                adminFilterYearSelect.value = "";
            }
        }
    }
});

adminFilterToggleBtn.addEventListener("click", () => {
    adminFilterPanel.classList.toggle("show");
    if (!adminFilterPanel.classList.contains("show")) setAdminFilterEmpDropdownVisible(false);
});

adminApplyFilterBtn.addEventListener("click", () => {
    adminActiveFilters.taNumber = adminFilterTaNumberInput.value.trim();
    adminActiveFilters.employee = adminFilterEmployeeInput.value.trim();
    adminActiveFilters.year = adminFilterYearSelect.value;
    adminActiveFilters.travelDate = adminFilterTravelDateInput.value;
    adminActiveFilters.matchAll = adminFilterMatchAllCheckbox.checked;
    saveAdminFiltersToStorage();
    updateAdminButtonStates();
    renderViewRows(viewRows);
    updateViewFooter();
    adminFilterPanel.classList.remove("show");
    setAdminFilterEmpDropdownVisible(false);
});

adminClearFilterBtn.addEventListener("click", () => {
    adminActiveFilters.taNumber = "";
    adminActiveFilters.employee = "";
    adminActiveFilters.year = "";
    adminActiveFilters.travelDate = "";
    adminActiveFilters.matchAll = true;
    adminFilterTaNumberInput.value = "";
    adminFilterEmployeeInput.value = "";
    setAdminFilterEmpDropdownVisible(false);
    adminFilterYearSelect.value = "";
    adminFilterTravelDateInput.value = "";
    adminFilterMatchAllCheckbox.checked = true;
    saveAdminFiltersToStorage();
    updateAdminButtonStates();
    renderViewRows(viewRows);
    updateViewFooter();
});

// Admin sort panel functionality
const adminSortToggleBtn = document.getElementById("admin-sort-toggle-btn");
const adminSortPanel = document.getElementById("admin-sort-panel");
const adminApplySortBtn = document.getElementById("admin-apply-sort-btn");
const adminClearSortBtn = document.getElementById("admin-clear-sort-btn");
const adminSortBySelect = document.getElementById("admin-sort-by");
const adminSortOrderSelect = document.getElementById("admin-sort-order");

adminSortToggleBtn.addEventListener("click", () => {
    adminSortPanel.classList.toggle("show");
});

adminApplySortBtn.addEventListener("click", () => {
    adminActiveSort.by = adminSortBySelect.value;
    adminActiveSort.order = adminSortOrderSelect.value;
    saveAdminSortToStorage();
    updateAdminButtonStates();
    renderViewRows(viewRows);
    updateViewFooter();
    adminSortPanel.classList.remove("show");
});

adminClearSortBtn.addEventListener("click", () => {
    adminActiveSort.by = "";
    adminActiveSort.order = "asc";
    adminSortBySelect.value = "ta";
    adminSortOrderSelect.value = "asc";
    saveAdminSortToStorage();
    updateAdminButtonStates();
    renderViewRows(viewRows);
    updateViewFooter();
});

// Close admin filter and sort panels when clicking outside
document.addEventListener("click", (e) => {
    if (!adminFilterPanel.contains(e.target) && !adminFilterToggleBtn.contains(e.target) && adminFilterPanel.classList.contains("show")) {
        adminFilterPanel.classList.remove("show");
    }
    if (!adminSortPanel.contains(e.target) && !adminSortToggleBtn.contains(e.target) && adminSortPanel.classList.contains("show")) {
        adminSortPanel.classList.remove("show");
    }
});

// Export to Excel functionality
const exportPanel = document.getElementById("admin-export-panel");
const exportBtn = document.getElementById("admin-export-btn");
const cancelExportBtn = document.getElementById("cancel-export");
const confirmExportBtn = document.getElementById("confirm-export");
const exportAllYearsCheckbox = document.getElementById("export-all-years");
const exportYearsList = document.getElementById("export-years-list");
const exportStatus = document.getElementById("export-status");

const resetExportPanel = () => {
    exportStatus.classList.add("hidden");
    exportStatus.classList.remove("status--error");
    exportAllYearsCheckbox.checked = false;
    const yearCheckboxes = document.querySelectorAll(".export-year-checkbox");
    yearCheckboxes.forEach(cb => cb.checked = false);
};

let availableYearsForExport = [];

// Populate export years from available data
const populateExportYears = async () => {
    try {
        const { data, error } = await supabase
            .from('travel_authorities')
            .select('travel_date');

        if (error) throw error;

        const yearsSet = new Set();
        data.forEach(record => {
            if (record.travel_date) {
                const year = new Date(record.travel_date).getFullYear();
                yearsSet.add(year);
            }
        });

        availableYearsForExport = Array.from(yearsSet).sort((a, b) => b - a);

        // Populate checkboxes
        exportYearsList.innerHTML = availableYearsForExport.map(year => `
            <label class="checkbox-label">
                <input type="checkbox" class="export-year-checkbox" value="${escapeHtml(String(year))}">
                <span>${escapeHtml(String(year))}</span>
            </label>
        `).join('');

    } catch (error) {
        console.error('Error populating export years:', error);
    }
};

exportBtn.addEventListener("click", async () => {
    await populateExportYears();
    adminFilterPanel.classList.remove("show");
    adminSortPanel.classList.remove("show");
    resetExportPanel();
    exportPanel.classList.add("show");
});

cancelExportBtn.addEventListener("click", () => {
    exportPanel.classList.remove("show");
    resetExportPanel();
});

exportAllYearsCheckbox.addEventListener("change", (e) => {
    const yearCheckboxes = document.querySelectorAll(".export-year-checkbox");
    yearCheckboxes.forEach(cb => cb.checked = e.target.checked);
});

confirmExportBtn.addEventListener("click", async () => {
    try {
        exportStatus.textContent = "Preparing export...";
        exportStatus.classList.remove("hidden", "status--error");

        // Get selected years
        const selectedYears = [];
        if (exportAllYearsCheckbox.checked) {
            selectedYears.push(...availableYearsForExport);
        } else {
            const yearCheckboxes = document.querySelectorAll(".export-year-checkbox:checked");
            yearCheckboxes.forEach(cb => selectedYears.push(parseInt(cb.value)));
        }

        if (selectedYears.length === 0) {
            exportStatus.textContent = "Please select at least one year to export.";
            exportStatus.classList.add("status--error");
            return;
        }

        exportStatus.textContent = "Fetching records...";

        // Fetch all records (excluding demo files)
        const { data, error } = await supabase
            .from("travel_authorities")
            .select("ta_number, purpose, destination, employees, travel_date, travel_until, is_demo")
            .eq("is_demo", false)
            .order("travel_date", { ascending: false });

        if (error) throw error;

        // Filter by selected years
        const filteredData = data.filter(record => {
            if (!record.travel_date) return false;
            const year = new Date(record.travel_date).getFullYear();
            return selectedYears.includes(year);
        });

        if (filteredData.length === 0) {
            exportStatus.textContent = "No records found for selected years.";
            exportStatus.classList.add("status--error");
            return;
        }

        exportStatus.textContent = "Generating Excel file...";

        // Prepare data for export
        const exportData = filteredData.map(record => ({
            "TA Number": record.ta_number || "",
            "Purpose": record.purpose || "",
            "Destination": record.destination || "",
            "Employees": Array.isArray(record.employees) ? record.employees.join(", ") : record.employees || "",
            "Travel Date": record.travel_date || "",
            "Travel End": record.travel_until || ""
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // TA Number
            { wch: 30 },  // Purpose
            { wch: 20 },  // Destination
            { wch: 30 },  // Employees
            { wch: 12 },  // Travel Date
            { wch: 12 }   // Travel End
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Travel Authorities");

        // Generate filename with selected years
        const yearRange = selectedYears.length === availableYearsForExport.length ? 
            "All_Years" : 
            selectedYears.sort().join("_");
        const filename = `Travel_Authorities_${yearRange}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        exportStatus.textContent = `Successfully exported ${filteredData.length} records!`;
        
        // Close panel after 2 seconds
        setTimeout(() => {
            exportPanel.classList.remove("show");
            resetExportPanel();
        }, 2000);

    } catch (error) {
        console.error("Export error:", error);
        exportStatus.textContent = `Export failed: ${error.message || "Unknown error"}`;
        exportStatus.classList.add("status--error");
    }
});

document.addEventListener("click", (e) => {
    if (!exportPanel.contains(e.target) && !exportBtn.contains(e.target) && exportPanel.classList.contains("show")) {
        exportPanel.classList.remove("show");
        resetExportPanel();
    }
});

confirmDeleteBtn.addEventListener("click", async () => {
    if (!deleteRecordData || !deleteRecordData.id) return;

    try {
        viewStatus.textContent = "Deleting record...";
        
        // Mark timestamp BEFORE database operation to suppress own realtime notification
        window.adminRecentDeleteTimestamp = Date.now();
        
        // Delete database record first
        const { error: deleteError } = await supabase
            .from("travel_authorities")
            .delete()
            .eq("id", deleteRecordData.id);

        if (deleteError) {
            throw deleteError;
        }

        // Extract file path from URL and delete from storage
        if (deleteRecordData.file_url) {
            try {
                const url = new URL(deleteRecordData.file_url);
                const pathParts = url.pathname.split('/ta-files/');
                if (pathParts.length > 1) {
                    const filePath = decodeURIComponent(pathParts[1]);
                    
                    const { error: storageError } = await supabase
                        .storage
                        .from("ta-files")
                        .remove([filePath]);

                    if (storageError) {
                        console.warn("Storage delete warning:", storageError);
                    }
                }
            } catch (urlError) {
                console.warn("File path extraction error:", urlError);
            }
        }

        deleteModal.classList.remove("show");
        viewStatus.textContent = "Record deleted successfully.";
        deleteRecordData = null;
        
        // Reload the table
        await loadTravelAuthorities(true);
    } catch (error) {
        console.error("Delete error:", error);
        viewStatus.textContent = `Delete failed: ${error.message || "Unknown error"}`;
        deleteModal.classList.remove("show");
        deleteRecordData = null;
    }
});

confirmUpdateBtn.addEventListener("click", async () => {
    if (!updateRecordData || !updateRecordData.id) return;

    const taNumber = updateTaInput.value.trim();
    const purpose = updatePurposeInput.value.trim();
    const destination = updateDestinationInput.value.trim();
    const travelDate = updateTravelDateInput.value;
    let travelUntil = updateTravelUntilInput.value;
    const employees = updateSelectedEmployees.join(", ");
    const isDemo = updateIsDemoCheckbox ? updateIsDemoCheckbox.checked : false;

    if (!taNumber || !purpose || !destination || !travelDate || updateSelectedEmployees.length === 0) {
        updateStatus.textContent = "Please fill in all required fields.";
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    if (!isValidTaNumber(taNumber)) {
        updateStatus.textContent = "TA Number must be in the format 0000-00-0000.";
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    // Check if TA number already exists in another record
    try {
        const { data: existingRecord, error: checkError } = await supabase
            .from("travel_authorities")
            .select("id, ta_number")
            .eq("ta_number", taNumber)
            .maybeSingle();
        
        if (checkError && checkError.code !== 'PGRST116') {
            console.error("Error checking TA number:", checkError);
            throw new Error("Failed to verify TA number. Please try again.");
        }
        
        // If TA exists and it's NOT the current record being updated, block the update
        if (existingRecord && existingRecord.id !== updateRecordData.id) {
            updateStatus.textContent = `TA Number ${taNumber} already exists in another record.`;
            updateStatus.classList.add("status--error");
            updateStatus.classList.remove("status--shake", "hidden");
            void updateStatus.offsetWidth;
            updateStatus.classList.add("status--shake");
            return;
        }
    } catch (error) {
        console.error("TA validation error:", error);
        updateStatus.textContent = error.message || "Failed to validate TA number.";
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    if (!travelUntil) {
        travelUntil = travelDate;
        updateTravelUntilInput.value = travelDate;
    }

    const start = new Date(`${travelDate}T00:00:00`);
    const end = new Date(`${travelUntil}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        updateStatus.textContent = "Please enter valid dates.";
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    if (start > end) {
        updateStatus.textContent = "Travel date cannot be after travel end.";
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    // Check if anything has actually changed
    const hasFileChange = updateScanFileInput.files.length > 0;
    const hasTaNumberChange = taNumber !== updateRecordData.ta_number;
    const hasPurposeChange = purpose !== updateRecordData.purpose;
    const hasDestinationChange = destination !== updateRecordData.destination;
    const hasEmployeesChange = employees !== updateRecordData.employees;
    const hasTravelDateChange = travelDate !== updateRecordData.travel_date;
    const hasTravelUntilChange = travelUntil !== updateRecordData.travel_until;
    const hasIsDemoChange = isDemo !== updateRecordData.is_demo;
    
    const hasAnyChange = hasFileChange || hasTaNumberChange || hasPurposeChange || 
                         hasDestinationChange || hasEmployeesChange || hasTravelDateChange || hasTravelUntilChange || hasIsDemoChange;
    
    if (!hasAnyChange) {
        updateStatus.textContent = "No changes made.";
        updateStatus.classList.remove("status--error", "status--shake", "hidden");
        updateStatus.classList.add("status--success");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
        return;
    }

    try {
        updateStatus.textContent = "Updating record...";
        updateStatus.classList.remove("status--error", "hidden");

        // Mark timestamp BEFORE database operation to suppress own realtime notification
        window.adminRecentUpdateTimestamp = Date.now();

        let fileUrl = updateRecordData.file_url || "";
        let fileName = updateRecordData.file_name || "";
        // Ensure both values are formatted consistently before comparing
        const taNumberChanged = formatTaNumber(taNumber) !== formatTaNumber(updateRecordData.ta_number);

        if (updateScanFileInput.files.length > 0) {
            // Validate and process files (PDF or images)
            updateStatus.textContent = 'Processing files...';
            
            const processedFile = await window.validateAndProcessFiles(updateScanFileInput, taNumber);
            const preparedUpload = window.prepareFileForStorage
                ? await window.prepareFileForStorage(processedFile, taNumber)
                : {
                    storageFile: processedFile,
                    extension: processedFile.name.substring(processedFile.name.lastIndexOf('.')),
                    compressed: false,
                    originalSize: processedFile.size,
                    storedSize: processedFile.size
                };
            const processedSizeMB = (preparedUpload.storedSize / 1024 / 1024).toFixed(2);
            
            // Check if file is still too large
            const maxAllowedMB = 10;
            if (preparedUpload.storedSize > maxAllowedMB * 1024 * 1024) {
                updateStatus.textContent = `File too large: ${processedSizeMB}MB (max ${maxAllowedMB}MB). Please use smaller files.`;
                updateStatus.classList.add("status--error");
                updateStatus.classList.remove("status--shake");
                void updateStatus.offsetWidth;
                updateStatus.classList.add("status--shake");
                return;
            }

            updateStatus.textContent = preparedUpload.compressed
                ? `Uploading optimized ${processedSizeMB}MB...`
                : `Uploading ${processedSizeMB}MB...`;

            const safeTa = taNumber.replace(/[^a-z0-9-_]/gi, "_");
            const safeDate = travelDate.replace(/[^0-9-]/g, "-");
            
            // Extract file extension and rename file to TA number with timestamp
            const fileExtension = preparedUpload.extension;
            const timestamp = Date.now();
            const newFileName = `${taNumber}_${timestamp}${fileExtension}`;
            const filePath = `travel-authorities/${safeTa}/${safeDate}/${newFileName}`;

            // Delete old file if it exists
            if (updateRecordData.file_url) {
                try {
                    const url = new URL(updateRecordData.file_url);
                    const pathParts = url.pathname.split('/ta-files/');
                    if (pathParts.length > 1) {
                        const oldFilePath = decodeURIComponent(pathParts[1]);
                        await supabase.storage.from("ta-files").remove([oldFilePath]);
                    }
                } catch (e) {
                    // Ignore deletion errors - file might not exist
                }
            }

            const { error: uploadError } = await supabase
                .storage
                .from("ta-files")
                .upload(filePath, preparedUpload.storageFile, { upsert: false });

            if (uploadError) {
                throw new Error(`Storage upload failed: ${uploadError.message || "Unknown error"}`);
            }

            const { data: publicUrlData } = supabase
                .storage
                .from("ta-files")
                .getPublicUrl(filePath);

            fileUrl = publicUrlData.publicUrl;
            fileName = newFileName;
        } else if (taNumberChanged && updateRecordData.file_url) {
            // TA number changed but no new file uploaded - rename existing file
            updateStatus.textContent = "Renaming file to match new TA number...";
            
            try {
                const url = new URL(updateRecordData.file_url);
                const pathParts = url.pathname.split('/ta-files/');
                if (pathParts.length > 1) {
                    const oldFilePath = decodeURIComponent(pathParts[1]);
                    
                    // Download the old file
                    const { data: fileData, error: downloadError } = await supabase
                        .storage
                        .from("ta-files")
                        .download(oldFilePath);
                    
                    if (downloadError) {
                        console.warn("Could not download old file for renaming:", downloadError);
                    } else {
                        // Upload with new TA number name and timestamp
                        const safeTa = taNumber.replace(/[^a-z0-9-_]/gi, "_");
                        const safeDate = travelDate.replace(/[^0-9-]/g, "-");
                        const existingFileName = updateRecordData.file_name || '';
                        const extensionMatch = existingFileName.match(/(\.pdf\.gz|\.pdf|\.png|\.jpe?g|\.gz)$/i);
                        const fileExtension = extensionMatch
                            ? extensionMatch[1]
                            : existingFileName.substring(existingFileName.lastIndexOf('.'));
                        const timestamp = Date.now();
                        const newFileName = `${taNumber}_${timestamp}${fileExtension}`;
                        const newFilePath = `travel-authorities/${safeTa}/${safeDate}/${newFileName}`;
                        
                        const { error: uploadError } = await supabase
                            .storage
                            .from("ta-files")
                            .upload(newFilePath, fileData, { upsert: false });
                        
                        if (uploadError) {
                            console.warn("Could not upload renamed file:", uploadError);
                        } else {
                            // Get new public URL
                            const { data: publicUrlData } = supabase
                                .storage
                                .from("ta-files")
                                .getPublicUrl(newFilePath);
                            
                            fileUrl = publicUrlData.publicUrl;
                            fileName = newFileName;
                            
                            // Delete old file
                            const { error: deleteError } = await supabase
                                .storage
                                .from("ta-files")
                                .remove([oldFilePath]);
                            
                            if (deleteError) {
                                console.warn("Could not delete old file after rename:", deleteError);
                            }
                        }
                    }
                }
            } catch (renameError) {
                console.warn("Error renaming file:", renameError);
                // Continue with update even if rename fails
            }
        }

        const { data: updateData, error: updateError } = await supabase
            .from("travel_authorities")
            .update({
                ta_number: taNumber,
                purpose: purpose,
                destination: destination,
                employees: employees,
                travel_date: travelDate,
                travel_until: travelUntil,
                file_name: fileName,
                file_url: fileUrl,
                is_demo: isDemo
            })
            .eq("id", updateRecordData.id)
            .select();

        if (updateError) {
            // Check for duplicate TA number error
            if (updateError.code === '23505' || updateError.message?.includes('duplicate key') || updateError.message?.includes('unique constraint')) {
                throw new Error(`TA Number ${taNumber} already exists in the database.`);
            }
            throw new Error(`Database update failed: ${updateError.message || "Unknown error"}`);
        }

        updateModal.classList.remove("show");
        updateRecordData = null;
        viewStatus.textContent = "Record updated successfully.";
        
        showToast("Update saved.", "success");
        await loadTravelAuthorities(true);
    } catch (error) {
        console.error("Update error:", error);
        const message = error && error.message ? error.message : "Please try again.";
        updateStatus.textContent = `Update failed: ${message}`;
        updateStatus.classList.add("status--error");
        updateStatus.classList.remove("status--shake", "hidden");
        void updateStatus.offsetWidth;
        updateStatus.classList.add("status--shake");
    }
});

// Close modal when clicking outside
deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) {
        deleteModal.classList.remove("show");
        deleteRecordData = null;
    }
});

updateModal.addEventListener("click", (e) => {
    if (e.target === updateModal) {
        updateModal.classList.remove("show");
        updateRecordData = null;
    }
});

viewModal.addEventListener("click", (e) => {
    if (e.target === viewModal) {
        viewModal.classList.remove("show");
        document.body.style.overflow = '';
    }
});

// Auto-clear checkbox state management
const autoClearCheckbox = document.getElementById("auto-clear-checkbox");

// Load saved state from localStorage
const savedAutoClearState = localStorage.getItem("autoClearFields");
if (autoClearCheckbox && savedAutoClearState === "true") {
    autoClearCheckbox.checked = true;
}

// Save state when checkbox changes
if (autoClearCheckbox) {
    autoClearCheckbox.addEventListener("change", () => {
        localStorage.setItem("autoClearFields", autoClearCheckbox.checked.toString());
    });
}

// Load employees for admin filter (must be called inside viewPanelLoaded scope)
// Delay restoring persisted table state until auth is fully resolved.
const restoreAdminTableState = () => {
    loadAdminFiltersFromStorage();
    loadAdminSortFromStorage();

    if (adminFilterTaNumberInput) adminFilterTaNumberInput.value = adminActiveFilters.taNumber || "";
    if (adminFilterEmployeeInput) adminFilterEmployeeInput.value = adminActiveFilters.employee || "";
    if (adminFilterYearSelect) adminFilterYearSelect.value = adminActiveFilters.year || "";
    if (adminFilterTravelDateInput) adminFilterTravelDateInput.value = adminActiveFilters.travelDate || "";
    if (adminFilterMatchAllCheckbox) adminFilterMatchAllCheckbox.checked = adminActiveFilters.matchAll !== undefined ? adminActiveFilters.matchAll : true;

    if (adminSortBySelect) adminSortBySelect.value = adminActiveSort.by || "ta";
    if (adminSortOrderSelect) adminSortOrderSelect.value = adminActiveSort.order || "asc";

    loadAdminEmployeesForFilter();

    // Update button states after a short delay to ensure DOM is ready
    setTimeout(() => {
        updateAdminButtonStates();
    }, 100);
};

if (window.adminCurrentRole) {
    restoreAdminTableState();
} else {
    window.addEventListener('admin-role-ready', restoreAdminTableState, { once: true });
}

}); // End of viewPanelLoaded.then()

// ============================================
// EMPLOYEE MANAGEMENT
// ============================================
// Employee management is loaded from employees/employees.js

// ============================================
// USER MANAGEMENT (SUPER USER ONLY)
// ============================================

// Note: User panel elements are loaded asynchronously from users/users-panel.html
// They are queried dynamically in the functions below

let allUsersData = []; // Store all users for filtering

const getRolePriority = (role) => {
    const priorities = { 'super': 3, 'admin': 2, 'user': 1 };
    return priorities[role] || 0;
};

const truncateEmail = (email, maxLocalLength = 10) => {
    if (!email || !email.includes('@')) return email;
    
    const [localPart, domain] = email.split('@');
    
    if (localPart.length <= maxLocalLength) {
        return email; // No truncation needed
    }
    
    // Truncate local part but keep domain
    const truncated = localPart.substring(0, maxLocalLength) + '...';
    return `${truncated}@${domain}`;
};

const capitalizeWords = (value) => {
    if (!value) return '';
    return String(value)
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
};

const formatHeaderLikeName = (fname, lname, compact = false) => {
    const normalizedFirst = capitalizeWords(fname || '');
    const normalizedLast = capitalizeWords(lname || '');
    const fullName = `${normalizedFirst} ${normalizedLast}`.trim();

    if (!compact || !normalizedFirst) {
        return fullName;
    }

    const initials = normalizedFirst
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');

    return `${initials} ${normalizedLast}`.trim() || fullName;
};

let editUserNameData = null;
let userNameModalHandlersInitialized = false;
window.currentlyEditingUserId = null; // Track which user is being edited
window.currentlyChangingRoleUserId = null; // Track which user's role is being changed

const closeEditUserNameModal = () => {
    const modal = document.getElementById('edit-user-name-modal');
    const statusEl = document.getElementById('edit-user-name-status');
    const fnameInput = document.getElementById('edit-user-fname');
    const lnameInput = document.getElementById('edit-user-lname');

    if (modal) {
        modal.classList.remove('show');
    }
    if (statusEl) {
        statusEl.classList.add('hidden');
        statusEl.classList.remove('status--error');
        statusEl.textContent = '';
    }
    if (fnameInput) fnameInput.value = '';
    if (lnameInput) lnameInput.value = '';
    editUserNameData = null;
    window.currentlyEditingUserId = null; // Clear tracked user
};

const submitEditUserName = async () => {
    const statusEl = document.getElementById('edit-user-name-status');
    const fnameInput = document.getElementById('edit-user-fname');
    const lnameInput = document.getElementById('edit-user-lname');

    if (!editUserNameData || !fnameInput || !lnameInput) {
        return;
    }

    const latestUser = allUsersData.find((u) => u.id === editUserNameData.id);
    if (latestUser?.is_online === true) {
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.classList.add('status--error');
            statusEl.textContent = 'User is online. Name can only be edited while offline.';
            
            // Add shake animation
            statusEl.classList.remove('status--shake');
            void statusEl.offsetWidth; // Trigger reflow to restart animation
            statusEl.classList.add('status--shake');
        }
        return;
    }

    const rawFName = fnameInput.value.trim();
    const rawLName = lnameInput.value.trim();

    if (!rawFName || !rawLName) {
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.classList.add('status--error');
            statusEl.textContent = 'Both first name and last name are required.';
        }
        return;
    }

    try {
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.classList.remove('status--error');
            statusEl.textContent = 'Saving changes...';
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                FName: capitalizeWords(rawFName),
                LName: capitalizeWords(rawLName)
            })
            .eq('id', editUserNameData.id);

        if (error) {
            throw error;
        }

        window.showToast('User name updated successfully.', 'success');
        closeEditUserNameModal();
        await loadUsers();
    } catch (error) {
        console.error('Failed to update user name:', error);
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.classList.add('status--error');
            statusEl.textContent = error?.message || 'Failed to update user name.';
        }
    }
};

const initUserNameModalHandlers = () => {
    if (userNameModalHandlersInitialized) {
        return;
    }

    const modal = document.getElementById('edit-user-name-modal');
    const cancelBtn = document.getElementById('cancel-edit-user-name');
    const confirmBtn = document.getElementById('confirm-edit-user-name');

    if (!modal || !cancelBtn || !confirmBtn) {
        return;
    }

    cancelBtn.addEventListener('click', closeEditUserNameModal);
    confirmBtn.addEventListener('click', submitEditUserName);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeEditUserNameModal();
        }
    });

    userNameModalHandlersInitialized = true;
};

const openEditUserNameModal = (userId) => {
    const user = allUsersData.find((entry) => entry.id === userId);
    if (!user) {
        return;
    }

    if (user.is_online === true) {
        window.showToast('User must be offline before editing name.', 'warning');
        return;
    }

    const modal = document.getElementById('edit-user-name-modal');
    const fnameInput = document.getElementById('edit-user-fname');
    const lnameInput = document.getElementById('edit-user-lname');
    const statusEl = document.getElementById('edit-user-name-status');

    if (!modal || !fnameInput || !lnameInput) {
        return;
    }

    editUserNameData = {
        id: user.id,
        email: user.email || ''
    };

    // Track which user is being edited for realtime protection
    window.currentlyEditingUserId = user.id;

    fnameInput.value = user.FName || '';
    lnameInput.value = user.LName || '';

    if (statusEl) {
        statusEl.classList.add('hidden');
        statusEl.classList.remove('status--error');
        statusEl.textContent = '';
    }

    modal.classList.add('show');
};

const renderUsersTable = (users) => {
    const usersBody = document.getElementById('users-body');
    const usersStatus = document.getElementById('users-status');
    
    if (!usersBody || !usersStatus) {
        console.warn('Users panel elements not found in DOM yet');
        return;
    }
    
    if (!users || users.length === 0) {
        usersBody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
        usersStatus.textContent = 'No users available.';
        return;
    }

    // Render users table
    const useCompactName = window.matchMedia('(max-width: 768px)').matches;
    usersBody.innerHTML = users.map(user => {
        const accessEnabled = user.access_enabled !== false;
        const displayEmail = truncateEmail(user.email || 'No email', 10);
        const fullEmail = user.email || 'No email';
        const isOnline = user.is_online === true;
        const statusClass = isOnline ? 'status-online' : 'status-offline';
        const statusText = isOnline ? 'Online' : 'Offline';
        const nameDisplay = formatHeaderLikeName(user.FName, user.LName, useCompactName) || fullEmail.split('@')[0] || 'Unknown User';
        const editDisabledReason = "Can't edit: user is online.";
        const editTooltip = isOnline ? editDisabledReason : 'Edit user name';
        const roleDisabledReason = isOnline ? "Can't change role: user is online." : (!accessEnabled ? "Can't change role: access is disabled." : "");
        const roleTooltip = roleDisabledReason || 'Change user role';
        return `
        <tr class="${!accessEnabled ? 'user-disabled' : ''}">
            <td class="text-left">${escapeHtml(nameDisplay)}</td>
            <td class="text-left" title="${escapeHtml(fullEmail)}">${escapeHtml(displayEmail)}</td>
            <td><span class="status-indicator ${statusClass}">${statusText}</span></td>
            <td>
                <select class="access-select" data-user-id="${escapeHtml(user.id)}" data-current-access="${accessEnabled}">
                    <option value="true" ${accessEnabled ? 'selected' : ''}>Enabled</option>
                    <option value="false" ${!accessEnabled ? 'selected' : ''}>Disabled</option>
                </select>
            </td>
            <td>
                <span class="user-edit-tooltip-wrap" title="${escapeHtml(roleTooltip)}">
                    <select class="role-select" data-user-id="${escapeHtml(user.id)}" data-current-role="${escapeHtml(user.role)}" ${!accessEnabled || isOnline ? 'disabled' : ''}>
                        <option value="">-- Select Role --</option>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="super" ${user.role === 'super' ? 'selected' : ''}>Super</option>
                    </select>
                </span>
            </td>
            <td>
                <span class="user-edit-tooltip-wrap" title="${escapeHtml(editTooltip)}">
                    <button
                        type="button"
                        class="update-btn icon-btn user-edit-btn"
                        data-user-id="${escapeHtml(user.id)}"
                        ${isOnline ? 'disabled' : ''}
                        aria-label="Edit user name"
                    >
                        <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5c.39-.39.39-1.02 0-1.41L19.66 3c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75L21 5.75z"/>
                        </svg>
                    </button>
                </span>
            </td>
        </tr>
    `;
    }).join('');

    // Add change event listeners to role selects
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = e.target.getAttribute('data-user-id');
            const currentRole = e.target.getAttribute('data-current-role');
            const newRole = e.target.value;

            if (!newRole || newRole === currentRole) {
                e.target.value = currentRole; // Reset if no selection or same role
                return;
            }

            // Track which user's role is being changed
            window.currentlyChangingRoleUserId = userId;

            // Confirm role change
            const confirmChange = await window.adminShowConfirmation(
                'Confirm Role Change',
                `Change user role from "${currentRole}" to "${newRole}"?`
            );
            
            // Clear tracking variable
            window.currentlyChangingRoleUserId = null;
            
            if (!confirmChange) {
                e.target.value = currentRole; // Reset to original
                return;
            }

            await changeUserRole(userId, newRole, e.target);
        });
    });

    // Add change event listeners to access selects
    document.querySelectorAll('.access-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = e.target.getAttribute('data-user-id');
            const currentAccess = e.target.getAttribute('data-current-access') === 'true';
            const newAccess = e.target.value === 'true';
            
            if (newAccess === currentAccess) {
                return; // No change
            }
            
            // Confirm access change
            const action = newAccess ? 'enable' : 'disable';
            const confirmChange = await window.adminShowConfirmation(
                'Confirm Access Change',
                `Are you sure you want to ${action} access for this user?`
            );
            if (!confirmChange) {
                e.target.value = currentAccess.toString(); // Reset to original
                return;
            }

            await toggleUserAccess(userId, newAccess, e.target);
        });
    });

    document.querySelectorAll('.user-edit-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const userId = button.getAttribute('data-user-id');
            if (!userId) return;
            openEditUserNameModal(userId);
        });
    });

    // Query filter element to check if we're in filtered mode
    const usersRoleFilter = document.getElementById('users-role-filter');
    const filterValue = usersRoleFilter?.value || '';
    const displayCount = filterValue ? users.length : allUsersData.length;
    const filterText = filterValue ? ` (filtered by ${filterValue})` : '';
    usersStatus.textContent = `Loaded ${displayCount} user(s)${filterText}.`;
};

const loadUsers = async () => {
    const usersBody = document.getElementById('users-body');
    const usersStatus = document.getElementById('users-status');

    if (!isSuperUser()) {
        console.warn('Blocked non-super user from loading users panel data.');
        if (usersBody) {
            usersBody.innerHTML = '<tr><td colspan="6">Permission denied.</td></tr>';
        }
        if (usersStatus) {
            usersStatus.textContent = 'Only super users can view this panel.';
            usersStatus.classList.add('status--error');
        }
        return;
    }

    const isLegacyGetUsersSignatureError = (rpcError) => {
        if (!rpcError) return false;
        const code = String(rpcError.code || '');
        const combined = `${rpcError.message || ''} ${rpcError.details || ''} ${rpcError.hint || ''}`.toLowerCase();
        if (!combined.includes('get_all_users_with_emails')) return false;
        return code === 'PGRST202' || code === '42883' || combined.includes('schema cache') || combined.includes('does not exist');
    };

    const getUsersWithEmailRows = async () => {
        let response = await supabase.rpc('get_all_users_with_emails', {
            client_session_token: localStorage.getItem('admin_session_token')
        });

        if (!response.error || !isLegacyGetUsersSignatureError(response.error)) {
            return response;
        }

        console.warn('Falling back to legacy get_all_users_with_emails() signature without client_session_token.');
        response = await supabase.rpc('get_all_users_with_emails');
        return response;
    };
    
    if (!usersBody || !usersStatus) {
        console.error('Users panel elements not found in DOM');
        return;
    }

    initUserNameModalHandlers();
    
    try {
        usersStatus.textContent = 'Loading users...';
        usersStatus.classList.remove('status--error');
        // Use RPC function to get users with emails from auth.users
        // This is secure because the RPC function validates super user permission
        const { data, error } = await getUsersWithEmailRows();
        if (error) {
            console.error('Error loading users:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            const combinedErrorText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
            const normalizedErrorText = combinedErrorText.toLowerCase();
            // Provide helpful error messages
            if (isLegacyGetUsersSignatureError(error)) {
                throw new Error('Database function get_all_users_with_emails is missing. Please run sql/create_get_users_function.sql.');
            } else if (normalizedErrorText.includes('permission denied')) {
                throw new Error('Permission denied. Only super users can view all users.');
            } else if (normalizedErrorText.includes('session invalid')) {
                throw new Error('Session invalid or expired. Please sign in again.');
            } else {
                throw error;
            }
        }
        if (!data || data.length === 0) {
            allUsersData = [];
            renderUsersTable([]);
            return;
        }

        const userIds = data.map((user) => user.id).filter(Boolean);
        let namesById = {};

        if (userIds.length > 0) {
            const { data: profileNames, error: namesError } = await supabase
                .from('profiles')
                .select('id, FName, LName')
                .in('id', userIds);

            if (namesError) {
                console.warn('Unable to load user names from profiles:', namesError);
            } else {
                namesById = (profileNames || []).reduce((accumulator, profile) => {
                    accumulator[profile.id] = {
                        FName: profile.FName || '',
                        LName: profile.LName || ''
                    };
                    return accumulator;
                }, {});
            }
        }

        const enrichedUsers = data.map((user) => ({
            ...user,
            FName: namesById[user.id]?.FName || '',
            LName: namesById[user.id]?.LName || ''
        }));

        // Sort by role priority: super > admin > user
        allUsersData = enrichedUsers.sort((a, b) => {
            const priorityDiff = getRolePriority(b.role) - getRolePriority(a.role);
            if (priorityDiff !== 0) return priorityDiff;
            // If same role, sort by email
            return (a.email || '').localeCompare(b.email || '');
        });
        // Attach filter listeners after table is rendered
        const usersRoleFilter = document.getElementById('users-role-filter');
        const usersAccessFilter = document.getElementById('users-access-filter');
        const usersStatusFilter = document.getElementById('users-status-filter');

        if (!usersRoleFilter || !usersAccessFilter || !usersStatusFilter) {
            throw new Error('Users filters are not available in the panel. Please refresh and try again.');
        }

        const filterUsers = () => {
            let filtered = allUsersData;
            const role = usersRoleFilter.value;
            const access = usersAccessFilter.value;
            const status = usersStatusFilter.value;
            if (role) {
                filtered = filtered.filter(u => u.role === role);
            }
            if (access) {
                filtered = filtered.filter(u => {
                    if (access === 'enabled') return u.access_enabled === true;
                    if (access === 'disabled') return u.access_enabled === false;
                    return true;
                });
            }
            if (status) {
                filtered = filtered.filter(u => {
                    if (status === 'online') return u.is_online === true;
                    if (status === 'offline') return u.is_online === false;
                    return true;
                });
            }
            renderUsersTable(filtered);
        };

        usersRoleFilter.onchange = null;
        usersAccessFilter.onchange = null;
        usersStatusFilter.onchange = null;

        // Apply filter button
        const applyFilterBtn = document.getElementById('users-apply-filter-btn');
        if (applyFilterBtn) {
            applyFilterBtn.onclick = () => {
                filterUsers();
                document.getElementById('users-filter-panel')?.classList.remove('show');
            };
        }

        // Reset filter button
        const clearFiltersBtn = document.getElementById('users-clear-filter-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.onclick = () => {
                usersRoleFilter.value = '';
                usersAccessFilter.value = '';
                usersStatusFilter.value = '';
                filterUsers();
                document.getElementById('users-filter-panel')?.classList.remove('show');
            };
        }
    
        // Also filter on load if any filter is set
        filterUsers();
    } catch (error) {
        console.error('Failed to load users:', error);
        const usersBody = document.getElementById('users-body');
        const usersStatus = document.getElementById('users-status');
        if (usersBody) {
            usersBody.innerHTML = '<tr><td colspan="6">Error loading users.</td></tr>';
        }
        if (usersStatus) {
            usersStatus.textContent = error?.message || 'Failed to load users.';
            usersStatus.classList.add('status--error');
        }
    }
};

const changeUserRole = async (userId, newRole, selectElement) => {
    const originalRole = selectElement.getAttribute('data-current-role');
    const usersStatus = document.getElementById('users-status');
    
    try {
        if (usersStatus) {
            usersStatus.textContent = 'Changing user role...';
            usersStatus.classList.remove('status--error');
        }

        // Double-check user is still offline before changing role
        const targetUser = allUsersData.find(u => u.id === userId);
        if (targetUser && targetUser.is_online) {
            // User went online between modal confirmation and now - prevent role change
            selectElement.value = originalRole; // Revert the select
            const errorMessage = 'User went online. Role change cancelled.';
            if (usersStatus) {
                usersStatus.textContent = errorMessage;
                usersStatus.classList.add('status--error');
            }
            window.showToast(errorMessage, "warning");
            return;
        }

        // Get current logged-in user ID
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id;

        // Call server-side RPC function that validates permissions
        // CRITICAL: This RPC function MUST verify that the calling user is 'super'
        const { data, error } = await supabase.rpc('change_user_role', {
            target_user_id: userId,
            new_role: newRole,
            client_session_token: localStorage.getItem('admin_session_token')
        });

        if (error) {
            throw error;
        }

        // Update success
        selectElement.setAttribute('data-current-role', newRole);
        if (usersStatus) {
            usersStatus.textContent = 'Role updated successfully';
        }
        window.showToast(`Role changed to ${newRole}`, "success");
        
        // Reload users to refresh the display
        await loadUsers();

    } catch (error) {
        console.error('Failed to change user role:', error);
        
        // Revert select to original role
        selectElement.value = originalRole;
        
        // Show user-friendly error message
        let errorMessage = 'Failed to change role';
        
        if (error.hint) {
            errorMessage = error.hint;
        } else if (error.message) {
            if (error.message.includes('last super user')) {
                errorMessage = 'You are the last super user. There must be at least one super user.';
            } else if (error.message.includes('Permission denied')) {
                errorMessage = 'Permission denied. Only super users can change roles.';
            } else if (error.message.includes('Invalid role')) {
                errorMessage = 'Invalid role selected.';
            } else if (error.message.includes('User not found')) {
                errorMessage = 'User not found.';
            } else {
                errorMessage = error.message;
            }
        }
        
        const usersStatus = document.getElementById('users-status');
        if (usersStatus) {
            usersStatus.textContent = errorMessage;
            usersStatus.classList.add('status--error');
        }
        window.showToast(errorMessage, "error");
    }
};

const toggleUserAccess = async (userId, newAccessEnabled, selectElement) => {
    const originalAccess = selectElement.getAttribute('data-current-access') === 'true';
    const usersStatus = document.getElementById('users-status');
    
    try {
        if (usersStatus) {
            usersStatus.textContent = `${newAccessEnabled ? 'Enabling' : 'Disabling'} user access...`;
            usersStatus.classList.remove('status--error');
        }

        // Call server-side RPC function that validates permissions
        // CRITICAL: This RPC function MUST verify that the calling user is 'super'
        const { data, error } = await supabase.rpc('toggle_user_access', {
            target_user_id: userId,
            new_access_enabled: newAccessEnabled,
            client_session_token: localStorage.getItem('admin_session_token')
        });

        if (error) {
            throw error;
        }

        // Update success
        const action = newAccessEnabled ? 'enabled' : 'disabled';
        if (usersStatus) {
            usersStatus.textContent = 'Access updated successfully';
        }
        window.showToast(`Access ${action}`, "success");
        
        // Reload users to refresh the display
        await loadUsers();

    } catch (error) {
        console.error('Failed to toggle user access:', error);
        
        // Revert select to original value
        selectElement.value = originalAccess.toString();
        
        // Show user-friendly error message
        let errorMessage = 'Failed to change access';
        
        if (error.hint) {
            errorMessage = error.hint;
        } else if (error.message) {
            if (error.message.includes('last super user')) {
                errorMessage = 'You are the last super user. There must be at least one super user with access.';
            } else if (error.message.includes('Cannot disable your own access')) {
                errorMessage = 'You cannot disable your own access.';
            } else if (error.message.includes('Permission denied')) {
                errorMessage = 'Permission denied. Only super users can change access.';
            } else if (error.message.includes('User not found')) {
                errorMessage = 'User not found.';
            } else {
                errorMessage = error.message;
            }
        }
        
        const usersStatus = document.getElementById('users-status');
        if (usersStatus) {
            usersStatus.textContent = errorMessage;
            usersStatus.classList.add('status--error');
        }
        window.showToast(errorMessage, "error");
    }
};

// Realtime subscription for profiles changes (user status, role, access)
let profilesRealtimeChannel = null;
const setupProfilesRealtimeSubscription = () => {
    // Clean up existing subscription if any
    if (profilesRealtimeChannel) {
        supabase.removeChannel(profilesRealtimeChannel);
    }

    // Subscribe to all changes (INSERT, UPDATE, DELETE) on profiles table
    profilesRealtimeChannel = supabase
        .channel('profiles_admin_changes')
        .on(
            'postgres_changes',
            {
                event: '*', // Listen to all events
                schema: 'public',
                table: 'profiles'
            },
            (payload) => {
                
                // PREVENTIVE MEASURE: Check if currently edited user went online
                if (payload.eventType === 'UPDATE' && payload.new && payload.old) {
                    const userWentOnline = payload.old.is_online === false && payload.new.is_online === true;
                    const isEditingThisUser = window.currentlyEditingUserId === payload.new.id;
                    const isChangingRoleForThisUser = window.currentlyChangingRoleUserId === payload.new.id;
                    
                    if (userWentOnline && isEditingThisUser) {
                        closeEditUserNameModal();
                        window.showToast('User went online. Edit modal closed.', 'warning');
                    }
                    
                    if (userWentOnline && isChangingRoleForThisUser) {
                        // Close confirmation modal if user went online during role change
                        const confirmModal = document.getElementById('admin-confirm-modal');
                        const cancelBtn = document.getElementById('admin-confirm-cancel-btn');
                        if (confirmModal && confirmModal.classList.contains('active')) {
                            confirmModal.classList.remove('active');
                            window.currentlyChangingRoleUserId = null;
                            window.showToast('User went online. Role change cancelled.', 'warning');
                        }
                    }
                }
                
                // Check if users panel is currently visible
                const usersPanel = document.getElementById('users-panel');
                if (!usersPanel || usersPanel.classList.contains('hidden')) {
                    // Users panel not visible, don't reload
                    return;
                }
                
                // Determine what changed
                let changeType = '';
                if (payload.eventType === 'UPDATE' && payload.new && payload.old) {
                    if (payload.new.is_online !== payload.old.is_online) {
                        changeType = 'status';
                    } else if (payload.new.role !== payload.old.role) {
                        changeType = 'role';
                    } else if (payload.new.access_enabled !== payload.old.access_enabled) {
                        changeType = 'access';
                    }
                }
                
                // Silently refresh the users table to show updated status/role/access
                loadUsers();
                
                // Optional: Show subtle notification for role/access changes only
                // (not for online status changes as those are frequent)
                if (changeType === 'role' || changeType === 'access') {
                    const usersStatus = document.getElementById('users-status');
                    if (usersStatus) {
                        usersStatus.textContent = 'User list updated';
                    }
                }
            }
        )
        .subscribe((status) => {});
};

// Expose for initialization
window.setupProfilesRealtimeSubscription = setupProfilesRealtimeSubscription;

// ============================================
// END USER MANAGEMENT
// ============================================

// Initialize and check permissions
(async () => {
    const userRole = await requireAdmin();
    if (!userRole) return; // Redirected to login or dashboard
    window.adminCurrentRole = userRole;
    enforceUsersPanelAccess();
    window.dispatchEvent(new CustomEvent('admin-role-ready', { detail: { role: userRole } }));
    
    // Start activity-driven global heartbeat for current user
    // This avoids marking idle users as online when no real interaction happens.
    const HEARTBEAT_THROTTLE_MS = 30000;
    let lastHeartbeatAt = 0;

    const updateHeartbeat = async (force = false) => {
        const now = Date.now();
        if (!force && now - lastHeartbeatAt < HEARTBEAT_THROTTLE_MS) {
            return;
        }

        lastHeartbeatAt = now;

        try {
            const { data, error } = await supabase.rpc('update_last_seen');
            if (error) {
                console.warn('Heartbeat error:', error.message);
            } else {
                // Heartbeat updated
            }
        } catch (error) {
            // Heartbeat update skipped
        }
    };

    const activityEvents = ['click', 'keydown', 'touchstart', 'wheel', 'scroll', 'mousedown'];
    const onActivity = () => {
        if (document.visibilityState !== 'visible') {
            return;
        }
        updateHeartbeat();
    };

    activityEvents.forEach((eventName) => {
        document.addEventListener(eventName, onActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateHeartbeat(true);
        }
    });

    window.addEventListener('focus', () => {
        updateHeartbeat(true);
    });

    // Initial heartbeat on page load
    updateHeartbeat(true);
    
    // Show User Management panel only for super users
    if (userRole === 'super') {
        // Wait for users panel to load before setting up
        loadUsersPanel().then(async (loaded) => {
            if (!loaded) {
                return;
            }
            enforceUsersPanelAccess();
            const usersPanelBtn = document.getElementById('users-panel-btn');
            if (usersPanelBtn && localStorage.getItem('adminActivePanel') === 'users-panel') {
                usersPanelBtn.click();
            }
            // Load users for the User Management panel
            await loadUsers();

            // Filter panel toggle
            const usersFilterToggleBtn = document.getElementById('users-filter-toggle-btn');
            const usersFilterPanel = document.getElementById('users-filter-panel');
            if (usersFilterToggleBtn && usersFilterPanel) {
                usersFilterToggleBtn.addEventListener('click', () => {
                    usersFilterPanel.classList.toggle('show');
                });
                document.addEventListener('click', (e) => {
                    if (usersFilterPanel.classList.contains('show') &&
                        !usersFilterPanel.contains(e.target) &&
                        !usersFilterToggleBtn.contains(e.target)) {
                        usersFilterPanel.classList.remove('show');
                    }
                });
            }
            
            // Initialize realtime subscription for profiles
            // This will automatically update the users table when:
            // - User status changes (online/offline)
            // - User role changes
            // - User access is enabled/disabled
            setupProfilesRealtimeSubscription();
        });
    }
})();

// loadEmployees() is now called in uploadPanelLoaded.then() to ensure proper initialization
// Note: loadAdminEmployeesForFilter() is called inside viewPanelLoaded.then() where it's defined

// Preload travel authorities data in the background for faster first load
Promise.all([employeePanelLoaded, uploadPanelLoaded]).then(() => {
    if (typeof loadTravelAuthorities === "function") {
        loadTravelAuthorities(true).catch(err => {
            console.warn("Background preload of travel authorities failed:", err);
        });
    }
});

// Restore last active panel (wait for panels to load first)
Promise.all([viewPanelLoaded, employeePanelLoaded, uploadPanelLoaded]).then(() => {
    const savedPanel = localStorage.getItem("adminActivePanel");
    if (!savedPanel || savedPanel === "upload-panel") return;
    const targetBtn = document.querySelector(`.switch-btn[data-panel="${savedPanel}"]`);
    if (!targetBtn || targetBtn.classList.contains("hidden")) return;
    targetBtn.click();
});

let lastScannedOrphanPaths = [];

const extractStoragePathFromFileUrl = (fileUrl) => {
    if (!fileUrl) return null;
    try {
        const parsed = new URL(fileUrl);
        const marker = '/ta-files/';
        const markerIndex = parsed.pathname.indexOf(marker);
        if (markerIndex < 0) return null;
        return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    } catch (error) {
        return null;
    }
};

const fetchReferencedStoragePaths = async () => {
    const pageSize = 1000;
    let from = 0;
    const referenced = new Set();

    while (true) {
        const { data, error } = await supabase
            .from('travel_authorities')
            .select('file_url')
            .range(from, from + pageSize - 1);

        if (error) {
            throw new Error(`Failed to read records: ${error.message || 'Unknown error'}`);
        }

        if (!data || data.length === 0) break;

        data.forEach((row) => {
            const path = extractStoragePathFromFileUrl(row.file_url);
            if (path) referenced.add(path);
        });

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return referenced;
};

const listStoragePathsRecursive = async () => {
    const storage = supabase.storage.from('ta-files');
    const files = [];

    const walk = async (prefix = '') => {
        const pageSize = 100;
        let offset = 0;

        while (true) {
            const { data, error } = await storage.list(prefix, {
                limit: pageSize,
                offset,
                sortBy: { column: 'name', order: 'asc' }
            });

            if (error) {
                throw new Error(`Failed listing storage at ${prefix || '/'}: ${error.message || 'Unknown error'}`);
            }

            if (!data || data.length === 0) break;

            for (const item of data) {
                const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
                const isFolder = !item.id;
                if (isFolder) {
                    await walk(fullPath);
                } else {
                    files.push(fullPath);
                }
            }

            if (data.length < pageSize) break;
            offset += pageSize;
        }
    };

    await walk('');
    return files;
};

const scanOrphanStorageFiles = async () => {
    const [referencedPaths, storedPaths] = await Promise.all([
        fetchReferencedStoragePaths(),
        listStoragePathsRecursive()
    ]);

    const orphanPaths = storedPaths.filter((path) => !referencedPaths.has(path)).sort();
    lastScannedOrphanPaths = orphanPaths;

    return {
        orphanPaths,
        counts: {
            stored: storedPaths.length,
            referenced: referencedPaths.size
        }
    };
};

const deleteOrphanStorageFiles = async () => {
    if (!lastScannedOrphanPaths.length) {
        return { deleted: 0, remaining: 0 };
    }

    const storage = supabase.storage.from('ta-files');
    const batchSize = 100;
    let deleted = 0;

    for (let i = 0; i < lastScannedOrphanPaths.length; i += batchSize) {
        const batch = lastScannedOrphanPaths.slice(i, i + batchSize);
        const { error } = await storage.remove(batch);
        if (error) {
            throw new Error(`Failed deleting orphan files: ${error.message || 'Unknown error'}`);
        }
        deleted += batch.length;
    }

    lastScannedOrphanPaths = [];
    return { deleted, remaining: 0 };
};

window.adminOrphanFiles = {
    scan: scanOrphanStorageFiles,
    deleteScanned: deleteOrphanStorageFiles,
    getLastScan: () => lastScannedOrphanPaths.slice()
};

// Prevent browser back/forward navigation
// This prevents users from accidentally navigating back to login or other pages
history.pushState(null, null, location.href);
window.addEventListener('popstate', () => {
    history.pushState(null, null, location.href);
});

// Force page reload if loaded from cache (back/forward button)
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

// Initialize header buttons after everything is defined
// This will be called either from here or from the header loader,
// whichever happens last (after both script and HTML are ready)
if (window.headerLoaded) {
    window.initHeaderButtons();
}
// If header hasn't loaded yet, the header loader will call it

