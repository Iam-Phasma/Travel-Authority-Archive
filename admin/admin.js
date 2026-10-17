// Module: Admin — npm-managed dependencies via Vite
import "@lottiefiles/dotlottie-wc";
import { setupRecordToolbar } from "../shared/record-toolbar.js";
import { createClient } from "@supabase/supabase-js";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "../shared/draft-travel-datepicker.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabaseConfig } from "../config.js";
import { initAutoLogout } from "../auto-logout.js";
import { escapeHtml, formatFileSize, formatTaNumber } from "../shared/record-utils.js";
import { createAdminHeader } from "../header/admin-header.js";
import { createAdminSession } from "../auth/admin-session.js";
import { fetchFileSizeBytes } from "../shared/record-files.js";
import { createUserManagement } from "./users/users.js";
import { initAdminRecords } from "./view/records.js";
import { createAdminAccess } from "../auth/page-access.js";
import "../pwa-update.js";

// Expose globals for non-module scripts (upload.js, draft-ta-panel.js, draft-location-picker.js)
window.flatpickr = flatpickr;
window.L = L;

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
const { markCurrentUserOffline, clearAdminClientState, setupAccessMonitoring, setupSessionMonitoring, validateAdminSession } = createAdminSession({
  supabase, showToast: (...args) => window.adminShowToast?.(...args), getUserRole: (id) => getUserRole(id),
});
let currentAdminUserId = "";
const { getUserRole, requireAdmin } = createAdminAccess({
  supabase,
  setCurrentUserId: (id) => { currentAdminUserId = id; },
  markCurrentUserOffline, clearAdminClientState,
});

// Initialize auto-logout (5 minutes warning, 6 minutes total)
initAutoLogout(supabase, {
  warningTime: 5 * 60 * 1000, // 5 minutes
  logoutTime: 6 * 60 * 1000, // 6 minutes (5 min warning + 1 min countdown)
  onLogout: async () => {
    await markCurrentUserOffline();
  },
});

// Load upload panel
const uploadPanelLoaded = fetch("upload/upload-panel.html")
  .then((r) => r.text())
  .then((panelHTML) => {
    document.getElementById("upload-panel-container").innerHTML = panelHTML;
    return true;
  })
  .catch((error) => {
    console.error("Error loading upload panel:", error);
    return false;
  });

// Load OCR modal
const ocrModalLoaded = fetch("upload/ocr-modal.html")
  .then((r) => r.text())
  .then((modalHTML) => {
    document.getElementById("ocr-modal-container").innerHTML = modalHTML;
    // Init after HTML is injected so getElementById calls inside succeed
    if (window.initOCRModal) window.initOCRModal();
    return true;
  })
  .catch((error) => {
    console.error("Error loading OCR modal:", error);
    return false;
  });

// Load view panel and modals
const viewPanelLoaded = Promise.all([
  fetch("view/view-panel.html").then((r) => r.text()),
  fetch("view/view-modals.html").then((r) => r.text()),
])
  .then(([panelHTML, modalsHTML]) => {
    document.getElementById("view-panel-container").innerHTML = panelHTML;
    document.getElementById("view-modals-container").innerHTML = modalsHTML;
    if (
      typeof window.applyAdminMatchAllFilterVisibility === "function" &&
      typeof window.getHideMatchAllFilter === "function"
    ) {
      window.applyAdminMatchAllFilterVisibility(window.getHideMatchAllFilter());
    }
    window.dispatchEvent(new Event("admin-view-panel-ready"));
    return true;
  })
  .catch((error) => {
    console.error("Error loading view components:", error);
    return false;
  });

// Load employee panel and modals
const employeePanelLoaded = Promise.all([
  fetch("employees/employees-panel.html").then((r) => r.text()),
  fetch("employees/employees-modals.html").then((r) => r.text()),
])
  .then(([panelHTML, modalsHTML]) => {
    document.getElementById("employees-panel-container").innerHTML = panelHTML;
    setupRecordToolbar(document.getElementById("employees-panel"));
    document.getElementById("employees-modals-container").innerHTML =
      modalsHTML;

    if (window.initEmployeeManagement) {
      window.initEmployeeManagement(supabase);
    }
    return true;
  })
  .catch((error) => {
    console.error("Error loading employee components:", error);
    return false;
  });

// Load draft-ta panel
const draftTaPanelLoaded = fetch("draft-ta/draft-ta-panel.html?v=20260816-1")
  .then((r) => r.text())
  .then((panelHTML) => {
    document.getElementById("draft-ta-panel-container").innerHTML = panelHTML;
    return true;
  })
  .catch((error) => {
    console.error("Error loading draft-ta panel:", error);
    return false;
  });

// Load users panel lazily (super users only)
let usersPanelLoadedPromise = null;
const loadUsersPanel = () => {
  if (usersPanelLoadedPromise) {
    return usersPanelLoadedPromise;
  }

  usersPanelLoadedPromise = fetch("users/users-panel.html")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch users panel: ${response.status}`);
      }
      return response.text();
    })
    .then((panelHTML) => {
      document.getElementById("users-panel-container").innerHTML = panelHTML;
      return true;
    })
    .catch((error) => {
      console.error("Error loading users panel:", error);
      usersPanelLoadedPromise = null;
      return false;
    });

  return usersPanelLoadedPromise;
};

// Initialize access monitoring
setupAccessMonitoring();

// Initialize session monitoring
setupSessionMonitoring();

// Check session validity every 30 seconds
setInterval(validateAdminSession, 30000);

window.initHeaderButtons = createAdminHeader({
  supabase, markCurrentUserOffline, clearAdminClientState,
  getEmployees: () => employeesList, loadEmployees: () => loadEmployees(),
});
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

const createMultiSelect = (
  displayId,
  dropdownId,
  searchId,
  optionsId,
  selectedArray,
  supabase,
) => {
  const display = document.getElementById(displayId);
  const dropdown = document.getElementById(dropdownId);
  const search = document.getElementById(searchId);
  const options = document.getElementById(optionsId);

  const updateDisplay = () => {
    if (selectedArray.length === 0) {
      display.innerHTML =
        '<span class=\"multiselect-placeholder\">Select officials...</span>';
    } else {
      display.innerHTML = selectedArray
        .map(
          (name) =>
            `<span class=\"multiselect-tag\">${escapeHtml(name)}<button type=\"button\" class=\"multiselect-remove\" data-name=\"${escapeHtml(name)}\">&times;</button></span>`,
        )
        .join("");

      display.querySelectorAll(".multiselect-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const name = e.target.getAttribute("data-name");
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
    const filtered = employeesList.filter(
      (emp) =>
        emp.name.toLowerCase().includes(searchTerm) &&
        !selectedArray.includes(emp.name),
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

        const addBtn = options.querySelector(".multiselect-add-btn");
        if (addBtn) {
          addBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const nameToAdd = search.value.trim();

            if (!nameToAdd) return;

            const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
            if (!namePattern.test(nameToAdd)) {
              alert(
                "Only letters, hyphens, apostrophes, periods, and commas are allowed.",
              );
              return;
            }

            if (nameToAdd.length > 30) {
              alert("Official name cannot exceed 30 characters.");
              return;
            }

            // Check if already exists in the list
            const existingEmployee = employeesList.find(
              (emp) => emp.name.toLowerCase() === nameToAdd.toLowerCase(),
            );
            if (existingEmployee) {
              // If exists, just add to selection
              if (!selectedArray.includes(existingEmployee.name)) {
                selectedArray.push(existingEmployee.name);
                search.value = "";
                updateDisplay();
                renderOptions();
              }
              return;
            }

            try {
              // Disable button during operation
              addBtn.disabled = true;
              addBtn.textContent = "Adding...";

              // Insert into database
              const { error } = await supabase
                .from("employee_list")
                .insert([
                  {
                    name: nameToAdd,
                    position: "Not specified",
                    is_active: true,
                  },
                ]);

              if (error) {
                console.error("Database insert error:", error);
                if (
                  error.code === "23505" ||
                  error.message?.includes("duplicate") ||
                  error.message?.includes("unique")
                ) {
                  alert("This official name already exists in the database.");
                } else {
                  alert("Failed to add official: " + error.message);
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

              search.value = "";
              updateDisplay();
              renderOptions();
            } catch (error) {
              console.error("Error adding official:", error);
              alert("Failed to add official.");
              addBtn.disabled = false;
              addBtn.textContent = `Add "${nameToAdd}"`;
            }
          });
        }
      } else {
        options.innerHTML =
          '<div class="multiselect-no-options">No options available</div>';
      }
    } else {
      options.innerHTML = filtered
        .map((emp) => {
          const inactiveClass =
            emp.is_active === false ? " inactive-employee" : "";
          const inactiveLabel =
            emp.is_active === false
              ? ' <span class=\"inactive-label\">(Inactive)</span>'
              : "";
          return `<div class=\"multiselect-option${inactiveClass}\" data-name=\"${escapeHtml(emp.name)}\">${escapeHtml(emp.name)}${inactiveLabel}</div>`;
        })
        .join("");

      options.querySelectorAll(".multiselect-option").forEach((opt) => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          const name = opt.getAttribute("data-name");
          if (!selectedArray.includes(name)) {
            selectedArray.push(name);
            search.value = "";
            updateDisplay();
            renderOptions();
          }
        });
      });
    }

    // Wire clear-all if present in this multiselect instance
    const clearBtn = document.getElementById(dropdownId)?.querySelector('.multiselect-clear-all');
    if (clearBtn) {
      clearBtn.removeEventListener('click', clearBtn._clearHandler);
      clearBtn._clearHandler = (e) => {
        e.stopPropagation();
        if (selectedArray.length === 0) return;
        selectedArray.length = 0;
        updateDisplay();
        renderOptions();
        search.focus();
      };
      clearBtn.addEventListener('click', clearBtn._clearHandler);
    }
  };

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
    if (dropdown.classList.contains("show")) {
      renderOptions(); // Render options when dropdown opens
      search.focus();
    }
  });

  search.addEventListener("input", renderOptions);
  search.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", (e) => {
    // Don't close dropdown if clicking on header popup elements
    const headerPopup = document.getElementById("header-popup-panel");
    const userMenuBtn = document.getElementById("user-menu-btn");
    if (
      headerPopup &&
      (headerPopup.contains(e.target) ||
        e.target === userMenuBtn ||
        userMenuBtn?.contains(e.target))
    ) {
      return;
    }
    if (dropdown.classList.contains("show")) {
      search.value = "";
    }
    dropdown.classList.remove("show");
  });

  return { updateDisplay, renderOptions };
};

// Wait for upload panel to load before initializing multi-selects
uploadPanelLoaded.then(async () => {

  await loadEmployees();

  const employeesMultiSelect = createMultiSelect(
    "employees-display",
    "employees-dropdown",
    "employees-search",
    "employees-options",
    selectedEmployees,
    supabase,
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
    "update-employees-display",
    "update-employees-dropdown",
    "update-employees-search",
    "update-employees-options",
    updateSelectedEmployees,
    supabase,
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
  const knownNames = employeesList.map((emp) => emp.name);
  // Sort by length descending so longer names (with commas) match first
  const sortedNames = knownNames.slice().sort((a, b) => b.length - a.length);
  const result = [];
  let remaining = employeesStr.trim();

  while (remaining.length > 0) {
    let matched = false;
    for (const name of sortedNames) {
      if (remaining.startsWith(name)) {
        result.push(name);
        remaining = remaining.substring(name.length).replace(/^,\s*/, "");
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Fallback: take until next comma
      const commaIdx = remaining.indexOf(",");
      if (commaIdx > -1) {
        result.push(remaining.substring(0, commaIdx).trim());
        remaining = remaining.substring(commaIdx + 1).trim();
      } else {
        if (remaining.trim()) result.push(remaining.trim());
        remaining = "";
      }
    }
  }
  return result.filter((name) => name);
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

const updateViewFileSize = async (fileUrl) => {
  const sizeEl = document.getElementById("view-file-size");
  const linkEl = document.getElementById("view-file-link");
  if (!sizeEl || !linkEl) return;
  if (!fileUrl || fileUrl === "#") {
    sizeEl.textContent = "File size: -";
    return;
  }

  sizeEl.textContent = "File size: Loading...";
  const expectedUrl = fileUrl;
  const size = await fetchFileSizeBytes(fileUrl);

  if (
    (linkEl.dataset.fileUrl || linkEl.getAttribute("href") || "") !==
    expectedUrl
  ) {
    return;
  }

  sizeEl.textContent = size ? formatFileSize(size) : "File size: Unavailable";
};

const isValidTaNumber = (value) => /^\d{4}-\d{2}-\d{4}$/.test(value);
window.isValidTaNumber = isValidTaNumber; // Expose for upload.js

const bindTaFormatter = (input) => {
  if (!input) return;
  input.addEventListener("input", () => {
    input.value = formatTaNumber(input.value);
  });
};
window.bindTaFormatter = bindTaFormatter; // Expose for upload.js

// Panel switching logic
const adminPanelSwitcher = document.querySelector(".admin-panel-switcher");
const switchButtons = document.querySelectorAll(".switch-btn");

// Sidebar collapse toggle
const adminSidebar = document.getElementById("admin-sidebar");
const adminSidebarToggle = document.getElementById("admin-sidebar-toggle");
const adminWrapper = document.getElementById("admin-wrapper");

const savedAdminSidebarCollapsed =
  localStorage.getItem("adminSidebarCollapsed") === "true";
if (adminSidebar && savedAdminSidebarCollapsed) {
  adminSidebar.classList.add("collapsed");
  if (adminWrapper) adminWrapper.classList.add("sidebar-collapsed");
}

if (adminSidebar && adminSidebarToggle) {
  adminSidebarToggle.addEventListener("click", () => {
    const isNowCollapsed = adminSidebar.classList.toggle("collapsed");
    if (adminWrapper)
      adminWrapper.classList.toggle("sidebar-collapsed", isNowCollapsed);
    localStorage.setItem("adminSidebarCollapsed", isNowCollapsed);
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
    const hasOverflow =
      adminPanelSwitcher.scrollWidth > adminPanelSwitcher.clientWidth + 2;
    adminPanelSwitcher.classList.toggle("compact-icons", hasOverflow);
  });
};

const updateAdminSwitcherStickyState = () => {
  if (!adminPanelSwitcher) return;

  const stickyTop =
    parseFloat(window.getComputedStyle(adminPanelSwitcher).top) || 0;
  const { top } = adminPanelSwitcher.getBoundingClientRect();
  const isStuck = window.scrollY > 0 && top <= stickyTop + 1;
  adminPanelSwitcher.classList.toggle("is-stuck", isStuck);
};

window.addEventListener("resize", updateAdminSwitcherLayout);
window.addEventListener("load", updateAdminSwitcherLayout);
window.addEventListener("resize", updateAdminSwitcherStickyState);
window.addEventListener("load", updateAdminSwitcherStickyState);
window.addEventListener("scroll", updateAdminSwitcherStickyState, {
  passive: true,
});
updateAdminSwitcherLayout();
updateAdminSwitcherStickyState();

const isSuperUser = () => window.adminCurrentRole === "super";

const enforceUsersPanelAccess = () => {
  const usersPanelBtn = document.getElementById("users-panel-btn");
  const usersPanel = document.getElementById("users-panel");
  const shouldHideUsersAccess = !isSuperUser();

  if (usersPanelBtn) {
    usersPanelBtn.classList.toggle("hidden", shouldHideUsersAccess);
    usersPanelBtn.toggleAttribute("hidden", shouldHideUsersAccess);
  }

  if (!isSuperUser() && usersPanel) {
    usersPanel.classList.add("hidden");
  }

  if (
    !isSuperUser() &&
    localStorage.getItem("adminActivePanel") === "users-panel"
  ) {
    localStorage.setItem("adminActivePanel", "upload-panel");
  }

  updateAdminSwitcherLayout();
};

const restoreAdminActivePanel = () =>
  Promise.all([
    viewPanelLoaded,
    employeePanelLoaded,
    uploadPanelLoaded,
    draftTaPanelLoaded,
  ]).then(() => {
    const savedPanel = localStorage.getItem("adminActivePanel");
    let targetPanel = savedPanel || "upload-panel";

    if (targetPanel === "users-panel" && !isSuperUser()) {
      targetPanel = "upload-panel";
      localStorage.setItem("adminActivePanel", targetPanel);
    }

    if (targetPanel === "upload-panel") {
      const uploadPanel = document.getElementById("upload-panel");
      if (uploadPanel) {
        revealAdminPanel(uploadPanel);
      }
      return;
    }

    const targetBtn = document.querySelector(
      `.switch-btn[data-panel="${targetPanel}"]`,
    );
    if (!targetBtn || targetBtn.classList.contains("hidden")) {
      activateAdminPanel("upload-panel");
      return;
    }
    targetBtn.click();
  });

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
  if (targetPanel === "users-panel" && !isSuperUser()) {
    console.warn("Users panel is restricted to super users.");
    activateAdminPanel("upload-panel");
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
  const draftTaPanel = document.getElementById("draft-ta-panel");
  const usersPanel = document.getElementById("users-panel");

  const allPanels = [
    uploadPanel,
    viewPanel,
    employeesPanel,
    draftTaPanel,
    usersPanel,
  ];

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
  } else if (targetPanel === "draft-ta-panel") {
    const showDraftTaPanel = () => {
      const currentPanel = document.getElementById("draft-ta-panel");
      if (!currentPanel) return;
      revealAdminPanel(currentPanel);
      if (window.initDraftTaPanel) {
        window.initDraftTaPanel(supabase);
      }
    };
    if (draftTaPanel) {
      showDraftTaPanel();
    } else {
      draftTaPanelLoaded.then((loaded) => {
        if (loaded) showDraftTaPanel();
      });
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
          initControlHeaderTooltip();
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
  initAdminRecords({
    supabase,
    getCurrentUserId: () => currentAdminUserId,
    getUpdateEmployeesMultiSelect: () => updateEmployeesMultiSelect,
    updateSelectedEmployees, updateViewFileSize, parseEmployeeNames,
    bindTaFormatter, isValidTaNumber,
  });
});

// ============================================
// EMPLOYEE MANAGEMENT
// ============================================
// Employee management is loaded from employees/employees.js

// ============================================
// USER MANAGEMENT (SUPER USER ONLY)
// ============================================

// Query user-panel elements after users/users-panel.html has loaded.

const { loadUsers, initControlHeaderTooltip, setupProfilesRealtimeSubscription } =
  createUserManagement({ supabase, isSuperUser });
window.setupProfilesRealtimeSubscription = setupProfilesRealtimeSubscription;

// ============================================
// User directory initialization
// ============================================

// Initialize and check permissions
(async () => {
  const result = await requireAdmin();
  if (!result) return; // Redirected to login or dashboard
  const { role: userRole, control: userControl } = result;
  window.adminCurrentRole = userRole;
  window.adminCurrentControl = userControl;
  enforceUsersPanelAccess();
  await restoreAdminActivePanel();
  window.dispatchEvent(
    new CustomEvent("admin-role-ready", { detail: { role: userRole } }),
  );

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
      const { data, error } = await supabase.rpc("update_last_seen");
      if (error) {
        console.warn("Heartbeat error:", error.message);
      } else {

      }
    } catch (error) {

    }
  };

  const activityEvents = [
    "click",
    "keydown",
    "touchstart",
    "wheel",
    "scroll",
    "mousedown",
  ];
  const onActivity = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    updateHeartbeat();
  };

  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, onActivity, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateHeartbeat(true);
    }
  });

  window.addEventListener("focus", () => {
    updateHeartbeat(true);
  });

  // Initial heartbeat on page load
  updateHeartbeat(true);

  // Show User Management panel only for super users
  if (userRole === "super") {
    // Wait for users panel to load before setting up
    loadUsersPanel().then(async (loaded) => {
      if (!loaded) {
        return;
      }
      initControlHeaderTooltip();
      enforceUsersPanelAccess();
      const usersPanelBtn = document.getElementById("users-panel-btn");
      if (
        usersPanelBtn &&
        localStorage.getItem("adminActivePanel") === "users-panel"
      ) {
        usersPanelBtn.click();
      }
      // Load users for the User Management panel
      await loadUsers();

      // Per-section filter panel toggles
      ["super", "admin", "user"].forEach((role) => {
        const toggleBtn = document.getElementById(
          `users-filter-toggle-btn-${role}`,
        );
        const filterPanel = document.getElementById(
          `users-filter-panel-${role}`,
        );
        if (!toggleBtn || !filterPanel) return;
        toggleBtn.addEventListener("click", () => {
          const isOpen = filterPanel.classList.contains("show");
          // Close all panels first
          ["super", "admin", "user"].forEach((r) => {
            const panel = document.getElementById(`users-filter-panel-${r}`);
            panel?.classList.remove("show");
            panel?.classList.remove("open-up");
          });
          if (!isOpen) {
            const triggerRect = toggleBtn.getBoundingClientRect();
            const panelHeight = Math.max(filterPanel.offsetHeight || 0, 280);
            const availableBelow = window.innerHeight - triggerRect.bottom;
            const shouldOpenUp = availableBelow < panelHeight + 20;
            filterPanel.classList.toggle("open-up", shouldOpenUp);
            filterPanel.classList.add("show");
          }
        });
        document.addEventListener("click", (e) => {
          if (
            filterPanel.classList.contains("show") &&
            !filterPanel.contains(e.target) &&
            !toggleBtn.contains(e.target)
          ) {
            filterPanel.classList.remove("show");
          }
        });
      });

      // Refresh the directory when profile status, role, or access changes.
      setupProfilesRealtimeSubscription();
    });
  }
})();

// Prevent browser back/forward navigation
// This prevents users from accidentally navigating back to login or other pages
history.pushState(null, null, location.href);
window.addEventListener("popstate", () => {
  history.pushState(null, null, location.href);
});

// Force page reload if loaded from cache (back/forward button)
window.addEventListener("pageshow", (event) => {
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
