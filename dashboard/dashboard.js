// Module: Dashboard — npm-managed dependencies via Vite
import "@lottiefiles/dotlottie-wc";
import { createClient } from "@supabase/supabase-js";
import Chart from "chart.js/auto";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabaseConfig } from "../config.js";
import { initAutoLogout } from "../auto-logout.js";

// Expose globals for non-module scripts (draft-ta-panel.js, draft-location-picker.js, ta-generator.js)
window.Chart = Chart;
window.flatpickr = flatpickr;
window.L = L;

// Initialize Supabase
const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const markCurrentUserOffline = async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    const offlineTimestamp = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();
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

const clearDashboardClientState = () => {
  localStorage.removeItem("dashboardFilters");
  localStorage.removeItem("dashboardSort");
  sessionStorage.removeItem("dashboardLoginMarker");
};

// Initialize auto-logout (5 minutes warning, 6 minutes total)
initAutoLogout(supabase, {
  warningTime: 5 * 60 * 1000, // 5 minutes
  logoutTime: 6 * 60 * 1000, // 6 minutes (5 min warning + 1 min countdown)
  onLogout: async () => {
    await markCurrentUserOffline();
    clearDashboardClientState();
  },
});

// Realtime subscription to monitor current user's access status
const setupAccessMonitoring = async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    // Subscribe to changes on current user's profile
    const accessChannel = supabase
      .channel("user_access_monitoring")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // Check if access was disabled
          if (payload.new && payload.new.access_enabled === false) {
            // Show toast notification
            let toastEl = document.getElementById("toast");
            if (!toastEl) {
              toastEl = document.createElement("div");
              toastEl.id = "toast";
              toastEl.className = "toast";
              document.body.appendChild(toastEl);
            }
            toastEl.textContent = "Access disabled: You have been logged out.";
            toastEl.classList.add("show", "toast--error");

            // Immediate logout
            setTimeout(async () => {
              try {
                await markCurrentUserOffline();
                clearDashboardClientState();
                await supabase.auth.signOut();
              } catch (error) {
                console.error("Forced logout error:", error);
              }
              window.location.href = "../index.html";
            }, 1000);
          }
        },
      )
      .subscribe((status) => {});
  } catch (err) {
    console.error("Error setting up access monitoring:", err);
  }
};

// Initialize access monitoring
setupAccessMonitoring();

// Define header button initialization function
// Show confirmation modal and return a Promise
const showConfirmation = (title, message) => {
  return new Promise((resolve) => {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModal.classList.add("show");

    // Apply red styling for logout confirmation
    const isLogout = title === "Confirm Logout";
    if (isLogout) {
      confirmConfirmBtn.style.background = "#a1251b";
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
      confirmConfirmBtn.removeEventListener("click", handleConfirm);
      cancelConfirmBtn.removeEventListener("click", handleCancel);
      confirmModal.removeEventListener("click", handleClickOutside);
      // Reset button styling
      if (isLogout) {
        confirmConfirmBtn.style.background = "";
      }
    };

    confirmConfirmBtn.addEventListener("click", handleConfirm);
    cancelConfirmBtn.addEventListener("click", handleCancel);
    confirmModal.addEventListener("click", handleClickOutside);
  });
};

let headerButtonsInitialized = false;
window.initHeaderButtons = () => {
  if (headerButtonsInitialized) return;

  const userMenuBtn = document.getElementById("user-menu-btn");
  const headerPopup = document.getElementById("header-popup-panel");
  const noticePanel = document.getElementById("header-notice-panel");
  const draftTaOption = document.getElementById("header-draft-ta-option");
  const settingsOption = document.getElementById("header-settings-option");
  const logoutOption = document.getElementById("header-logout-option");
  const draftTaModal = document.getElementById("header-draft-ta-modal");
  const draftTaForm = document.getElementById("header-draft-ta-form");
  const draftTaCloseBtn = document.getElementById("header-draft-ta-close");
  const draftTaClearBtn = document.getElementById("header-draft-ta-clear");
  const draftTaCreateBtn = document.getElementById("header-draft-ta-create");
  const draftTaPurposeInput = document.getElementById(
    "header-draft-ta-purpose",
  );
  const draftTaDestinationInput = document.getElementById(
    "header-draft-ta-destination",
  );
  const draftTaTravelTypeSelect = document.getElementById(
    "header-draft-ta-travel-type",
  );
  const draftTaFundingOptionSelect = document.getElementById(
    "header-draft-ta-funding-option",
  );
  const draftTaDateRequestInput = document.getElementById(
    "header-draft-ta-date-request",
  );
  const draftTaTravelDateInput = document.getElementById(
    "header-draft-ta-travel-date",
  );
  const draftTaTravelEndInput = document.getElementById(
    "header-draft-ta-travel-end",
  );
  const draftTaOfficialsDisplay = document.getElementById(
    "header-draft-ta-officials-display",
  );
  const draftTaOfficialsDropdown = document.getElementById(
    "header-draft-ta-officials-dropdown",
  );
  const draftTaOfficialsSearch = document.getElementById(
    "header-draft-ta-officials-search",
  );
  const draftTaOfficialsOptions = document.getElementById(
    "header-draft-ta-officials-options",
  );
  const messagesBtn = document.getElementById("header-messages-btn");
  const noticeCreateBtn = document.getElementById("header-notice-create-btn");
  const noticeActions = document.getElementById("header-notice-actions");
  const noticeEmpty = document.getElementById("header-notice-empty");
  const noticeDivider = document.getElementById("header-notice-divider");
  const noticeList = document.getElementById("header-notice-list");
  const noticeListItems = document.getElementById("header-notice-list-items");
  const noticeListEmpty = document.getElementById("header-notice-list-empty");
  const noticeShowMore = document.getElementById("header-notice-show-more");
  const noticeCompose = document.getElementById("header-notice-compose");
  const noticeComposeText = document.getElementById("header-notice-compose-text");
  const noticeComposeSend = document.getElementById("header-notice-compose-send");
  const noticeComposeCount = document.getElementById("header-notice-compose-count");
  const noticeComposeCancel = document.getElementById("header-notice-compose-cancel");
  const userEmailElement = document.getElementById("header-user-email");
  const userNameElement = document.getElementById("header-user-name");
  const headerDraftSelectedEmployees = [];
  let headerDraftEmployeesList = [];
  let headerDraftEmployeesMultiSelect = null;

  window.headerDraftSelectedEmployees = headerDraftSelectedEmployees;

  if (!userMenuBtn || !headerPopup) {
    return;
  }

  headerButtonsInitialized = true;

  const capitalizeWords = (str) => {
    if (!str) return "";
    return str
      .split(" ")
      .map((word) => {
        if (!word) return "";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  };

  const setResponsiveHeaderName = (rawFName, rawLName, fallbackName) => {
    if (!userNameElement) return;

    const fname = capitalizeWords(rawFName || "");
    const lname = capitalizeWords(rawLName || "");
    const fullName = `${fname} ${lname}`.trim();

    const renderName = () => {
      const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
      if (isSmallScreen && fname) {
        const initials = fname
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase())
          .join("");
        const compactName = `${initials} ${lname}`.trim();
        userNameElement.textContent = compactName || fullName || fallbackName;
        return;
      }

      userNameElement.textContent = fullName || fallbackName;
    };

    renderName();

    if (window.__headerNameResizeHandler) {
      window.removeEventListener("resize", window.__headerNameResizeHandler);
    }
    window.__headerNameResizeHandler = renderName;
    window.addEventListener("resize", window.__headerNameResizeHandler);
  };

  const setMessagesButtonVisibility = (role) => {
    if (!messagesBtn) return;

    const normalizedRole = String(role || "").toLowerCase();
    const canViewMessages =
      normalizedRole === "user" ||
      normalizedRole === "admin" ||
      normalizedRole === "super";
    messagesBtn.toggleAttribute("hidden", !canViewMessages);
    const isSuper = normalizedRole === "super";
    noticeCreateBtn?.toggleAttribute("hidden", !isSuper);
    noticeActions?.toggleAttribute("hidden", !isSuper);
  };

  let noticeSenderName = "";

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderNoticePanel = async () => {
    const isCurrentUserSuper = noticeCreateBtn && !noticeCreateBtn.hasAttribute("hidden");
    const { data: notices, error } = await supabase
      .from("notices")
      .select("id, message, sender, created_at, receiver")
      .eq("is_active", true)
      .or("receiver.eq.users,receiver.eq.both")
      .order("created_at", { ascending: false });

    const items = error ? [] : (notices || []);
    const hasNotices = items.length > 0;

    noticeEmpty?.toggleAttribute("hidden", hasNotices);
    noticeDivider?.toggleAttribute("hidden", !isCurrentUserSuper || !hasNotices);
    noticeList?.toggleAttribute("hidden", !hasNotices);

    if (!noticeListItems) {
      return;
    }

    if (!hasNotices) {
      noticeListItems.innerHTML = "";
      noticeListEmpty?.toggleAttribute("hidden", false);
      return;
    }

    noticeListEmpty?.toggleAttribute("hidden", true);
    noticeListItems.innerHTML = items
      .map((notice) => {
        const createdAt = notice.created_at
          ? new Date(notice.created_at).toLocaleDateString()
          : "Recently";
        const receiverLabel = notice.receiver === "both" ? "Everyone" : notice.receiver === "admins" ? "Admins" : "Users";
        const actionBtns = isCurrentUserSuper ? `
          <div class="header-notice-item-actions">
            <button class="header-notice-item-btn notice-edit-receiver-btn" data-id="${escapeHtml(String(notice.id))}" title="Edit receiver" aria-label="Edit receiver">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z"/></svg>
            </button>
            <button class="header-notice-item-btn danger notice-delete-btn" data-id="${escapeHtml(String(notice.id))}" title="Delete notice" aria-label="Delete notice">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/></svg>
            </button>
          </div>` : "";
        const receiverEditRow = isCurrentUserSuper ? `
          <div class="header-notice-receiver-edit" hidden>
            <textarea class="notice-message-edit-ta" rows="3" maxlength="400">${escapeHtml(notice.message || "")}</textarea>
            <div class="notice-edit-receivers">
              <label class="header-notice-receiver-label"><input type="checkbox" class="notice-receiver-cb" value="users" ${notice.receiver === "users" || notice.receiver === "both" ? "checked" : ""}> Users</label>
              <label class="header-notice-receiver-label"><input type="checkbox" class="notice-receiver-cb" value="admins" ${notice.receiver === "admins" || notice.receiver === "both" ? "checked" : ""}> Admins</label>
            </div>
            <div class="notice-edit-actions">
              <button class="header-notice-receiver-save">Save</button>
              <button class="header-notice-receiver-cancel">Cancel</button>
            </div>
          </div>` : "";
        return `<li class="header-notice-list-item" data-id="${escapeHtml(String(notice.id))}">
          <div class="header-notice-item-body">
            <div class="header-notice-item-text-wrap">
              <p class="header-notice-list-item-text">${escapeHtml(notice.message || "")}</p>
              <p class="header-notice-list-item-time">${escapeHtml(notice.sender || "")} · ${escapeHtml(createdAt)}</p>
              ${isCurrentUserSuper ? `<span class="header-notice-item-receiver">${escapeHtml(receiverLabel)}</span>` : ""}
            </div>
            ${actionBtns}
          </div>
          ${receiverEditRow}
        </li>`;
      })
      .join("");

    // Show only first 3, rest hidden; wire Show More button
    const NOTICE_LIMIT = 3;
    const allLi = noticeListItems.querySelectorAll(".header-notice-list-item");
    allLi.forEach((li, i) => { if (i >= NOTICE_LIMIT) li.setAttribute("hidden", ""); });
    const hasMore = allLi.length > NOTICE_LIMIT;
    if (noticeShowMore) {
      noticeShowMore.toggleAttribute("hidden", !hasMore);
      noticeShowMore.textContent = `Show more (${allLi.length - NOTICE_LIMIT})`;
      const onShowMore = () => {
        allLi.forEach((li) => li.removeAttribute("hidden"));
        noticeShowMore.toggleAttribute("hidden", true);
        noticeShowMore.removeEventListener("click", onShowMore);
      };
      noticeShowMore.removeEventListener("click", noticeShowMore._handler);
      noticeShowMore._handler = onShowMore;
      noticeShowMore.addEventListener("click", onShowMore);
    }

    if (isCurrentUserSuper) {
      noticeListItems.querySelectorAll(".notice-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          if (!confirm("Delete this notice?")) return;
          const { error: delError } = await supabase.from("notices").delete().eq("id", id);
          if (delError) { console.error(delError); return; }
          void renderNoticePanel();
        });
      });

      noticeListItems.querySelectorAll(".notice-edit-receiver-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const li = btn.closest(".header-notice-list-item");
          const editRow = li?.querySelector(".header-notice-receiver-edit");
          if (!editRow) return;
          const isOpen = !editRow.hasAttribute("hidden");
          editRow.toggleAttribute("hidden", isOpen);
        });
      });

      noticeListItems.querySelectorAll(".header-notice-receiver-cancel").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const editRow = btn.closest(".header-notice-receiver-edit");
          editRow?.toggleAttribute("hidden", true);
        });
      });

      noticeListItems.querySelectorAll(".header-notice-receiver-save").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const li = btn.closest(".header-notice-list-item");
          const id = li?.getAttribute("data-id");
          const checked = Array.from(li.querySelectorAll(".notice-receiver-cb:checked")).map((cb) => cb.value);
          if (checked.length === 0) { alert("Select at least one receiver."); return; }
          const newReceiver = checked.length === 2 ? "both" : checked[0];
          const ta = li.querySelector(".notice-message-edit-ta");
          const newMessage = ta ? ta.value.trim() : null;
          if (!newMessage) { alert("Notice message cannot be empty."); return; }
          btn.disabled = true;
          const updates = { receiver: newReceiver, message: newMessage };
          const { error: updError } = await supabase.from("notices").update(updates).eq("id", id);
          btn.disabled = false;
          if (updError) { console.error(updError); return; }
          void renderNoticePanel();
        });
      });
    }
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
      draftTaTravelTypeSelect.value = "official_business";
    }
    if (draftTaFundingOptionSelect && !draftTaFundingOptionSelect.value) {
      draftTaFundingOptionSelect.value = "reimbursement";
    }
  };

  const loadHeaderDraftEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from("employee_list")
        .select("name, position, is_active, office")
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      headerDraftEmployeesList = data || [];
    } catch (error) {
      console.error("Failed to load officials for Draft TA:", error);
      headerDraftEmployeesList = [];
    }

    return headerDraftEmployeesList;
  };

  const createHeaderDraftOfficialsMultiSelect = () => {
    if (
      !draftTaOfficialsDisplay ||
      !draftTaOfficialsDropdown ||
      !draftTaOfficialsSearch ||
      !draftTaOfficialsOptions
    ) {
      return null;
    }

    // persisted CHED-only toggle for header multi-select
    let dashChedOnly = localStorage.getItem('draftTaHeaderChedOnly') === '1';
    const dashSettingsBtn = document.getElementById('dash-panel-draft-ta-officials-settings-btn');
    let dashSettingsPanel = null;

    const closeDropdown = () => {
      draftTaOfficialsSearch.value = "";
      draftTaOfficialsDropdown.classList.remove("show");
      if (dashSettingsPanel) dashSettingsPanel.classList.remove("open");
    };

    const updateDisplay = () => {
      if (headerDraftSelectedEmployees.length === 0) {
        draftTaOfficialsDisplay.innerHTML =
          '<span class="multiselect-placeholder">Select officials...</span>';
        return;
      }

      draftTaOfficialsDisplay.innerHTML = headerDraftSelectedEmployees
        .map(
          (name) =>
            `<span class="multiselect-tag">${escapeHtml(name)}<button type="button" class="multiselect-remove" data-name="${escapeHtml(name)}">&times;</button></span>`,
        )
        .join("");

      draftTaOfficialsDisplay
        .querySelectorAll(".multiselect-remove")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const name = btn.getAttribute("data-name");
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
      const filteredEmployees = headerDraftEmployeesList.filter((emp) => {
        if (dashChedOnly) {
          const office = String(emp.office || '').trim().toLowerCase();
          if (office !== 'ched') return false;
        }
        return emp.name.toLowerCase().includes(searchTerm) && !headerDraftSelectedEmployees.includes(emp.name);
      });

      if (filteredEmployees.length === 0) {
        if (searchTerm.trim()) {
          draftTaOfficialsOptions.innerHTML = `
                        <div class="multiselect-no-options">
                            No matching officials found
                            <br>
                            <button type="button" class="multiselect-add-btn">Add "${escapeHtml(draftTaOfficialsSearch.value.trim())}"</button>
                        </div>
                    `;

          const addBtn = draftTaOfficialsOptions.querySelector(
            ".multiselect-add-btn",
          );
          if (addBtn) {
            addBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const nameToAdd = draftTaOfficialsSearch.value.trim();

              if (!nameToAdd) return;

              const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
              if (!namePattern.test(nameToAdd)) {
                alert(
                  "Only letters, spaces, hyphens, apostrophes, periods, and commas are allowed.",
                );
                return;
              }

              if (nameToAdd.length > 30) {
                alert("Official name cannot exceed 30 characters.");
                return;
              }

              const existingEmployee = headerDraftEmployeesList.find(
                (emp) => emp.name.toLowerCase() === nameToAdd.toLowerCase(),
              );
              if (existingEmployee) {
                if (
                  !headerDraftSelectedEmployees.includes(existingEmployee.name)
                ) {
                  headerDraftSelectedEmployees.push(existingEmployee.name);
                  draftTaOfficialsSearch.value = "";
                  updateDisplay();
                  renderOptions();
                }
                return;
              }

              if (!headerDraftSelectedEmployees.includes(nameToAdd)) {
                headerDraftSelectedEmployees.push(nameToAdd);
              }

              draftTaOfficialsSearch.value = "";
              updateDisplay();
              renderOptions();
            });
          }
        } else {
          draftTaOfficialsOptions.innerHTML =
            '<div class="multiselect-no-options">No officials available</div>';
        }
        return;
      }

      draftTaOfficialsOptions.innerHTML = filteredEmployees
        .map((emp) => {
          const inactiveClass =
            emp.is_active === false ? " inactive-employee" : "";
          const inactiveLabel =
            emp.is_active === false
              ? ' <span class="inactive-label">(Inactive)</span>'
              : "";
          return `<div class="multiselect-option${inactiveClass}" data-name="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}${inactiveLabel}</div>`;
        })
        .join("");

      draftTaOfficialsOptions
        .querySelectorAll(".multiselect-option")
        .forEach((option) => {
          option.addEventListener("click", (e) => {
            e.stopPropagation();
            const name = option.getAttribute("data-name");

            if (!headerDraftSelectedEmployees.includes(name)) {
              headerDraftSelectedEmployees.push(name);
              draftTaOfficialsSearch.value = "";
              updateDisplay();
              renderOptions();
            }
          });
        });
    };

    draftTaOfficialsDisplay.addEventListener("click", async (e) => {
      e.stopPropagation();
      const shouldOpen = !draftTaOfficialsDropdown.classList.contains("show");

      if (!shouldOpen) {
        closeDropdown();
        return;
      }

      draftTaOfficialsDropdown.classList.add("show");
      renderOptions();
      draftTaOfficialsSearch.focus();
    });

    draftTaOfficialsSearch.addEventListener("input", renderOptions);
    draftTaOfficialsSearch.addEventListener("click", (e) =>
      e.stopPropagation(),
    );

    // Clear All (dashboard) — clear selected header draft employees
    const dashClearAllBtn = document.getElementById('dash-panel-draft-ta-officials-clear-all');
    dashClearAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (headerDraftSelectedEmployees.length === 0) return;
      headerDraftSelectedEmployees.length = 0;
      updateDisplay();
      renderOptions();
      draftTaOfficialsSearch.focus();
    });

    document.addEventListener("click", (e) => {
      const headerPopupPanel = document.getElementById("header-popup-panel");
      const userMenuButton = document.getElementById("user-menu-btn");

      if (
        headerPopupPanel &&
        (headerPopupPanel.contains(e.target) ||
          e.target === userMenuButton ||
          userMenuButton?.contains(e.target))
      ) {
        return;
      }

      closeDropdown();
    });

    // Settings panel (dashboard header) wiring
    const createDashSettingsPanel = () => {
      if (dashSettingsPanel) return dashSettingsPanel;
      dashSettingsPanel = document.createElement('div');
      dashSettingsPanel.className = 'multiselect-settings-panel';
      dashSettingsPanel.innerHTML = `
        <div class="settings-list">
          <div class="settings-toggle-item">
            <label class="settings-toggle-label">
              <input type="checkbox" id="dash-draft-ta-ched-only-toggle" ${dashChedOnly ? 'checked' : ''}>
              <div class="settings-toggle-ui"></div>
              <div class="settings-toggle-text">
                <div>Filter CHED officials</div>
                <div class="settings-sub">Only show CHED-affiliated officials</div>
              </div>
            </label>
          </div>
        </div>`;
      draftTaOfficialsDropdown.appendChild(dashSettingsPanel);

      const toggle = dashSettingsPanel.querySelector('#dash-draft-ta-ched-only-toggle');
      toggle.addEventListener('change', () => {
        dashChedOnly = !!toggle.checked;
        localStorage.setItem('draftTaHeaderChedOnly', dashChedOnly ? '1' : '0');
        renderOptions();
      });
      return dashSettingsPanel;
    };

    dashSettingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dashSettingsPanel) createDashSettingsPanel();
      dashSettingsPanel.classList.toggle('open');
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

  const closeDraftTaModal = () => {
    if (!draftTaModal) return;
    headerDraftEmployeesMultiSelect?.closeDropdown();
    draftTaModal.classList.remove("show");
    document.body.classList.remove("header-modal-open");

    // Clear all form fields
    if (draftTaPurposeInput) draftTaPurposeInput.value = "";
    if (draftTaDestinationInput) draftTaDestinationInput.value = "";
    if (draftTaTravelTypeSelect)
      draftTaTravelTypeSelect.value = "official_business";
    if (draftTaFundingOptionSelect)
      draftTaFundingOptionSelect.value = "reimbursement";
    if (draftTaDateRequestInput) draftTaDateRequestInput.value = "";
    if (draftTaTravelDateInput) draftTaTravelDateInput.value = "";
    if (draftTaTravelEndInput) {
      draftTaTravelEndInput.value = "";
      draftTaTravelEndInput.setCustomValidity("");
    }

    // Clear selected officials
    headerDraftSelectedEmployees.length = 0;
    headerDraftEmployeesMultiSelect?.updateDisplay();
  };

  const clearDraftTaForm = () => {
    // Clear all form fields but keep modal open
    if (draftTaPurposeInput) draftTaPurposeInput.value = "";
    if (draftTaDestinationInput) draftTaDestinationInput.value = "";
    if (draftTaTravelTypeSelect)
      draftTaTravelTypeSelect.value = "official_business";
    if (draftTaFundingOptionSelect)
      draftTaFundingOptionSelect.value = "reimbursement";
    if (draftTaDateRequestInput)
      draftTaDateRequestInput.value = getTodayLocalISO();
    if (draftTaTravelDateInput) draftTaTravelDateInput.value = "";
    if (draftTaTravelEndInput) {
      draftTaTravelEndInput.value = "";
      draftTaTravelEndInput.setCustomValidity("");
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
    headerPopup.classList.remove("show");
    draftTaModal.classList.add("show");
    document.body.classList.add("header-modal-open");
    window.requestAnimationFrame(() => {
      draftTaPurposeInput?.focus();
    });
  };

  // Fetch and display user email and name
  setMessagesButtonVisibility("user");

  if (userEmailElement || userNameElement) {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user?.email) {
          if (userEmailElement) {
            userEmailElement.textContent = session.user.email;
          }

          // Fetch user's first and last name from profiles
          try {
            const { data: profile, error } = await supabase
              .from("profiles")
              .select("FName, LName, role")
              .eq("id", session.user.id)
              .maybeSingle();

            if (!error && profile) {
              noticeSenderName = `${capitalizeWords(profile.FName || "")} ${capitalizeWords(profile.LName || "")}`.trim();
              setResponsiveHeaderName(
                profile.FName,
                profile.LName,
                session.user.email.split("@")[0],
              );
              setMessagesButtonVisibility(profile.role);
            } else if (userNameElement) {
              setResponsiveHeaderName("", "", session.user.email.split("@")[0]);
              setMessagesButtonVisibility("user");
            }
          } catch (err) {
            console.error("Error fetching user name:", err);
            if (userNameElement) {
              setResponsiveHeaderName("", "", session.user.email.split("@")[0]);
            }
            setMessagesButtonVisibility("user");
          }
        } else {
          if (userEmailElement) {
            userEmailElement.textContent = "Not available";
          }
          if (userNameElement) {
            setResponsiveHeaderName("", "", "User");
          }
          setMessagesButtonVisibility("user");
        }
      })
      .catch(() => {
        if (userEmailElement) {
          userEmailElement.textContent = "Not available";
        }
        if (userNameElement) {
          setResponsiveHeaderName("", "", "User");
        }
        setMessagesButtonVisibility("user");
      });
  }

  // Toggle popup when user menu button is clicked
  if (userMenuBtn && headerPopup) {
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      noticePanel?.classList.remove("show");
      headerPopup.classList.toggle("show");
    });
  }

  if (draftTaForm) {
    draftTaForm.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  }

  if (draftTaOption) {
    draftTaOption.addEventListener("click", () => {
      noticePanel?.classList.remove("show");
      void openDraftTaModal();
    });
  }

  if (messagesBtn && noticePanel) {
    messagesBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      headerPopup.classList.remove("show");
      noticePanel.classList.toggle("show");
      if (noticePanel.classList.contains("show")) {
        void renderNoticePanel();
      } else {
        // Reset show-more state on close
        noticeListItems?.querySelectorAll(".header-notice-list-item[hidden]").forEach((li) => li.removeAttribute("hidden"));
        noticeShowMore?.toggleAttribute("hidden", true);
      }
    });
  }

  const openNoticeCompose = () => {
    noticeCompose?.removeAttribute("hidden");
    noticeActions?.toggleAttribute("hidden", true);
    noticeComposeText?.focus();
  };

  const closeNoticeCompose = () => {
    noticeCompose?.toggleAttribute("hidden", true);
    noticeActions?.toggleAttribute("hidden", false);
    if (noticeComposeText) noticeComposeText.value = "";
    if (noticeComposeSend) noticeComposeSend.disabled = false;
    if (noticeComposeCount) {
      noticeComposeCount.textContent = "0";
      noticeComposeCount.closest(".header-notice-compose-counter")?.classList.remove("over");
    }
    const checkboxes = noticeCompose?.querySelectorAll("input[name='notice-receiver']");
    checkboxes?.forEach((cb) => { cb.checked = cb.value === "users"; });
  };

  if (noticeCreateBtn) {
    noticeCreateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoticeCompose();
    });
  }

  if (noticeComposeCancel) {
    noticeComposeCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNoticeCompose();
    });
  }

  if (noticeComposeText && noticeComposeCount) {
    noticeComposeText.addEventListener("input", () => {
      const len = noticeComposeText.value.length;
      noticeComposeCount.textContent = len;
      const counter = noticeComposeCount.closest(".header-notice-compose-counter");
      counter?.classList.toggle("over", len > 1000);
      if (noticeComposeSend) noticeComposeSend.disabled = len > 1000;
    });
  }

  if (noticeComposeSend) {
    noticeComposeSend.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = noticeComposeText?.value.trim();
      if (!text || noticeComposeText.value.length > 1000) {
        noticeComposeText?.focus();
        return;
      }

      const checkedReceivers = Array.from(
        noticeCompose?.querySelectorAll("input[name='notice-receiver']:checked") || []
      ).map((cb) => cb.value);

      if (checkedReceivers.length === 0) {
        alert("Please select at least one receiver.");
        noticeComposeSend.disabled = false;
        return;
      }

      noticeComposeSend.disabled = true;

      const receiverValue = checkedReceivers.length === 2 ? "both" : checkedReceivers[0];
      const rows = [{
        message: text,
        sender: noticeSenderName || "Super User",
        receiver: receiverValue,
        is_active: true,
        created_at: new Date().toISOString(),
      }];

      const { error } = await supabase.from("notices").insert(rows);

      if (error) {
        console.error("Notice insert error:", error);
        alert(`Notice error: ${error.message || error.code || JSON.stringify(error)}`);
        noticeComposeSend.disabled = false;
        return;
      }

      closeNoticeCompose();
      void renderNoticePanel();
    });
  }

  void renderNoticePanel();

  supabase
    .channel("notices_realtime_dashboard")
    .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => {
      void renderNoticePanel();
    })
    .subscribe();

  if (draftTaCloseBtn) {
    draftTaCloseBtn.addEventListener("click", closeDraftTaModal);
  }

  if (draftTaClearBtn) {
    draftTaClearBtn.addEventListener("click", clearDraftTaForm);
  }

  if (draftTaTravelDateInput && draftTaTravelEndInput) {
    const validateTravelDates = () => {
      const travelDate = draftTaTravelDateInput.value;
      const travelEnd = draftTaTravelEndInput.value;

      if (travelDate && travelEnd && travelEnd < travelDate) {
        draftTaTravelEndInput.setCustomValidity(
          "Travel end date cannot be before travel date",
        );
      } else {
        draftTaTravelEndInput.setCustomValidity("");
      }
    };

    draftTaTravelDateInput.addEventListener("change", validateTravelDates);
    draftTaTravelEndInput.addEventListener("change", validateTravelDates);
  }

  if (draftTaCreateBtn) {
    draftTaCreateBtn.addEventListener("click", () => {
      // Validate required fields
      if (!draftTaPurposeInput?.value.trim()) {
        alert("Please enter the purpose of travel.");
        draftTaPurposeInput?.focus();
        return;
      }

      if (!draftTaDestinationInput?.value.trim()) {
        alert("Please enter the destination.");
        draftTaDestinationInput?.focus();
        return;
      }

      if (!draftTaTravelDateInput?.value) {
        alert("Please select the travel date.");
        draftTaTravelDateInput?.focus();
        return;
      }

      if (headerDraftSelectedEmployees.length === 0) {
        alert("Please select at least one official.");
        return;
      }

      // Check date validation
      const travelDate = draftTaTravelDateInput.value;
      const travelEnd = draftTaTravelEndInput?.value;
      const dateRequest = draftTaDateRequestInput?.value || getTodayLocalISO();
      const travelType = draftTaTravelTypeSelect?.value || "official_business";
      const fundingOption =
        draftTaFundingOptionSelect?.value || "reimbursement";

      if (travelDate && travelEnd && travelEnd < travelDate) {
        alert("Travel end date cannot be before travel date.");
        draftTaTravelEndInput?.focus();
        return;
      }

      // Format dates
      const formatDate = (dateStr) => {
        if (!dateStr) return "";
        const date = new Date(dateStr + "T00:00:00");
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      };

      // Prepare officials data with positions
      const officialsData = headerDraftSelectedEmployees.map((name) => {
        const cleanName = String(name || "").trim();
        const employee = headerDraftEmployeesList.find(
          (emp) => String(emp.name || "").trim() === cleanName,
        );
        return {
          name: cleanName,
          position: employee ? employee.position : "",
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
        travelEndFormatted: travelEnd ? formatDate(travelEnd) : "",
        travelEnd: travelEnd,
        officials: officialsData,
      };

      // Generate PDF
      if (window.generateTAPDF) {
        window.generateTAPDF(formData);
        closeDraftTaModal();
      } else {
        alert("PDF generator not loaded. Please refresh the page.");
      }
    });
  }

  if (draftTaModal) {
    draftTaModal.addEventListener("click", (e) => {
      if (e.target === draftTaModal) {
        closeDraftTaModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && draftTaModal?.classList.contains("show")) {
      closeDraftTaModal();
    }
  });

  // Handle settings option click
  if (settingsOption && headerPopup) {
    settingsOption.addEventListener("click", () => {
      headerPopup.classList.remove("show");
      noticePanel?.classList.remove("show");
      document.getElementById("settings-modal").classList.add("show");
    });
  }

  // Handle logout option click
  if (logoutOption && headerPopup) {
    logoutOption.addEventListener("click", async () => {
      headerPopup.classList.remove("show");
      noticePanel?.classList.remove("show");

      // Show confirmation dialog
      const confirmed = await showConfirmation(
        "Confirm Logout",
        "Are you sure you want to log out?",
      );

      if (!confirmed) {
        return; // User cancelled
      }

      try {
        await markCurrentUserOffline();
        clearDashboardClientState();
        await supabase.auth.signOut();
        window.location.href = "../index.html";
      } catch (error) {
        console.error("Logout error:", error);
        clearDashboardClientState();
        window.location.href = "../index.html";
      }
    });
  }

  // Close popup when clicking outside
  document.addEventListener("click", (e) => {
    if (
      noticePanel &&
      !noticePanel.contains(e.target) &&
      e.target !== messagesBtn &&
      !messagesBtn?.contains(e.target)
    ) {
      noticePanel.classList.remove("show");
      closeNoticeCompose();
    }

    if (
      headerPopup &&
      !headerPopup.contains(e.target) &&
      e.target !== userMenuBtn &&
      !userMenuBtn?.contains(e.target)
    ) {
      headerPopup.classList.remove("show");
    }
  });
};

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

const requireUser = async () => {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error || !sessionData?.session) {
    // No valid session - redirect to login
    console.warn("No valid session found. Redirecting to login.");
    window.location.href = "../index.html";
    return;
  }

  const user = sessionData.session.user;

  // Clear persisted table state once per new authenticated session.
  try {
    const loginMarker = `${user.id}:${sessionData.session.access_token || ""}`;
    const previousLoginMarker = sessionStorage.getItem("dashboardLoginMarker");

    if (previousLoginMarker !== loginMarker) {
      localStorage.removeItem("dashboardFilters");
      localStorage.removeItem("dashboardSort");
      sessionStorage.setItem("dashboardLoginMarker", loginMarker);
    }
  } catch (storageError) {
    console.warn(
      "Unable to reset dashboard table state for new login:",
      storageError,
    );
  }

  // Verify user role from database (not localStorage which can be manipulated)
  const role = await getUserRole(user.id);
  dashboardUserRole = role || "user";

  // If user is actually an admin, redirect to admin panel
  if (role === "admin") {
    window.location.href = "../admin/admin.html";
    return;
  }

  // Note: Access control for data operations is enforced by Supabase RLS policies.
  // Client-side checks are for UX only and should not be relied upon for security.
};

// Periodic session validation to detect session termination
// WARNING: Users can disable this in DevTools, so server-side security (RLS) is critical
const validateSession = async () => {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error || !sessionData?.session) {
    console.warn("Session expired or invalid. Redirecting to login.");
    window.location.href = "../index.html";
  }
};

// Check session every 30 seconds
setInterval(validateSession, 30000);

const taBody = document.getElementById("ta-body");
const taStatus = document.getElementById("ta-status");
const taLastUpdated = document.getElementById("ta-last-updated");
const taMoreBtn = document.getElementById("ta-lazy-sentinel");
let dashboardUserRole = "user";
let taRows = [];
let currentDisplayRows = [];
let renderedCount = 0;
const LAZY_BATCH_SIZE = 50;
let latestKnownTimestamp = null;
const currentYear = new Date().getFullYear().toString();
let activeFilters = {
  taNumber: "",
  employee: "",
  year: currentYear,
  travelDate: "",
  matchAll: true,
};
let activeSort = {
  by: "",
  order: "asc",
};
let employeesListForFilter = [];
let insightsHeightObserver = null;
let insightsHeightFrame = null;
let insightsResizeTimeout = null;
let insightsViewportSettleTimeout = null;
let insightsBreakpointQuery = null;
let agendaCalendarHeightObserver = null;
let agendaBreakpointQuery = null;
let agendaTrackerInitialized = false;
let fcCalendar = null;
let agendaCalendarSyncFrame = null;
let agendaCalendarResizeTimeout = null;
let agendaCalendarViewportSettleTimeout = null;

const openViewModalForRecord = async (record) => {
  if (!record) return;

  viewTaNumber.textContent = record.ta_number || "-";
  viewPurpose.textContent = record.purpose || "-";
  viewDestination.textContent = record.destination || "-";
  viewEmployees.textContent = record.employees || "-";
  viewTravelDate.textContent = record.travel_date || "-";
  viewTravelUntil.textContent = record.travel_until || "-";

  if (record.file_url) {
    const safeFileUrl = record.file_url;
    viewFileLink.href = safeFileUrl;
    viewFileLink.dataset.fileUrl = safeFileUrl;
    viewFileLink.dataset.fileName = record.file_name || "Open file";
    viewFileLink.textContent = record.file_name || "Open file";
    await updateViewFileSize(safeFileUrl);
  } else {
    viewFileLink.href = "#";
    viewFileLink.dataset.fileUrl = "";
    viewFileLink.dataset.fileName = "";
    viewFileLink.textContent = "No file";
    if (viewFileSize) viewFileSize.textContent = "File size: -";
  }

  viewModal.classList.add("show");
  document.body.style.overflow = "hidden";
};

const buildAgendaInfoBtn = (row) => `
  <button type="button" class="agenda-info-btn" data-ta-key="${escapeHtml(row.ta_number || "")}" aria-label="View details for ${escapeHtml(row.ta_number || "TA")}">
    <svg class="agenda-info-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 14v4.833A1.166 1.166 0 0 1 16.833 20H5.167A1.167 1.167 0 0 1 4 18.833V7.167A1.166 1.166 0 0 1 5.167 6h4.618m4.447-2H20v5.768m-7.889 2.121 7.778-7.778"/>
    </svg>
  </button>`;

const attachAgendaInfoBtnListeners = (container) => {
  container.querySelectorAll(".agenda-info-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taKey = btn.getAttribute("data-ta-key");
      const row = taRows.find((r) => r.ta_number === taKey);
      if (!row) return;
      await openViewModalForRecord(row);
    });
  });
};

const toIsoDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDateLocal = (isoDate) => {
  if (!isoDate || typeof isoDate !== "string") return null;
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const getMonthStartDate = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const formatAgendaDateLabel = (isoDate) => {
  const parsed = parseIsoDateLocal(isoDate);
  if (!parsed) return "No date selected";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatTaDateRange = (row) => {
  if (!row || !row.travel_date) return "No travel date";
  const start = formatAgendaDateLabel(row.travel_date);
  if (!row.travel_until || row.travel_until === row.travel_date) return start;
  const end = formatAgendaDateLabel(row.travel_until);
  return `${start} – ${end}`;
};

const todayLocalDate = new Date();
const agendaState = {
  selectedDateIso: toIsoDateLocal(todayLocalDate),
  activeTab: "today",
};

const recordOccursOnIsoDate = (record, isoDate) => {
  if (!record || !record.travel_date || !isoDate) return false;
  const startDate = record.travel_date;
  const endDate = record.travel_until || record.travel_date;
  return startDate <= isoDate && endDate >= isoDate;
};

const getAgendaRowsForDate = (isoDate) => {
  return taRows
    .filter((row) => recordOccursOnIsoDate(row, isoDate))
    .sort((a, b) => (a.travel_date || "").localeCompare(b.travel_date || ""));
};

const buildUpcomingAgendaBuckets = () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MAX_RANGE_DAYS = 370;
  const todayIso = toIsoDateLocal(new Date());
  const tomorrowDate = parseIsoDateLocal(todayIso);
  if (!tomorrowDate) return [];
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = toIsoDateLocal(tomorrowDate);

  const dateToRowsMap = new Map();

  taRows.forEach((row) => {
    if (!row || !row.travel_date) return;

    const startDate = parseIsoDateLocal(row.travel_date);
    const endDate = parseIsoDateLocal(row.travel_until || row.travel_date);
    if (!startDate || !endDate) return;

    const normalizedStart = startDate <= endDate ? startDate : endDate;
    const normalizedEnd = startDate <= endDate ? endDate : startDate;

    const effectiveStart =
      normalizedStart < tomorrowDate ? tomorrowDate : normalizedStart;
    if (effectiveStart > normalizedEnd) return;

    const maxEndBySafety = new Date(
      effectiveStart.getTime() + MAX_RANGE_DAYS * MS_PER_DAY,
    );
    const effectiveEnd =
      normalizedEnd > maxEndBySafety ? maxEndBySafety : normalizedEnd;

    const cursor = new Date(effectiveStart.getTime());
    while (cursor <= effectiveEnd) {
      const isoDate = toIsoDateLocal(cursor);
      if (!dateToRowsMap.has(isoDate)) {
        dateToRowsMap.set(isoDate, []);
      }
      dateToRowsMap.get(isoDate).push(row);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return Array.from(dateToRowsMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([isoDate, rows]) => ({
      isoDate,
      rows: rows.sort((a, b) =>
        (a.travel_date || "").localeCompare(b.travel_date || ""),
      ),
    }));
};

const scrollToUpcomingDateGroup = (isoDate) => {
  if (!isoDate) return;
  const target = document.querySelector(
    `[data-upcoming-date-group="${isoDate}"]`,
  );
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
};

const syncSegmentedControl = (container) => {
  if (!container) return;

  const activeButton = container.querySelector("button.active");
  const pill = container.querySelector(".segmented-switcher-pill");
  if (!activeButton || !pill) {
    container.classList.remove("is-ready");
    return;
  }

  const activeRect = activeButton.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const offsetX = activeRect.left - containerRect.left - 3.5;

  container.style.setProperty("--seg-pill-x", `${Math.max(0, offsetX)}px`);
  container.style.setProperty("--seg-pill-w", `${activeRect.width}px`);
  container.style.setProperty("--seg-pill-h", `${activeRect.height}px`);
  container.classList.add("is-ready");
};

const syncAllSegmentedControls = () => {
  document
    .querySelectorAll("[data-segmented-control]")
    .forEach((container) => syncSegmentedControl(container));
};

const renderAgendaTabs = () => {
  document.querySelectorAll(".agenda-tab-btn").forEach((btn) => {
    const isActive =
      btn.getAttribute("data-agenda-tab") === agendaState.activeTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  syncSegmentedControl(
    document.querySelector(".agenda-tabs[data-segmented-control]"),
  );
};

const updateFcBadgesAndSummary = () => {
  const calEl = document.getElementById("agenda-fc-calendar");
  if (!calEl) return;

  calEl.querySelectorAll(".fc-daygrid-day").forEach((dayEl) => {
    const isoDate = dayEl.getAttribute("data-date");
    if (!isoDate) return;

    // Remove old badge and class
    dayEl.querySelectorAll(".fc-ta-badge").forEach((b) => b.remove());
    dayEl.classList.remove("has-ta-events");

    const count = getAgendaRowsForDate(isoDate).length;
    if (count > 0) {
      dayEl.classList.add("has-ta-events");
      const frame = dayEl.querySelector(".fc-daygrid-day-frame");
      if (frame) {
        const badge = document.createElement("span");
        badge.className = "fc-ta-badge";
        badge.textContent = count;
        badge.setAttribute("aria-hidden", "true");
        frame.appendChild(badge);
      }
    }
  });
};

const buildAgendaEmptyState = (message) => `
  <div class="agenda-empty">
    <svg class="agenda-empty-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11c.889-.086 1.416-.543 2.156-1.057a22.323 22.323 0 0 0 3.958-5.084 1.6 1.6 0 0 1 .582-.628 1.549 1.549 0 0 1 1.466-.087c.205.095.388.233.537.406a1.64 1.64 0 0 1 .384 1.279l-1.388 4.114M7 11H4v6.5A1.5 1.5 0 0 0 5.5 19v0A1.5 1.5 0 0 0 7 17.5V11Zm6.5-1h4.915c.286 0 .372.014.626.15.254.135.472.332.637.572a1.874 1.874 0 0 1 .215 1.673l-2.098 6.4C17.538 19.52 17.368 20 16.12 20c-2.303 0-4.79-.943-6.67-1.475"/>
    </svg>
    <span>${escapeHtml(message)}</span>
  </div>
`;

const renderAgendaList = () => {
  const agendaList = document.getElementById("agenda-ta-list");
  const agendaTargetDate = document.getElementById("agenda-target-date");
  if (!agendaList || !agendaTargetDate) return;

  if (agendaState.activeTab === "today") {
    const viewIso = agendaState.selectedDateIso || toIsoDateLocal(new Date());
    const rows = getAgendaRowsForDate(viewIso);
    const isActualToday = viewIso === toIsoDateLocal(new Date());

    agendaTargetDate.textContent = isActualToday
      ? `Today: ${formatAgendaDateLabel(viewIso)}`
      : formatAgendaDateLabel(viewIso);

    if (!rows.length) {
      agendaList.innerHTML = buildAgendaEmptyState(
        "No travel authorities scheduled for this date.",
      );
      // clear any custom timeline height when empty
      agendaList.style.removeProperty("--agenda-line-h");
      return;
    }

    agendaList.innerHTML = rows
      .map((row) => {
        const dateLabel = formatTaDateRange(row);

        return `
                <div class="agenda-item">
                    ${buildAgendaInfoBtn(row)}
                    <span class="agenda-item-ta">${escapeHtml(row.ta_number || "-")}</span>
                    <span class="agenda-item-date">${escapeHtml(dateLabel)}</span>
                </div>
            `;
      })
      .join("");
    attachAgendaInfoBtnListeners(agendaList);
    // Make the timeline line match the full scroll height of the list content
    try {
      const cs = window.getComputedStyle(agendaList);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const lineH = Math.max(0, agendaList.scrollHeight - padTop - padBottom - 0);
      agendaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH)}px`);
    } catch (e) {}
    return;
  }

  const upcomingBuckets = buildUpcomingAgendaBuckets();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = toIsoDateLocal(tomorrowDate);

  agendaTargetDate.textContent = `Upcoming from: ${formatAgendaDateLabel(tomorrowIso)}`;

  if (!upcomingBuckets.length) {
    agendaList.innerHTML = buildAgendaEmptyState(
      "No upcoming travel authorities found.",
    );
    agendaList.style.removeProperty("--agenda-line-h");
    return;
  }

  agendaList.innerHTML = upcomingBuckets
    .map((bucket) => {
      const headerLabel = formatAgendaDateLabel(bucket.isoDate);
      const items = bucket.rows
        .map(
          (row) => `
            <div class="agenda-item agenda-item--upcoming">
                ${buildAgendaInfoBtn(row)}
                <span class="agenda-item-ta">${escapeHtml(row.ta_number || "-")}</span>
                <span class="agenda-item-date">${escapeHtml(row.travel_date ? formatTaDateRange(row) : "No travel date")}</span>
            </div>
        `,
        )
        .join("");

      return `
            <section class="agenda-date-group" data-upcoming-date-group="${bucket.isoDate}">
                <header class="agenda-date-group-header">
                    <span>${escapeHtml(headerLabel)}</span>
                </header>
                ${items}
            </section>
        `;
    })
    .join("");

  if (
    agendaState.selectedDateIso &&
    agendaState.selectedDateIso > toIsoDateLocal(new Date())
  ) {
    scrollToUpcomingDateGroup(agendaState.selectedDateIso);
  }
  attachAgendaInfoBtnListeners(agendaList);
  // After rendering, set timeline height to cover all content
  try {
    const cs2 = window.getComputedStyle(agendaList);
    const padTop2 = parseFloat(cs2.paddingTop) || 0;
    const padBottom2 = parseFloat(cs2.paddingBottom) || 0;
    const lineH2 = Math.max(0, agendaList.scrollHeight - padTop2 - padBottom2 - 0);
    agendaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH2)}px`);
  } catch (e) {}
};

const renderAgendaTracker = () => {
  if (!agendaTrackerInitialized) return;
  renderAgendaTabs();
  updateFcBadgesAndSummary();
  renderAgendaList();
  queueAgendaCalendarLayoutSync();
  queueInsightsLayoutSync();
};

const syncAgendaCalendarLayout = () => {
  if (!fcCalendar) return;

  const insightsPane = document.getElementById("tab-insights");
  const fcContainer = document.getElementById("agenda-fc-calendar");
  const calendarPanel = document.querySelector(".agenda-calendar-panel");
  const agendaListPanel = document.querySelector(".agenda-list-panel");
  if (
    !insightsPane ||
    !insightsPane.classList.contains("active") ||
    !fcContainer ||
    !calendarPanel ||
    !agendaListPanel
  ) {
    return;
  }
  // Ask FullCalendar to update, then wait for layout to settle before measuring.
  fcCalendar.updateSize();

  // Use a double requestAnimationFrame to allow FullCalendar to finish layout.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const { width } = fcContainer.getBoundingClientRect();
      const { height } = calendarPanel.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        // If measurement failed, clear any forced heights to avoid locking layout.
        if (!window.matchMedia("(min-width: 950px)").matches) {
          agendaListPanel.style.height = "";
          agendaListPanel.style.maxHeight = "";
          calendarPanel.style.height = "";
          calendarPanel.style.maxHeight = "";
        }
        return;
      }

      if (window.matchMedia("(min-width: 950px)").matches) {
        // Set both panels to the same outer height so the list can scroll internally.
        const h = Math.ceil(height);
        calendarPanel.style.height = `${h}px`;
        calendarPanel.style.maxHeight = `${h}px`;
        agendaListPanel.style.height = `${h}px`;
        agendaListPanel.style.maxHeight = `${h}px`;
        // update timeline pseudo-element height to match content scrollHeight
        try {
          const agendaTaList = document.getElementById("agenda-ta-list");
          if (agendaTaList) {
            const cs = window.getComputedStyle(agendaTaList);
            const padTop = parseFloat(cs.paddingTop) || 0;
            const padBottom = parseFloat(cs.paddingBottom) || 0;
            const lineH = Math.max(0, agendaTaList.scrollHeight - padTop - padBottom - 0);
            agendaTaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH)}px`);
          }
        } catch (e) {}
      } else {
        // On small screens, remove any forced heights so panels flow naturally.
        agendaListPanel.style.height = "";
        agendaListPanel.style.maxHeight = "";
        calendarPanel.style.height = "";
        calendarPanel.style.maxHeight = "";
        const agendaTaList = document.getElementById("agenda-ta-list");
        if (agendaTaList) agendaTaList.style.removeProperty("--agenda-line-h");
      }
    });
  });
};

const queueAgendaCalendarLayoutSync = () => {
  if (agendaCalendarSyncFrame !== null) return;
  agendaCalendarSyncFrame = window.requestAnimationFrame(() => {
    agendaCalendarSyncFrame = null;
    syncAgendaCalendarLayout();
    syncAllSegmentedControls();
  });
};

const scheduleAgendaCalendarLayoutSync = () => {
  queueAgendaCalendarLayoutSync();

  if (agendaCalendarResizeTimeout !== null) {
    window.clearTimeout(agendaCalendarResizeTimeout);
  }
  if (agendaCalendarViewportSettleTimeout !== null) {
    window.clearTimeout(agendaCalendarViewportSettleTimeout);
  }

  agendaCalendarResizeTimeout = window.setTimeout(() => {
    agendaCalendarResizeTimeout = null;
    queueAgendaCalendarLayoutSync();
  }, 180);

  agendaCalendarViewportSettleTimeout = window.setTimeout(() => {
    agendaCalendarViewportSettleTimeout = null;
    queueAgendaCalendarLayoutSync();
  }, 420);
};

const initAgendaTracker = () => {
  if (agendaTrackerInitialized) {
    renderAgendaTracker();
    return;
  }

  const fcContainer = document.getElementById("agenda-fc-calendar");
  if (!fcContainer) return;

  agendaTrackerInitialized = true;

  fcCalendar = new FullCalendar.Calendar(fcContainer, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "title",
      center: "",
      right: "prev,next",
    },
    height: "auto",
    fixedWeekCount: true,
    showNonCurrentDates: true,
    events: [],
    datesSet: () => {
      updateFcBadgesAndSummary();
    },
    dateClick: (info) => {
      document
        .querySelectorAll("#agenda-fc-calendar .fc-day-selected")
        .forEach((el) => el.classList.remove("fc-day-selected"));
      info.dayEl.classList.add("fc-day-selected");
      agendaState.selectedDateIso = info.dateStr;
      agendaState.activeTab = "today";
      renderAgendaTabs();
      renderAgendaList();
      queueInsightsLayoutSync();
    },
  });

  fcCalendar.render();
  scheduleAgendaCalendarLayoutSync();

  // Observe calendar panel size changes to keep the agenda list height in sync
  try {
    const calendarPanel = document.querySelector(".agenda-calendar-panel");
    if (calendarPanel && typeof ResizeObserver !== "undefined") {
      if (agendaCalendarHeightObserver) agendaCalendarHeightObserver.disconnect();
      agendaCalendarHeightObserver = new ResizeObserver(() => {
        queueAgendaCalendarLayoutSync();
      });
      agendaCalendarHeightObserver.observe(calendarPanel);
    }

    // Re-sync when breakpoint crosses (desktop <-> mobile)
    if (typeof window !== "undefined") {
      if (agendaBreakpointQuery) {
        try { agendaBreakpointQuery.removeEventListener('change', scheduleAgendaCalendarLayoutSync); } catch (e) {}
      }
      agendaBreakpointQuery = window.matchMedia("(min-width: 950px)");
      if (agendaBreakpointQuery.addEventListener) {
        agendaBreakpointQuery.addEventListener("change", scheduleAgendaCalendarLayoutSync);
      } else if (agendaBreakpointQuery.addListener) {
        agendaBreakpointQuery.addListener(scheduleAgendaCalendarLayoutSync);
      }
    }
  } catch (err) {
    // noop if ResizeObserver not supported or other failures
  }

  // Mark today as selected on init
  const todayEl = fcContainer.querySelector(".fc-day-today");
  if (todayEl) todayEl.classList.add("fc-day-selected");

  document.querySelectorAll(".agenda-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-agenda-tab");
      if (!tabName) return;
      agendaState.activeTab = tabName;
      if (tabName === "today") {
        agendaState.selectedDateIso = toIsoDateLocal(new Date());
        fcCalendar.today();
        // Highlight today
        document
          .querySelectorAll("#agenda-fc-calendar .fc-day-selected")
          .forEach((el) => el.classList.remove("fc-day-selected"));
        const todayDayEl = fcContainer.querySelector(".fc-day-today");
        if (todayDayEl) todayDayEl.classList.add("fc-day-selected");
      }
      renderAgendaTabs();
      renderAgendaList();
    });
  });

  renderAgendaList();
};

const syncInsightsLayout = () => {
  const leftColumn = document.querySelector(".insights-left-col");
  const officialsCard = document.querySelector(".insight-card-os");
  const officialsListWrap = officialsCard?.querySelector(".os-list-wrap");
  const officialsHeading = officialsCard?.querySelector(
    ".insight-card-heading",
  );
  const insightsPane = document.getElementById("tab-insights");
  if (!leftColumn || !officialsCard) return;

  if (window.matchMedia("(max-width: 950px)").matches) {
    officialsCard.style.height = "";
    if (officialsListWrap) {
      officialsListWrap.style.height = "";
      officialsListWrap.style.maxHeight = "";
    }
    return;
  }

  if (!insightsPane || !insightsPane.classList.contains("active")) {
    return;
  }

  const leftCards = leftColumn.querySelectorAll(".insight-card");
  const leftStyles = window.getComputedStyle(leftColumn);
  const leftGap = parseFloat(leftStyles.rowGap || leftStyles.gap) || 0;
  const naturalLeftHeight = leftCards.length
    ? Array.from(leftCards).reduce(
        (total, card) => total + Math.ceil(card.getBoundingClientRect().height),
        0,
      ) +
      Math.max(0, leftCards.length - 1) * leftGap
    : Math.ceil(leftColumn.getBoundingClientRect().height);

  if (naturalLeftHeight > 0) {
    const cardHeight = naturalLeftHeight;
    officialsCard.style.height = `${cardHeight}px`;

    if (officialsListWrap) {
      const cardStyles = window.getComputedStyle(officialsCard);
      const paddingTop = parseFloat(cardStyles.paddingTop) || 0;
      const paddingBottom = parseFloat(cardStyles.paddingBottom) || 0;
      const headingHeight = officialsHeading
        ? Math.ceil(officialsHeading.getBoundingClientRect().height)
        : 0;
      const reservedSpace = Math.ceil(
        paddingTop + paddingBottom + headingHeight + 12,
      );
      const desktopListHeight = Math.max(140, cardHeight - reservedSpace);
      officialsListWrap.style.height = `${desktopListHeight}px`;
      officialsListWrap.style.maxHeight = `${desktopListHeight}px`;
    }
  }
};

const queueInsightsLayoutSync = () => {
  if (insightsHeightFrame !== null) return;
  insightsHeightFrame = window.requestAnimationFrame(() => {
    insightsHeightFrame = null;
    syncInsightsLayout();
  });
};

const scheduleInsightsLayoutSync = () => {
  queueInsightsLayoutSync();
  queueAgendaCalendarLayoutSync();
  syncAllSegmentedControls();

  if (insightsResizeTimeout !== null) {
    window.clearTimeout(insightsResizeTimeout);
  }
  if (insightsViewportSettleTimeout !== null) {
    window.clearTimeout(insightsViewportSettleTimeout);
  }

  insightsResizeTimeout = window.setTimeout(() => {
    insightsResizeTimeout = null;
    queueInsightsLayoutSync();
    queueAgendaCalendarLayoutSync();
    syncAllSegmentedControls();
  }, 180);

  insightsViewportSettleTimeout = window.setTimeout(() => {
    insightsViewportSettleTimeout = null;
    queueInsightsLayoutSync();
    queueAgendaCalendarLayoutSync();
    syncAllSegmentedControls();
  }, 420);
};

const initInsightsLayoutSync = () => {
  const leftColumn = document.querySelector(".insights-left-col");
  if (!leftColumn) return;

  if (insightsHeightObserver) {
    insightsHeightObserver.disconnect();
  }

  if ("ResizeObserver" in window) {
    insightsHeightObserver = new ResizeObserver(() => {
      queueInsightsLayoutSync();
    });
    insightsHeightObserver.observe(leftColumn);
  }

  insightsBreakpointQuery = window.matchMedia("(max-width: 950px)");
  if (typeof insightsBreakpointQuery.addEventListener === "function") {
    insightsBreakpointQuery.addEventListener(
      "change",
      scheduleInsightsLayoutSync,
    );
  } else if (typeof insightsBreakpointQuery.addListener === "function") {
    insightsBreakpointQuery.addListener(scheduleInsightsLayoutSync);
  }

  window.addEventListener("resize", scheduleInsightsLayoutSync);
  window.addEventListener("load", queueInsightsLayoutSync);
  queueInsightsLayoutSync();
};

// Helper functions for localStorage persistence
const saveFiltersToStorage = () => {
  localStorage.setItem("dashboardFilters", JSON.stringify(activeFilters));
};

const loadFiltersFromStorage = () => {
  const saved = localStorage.getItem("dashboardFilters");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      activeFilters = { ...activeFilters, ...parsed };
    } catch (e) {
      console.error("Failed to parse saved filters:", e);
    }
  }
};

const saveSortToStorage = () => {
  localStorage.setItem("dashboardSort", JSON.stringify(activeSort));
};

const loadSortFromStorage = () => {
  const saved = localStorage.getItem("dashboardSort");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      activeSort = { ...activeSort, ...parsed };
    } catch (e) {
      console.error("Failed to parse saved sort:", e);
    }
  }
};

const updateButtonStates = () => {
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const sortToggleBtn = document.getElementById("sort-toggle-btn");
  // Check if filters are active (not default)
  const isFilterActive =
    activeFilters.taNumber ||
    activeFilters.employee ||
    (activeFilters.year &&
      activeFilters.year !== new Date().getFullYear().toString()) ||
    activeFilters.travelDate ||
    activeFilters.matchAll === false;

  // Check if sort is active
  const isSortActive = activeSort.by !== "";

  if (filterToggleBtn) {
    if (isFilterActive) {
      filterToggleBtn.classList.add("active");
    } else {
      filterToggleBtn.classList.remove("active");
    }
  }

  if (sortToggleBtn) {
    if (isSortActive) {
      sortToggleBtn.classList.add("active");
    } else {
      sortToggleBtn.classList.remove("active");
    }
  }
};

const toast = document.getElementById("toast");
let toastTimer = null;
const showToast = (message, type = "info", duration = 3500) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove(
    "toast--success",
    "toast--info",
    "toast--warning",
    "toast--error",
  );
  toast.classList.add(`toast--${type}`, "show");
  if (toastTimer) clearTimeout(toastTimer);
  if (duration > 0)
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
};

const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

const safeUrl = (url) => {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
  } catch (e) {}
  return "#";
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "File size: -";
  if (bytes < 1024) return `File size: ${bytes} B`;
  if (bytes < 1024 * 1024) return `File size: ${(bytes / 1024).toFixed(1)} KB`;
  return `File size: ${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fileSizeCache = new Map();

const fetchFileSizeBytes = async (url) => {
  if (!url || url === "#") return null;
  if (fileSizeCache.has(url)) return fileSizeCache.get(url);

  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });
    const contentLength = headResponse.headers.get("content-length");
    const headSize = Number(contentLength);
    if (headResponse.ok && Number.isFinite(headSize) && headSize > 0) {
      fileSizeCache.set(url, headSize);
      return headSize;
    }
  } catch (error) {
    console.warn("HEAD size lookup failed:", error);
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const size = blob.size;
    if (Number.isFinite(size) && size > 0) {
      fileSizeCache.set(url, size);
      return size;
    }
  } catch (error) {
    console.warn("Blob size lookup failed:", error);
  }

  return null;
};

const formatFileLabel = (_value) => "Download";

const isGzipFileLink = (fileUrl, fileName = "") => {
  const fromUrl = /\.gz(?:$|[?#])/i.test(String(fileUrl || ""));
  const fromName = /\.gz$/i.test(String(fileName || ""));
  return fromUrl || fromName;
};

const getReconstructedMimeType = (fileName = "") => {
  const lower = String(fileName).toLowerCase().replace(/\.gz$/, "");
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

const setFileLinkLoading = (linkEl, loading) => {
  if (!(linkEl instanceof HTMLElement)) return;

  if (loading) {
    if (linkEl.dataset.loading === "true") return;
    linkEl.dataset.loading = "true";
    linkEl.dataset.originalLabel = linkEl.innerHTML;
    linkEl.dataset.originalWidth = linkEl.style.width || "";
    linkEl.dataset.originalHeight = linkEl.style.height || "";
    linkEl.style.width = `${linkEl.offsetWidth}px`;
    linkEl.style.height = `${linkEl.offsetHeight}px`;
    linkEl.classList.add("is-loading");
    linkEl.setAttribute("aria-busy", "true");
    linkEl.innerHTML =
      '<dotlottie-wc class="file-link-lottie" src="../assets/load.lottie" autoplay loop></dotlottie-wc>';
    return;
  }

  if (linkEl.dataset.loading !== "true") return;
  linkEl.classList.remove("is-loading");
  linkEl.removeAttribute("aria-busy");
  linkEl.innerHTML = linkEl.dataset.originalLabel || "Download";
  linkEl.style.width = linkEl.dataset.originalWidth || "";
  linkEl.style.height = linkEl.dataset.originalHeight || "";
  delete linkEl.dataset.loading;
  delete linkEl.dataset.originalLabel;
  delete linkEl.dataset.originalWidth;
  delete linkEl.dataset.originalHeight;
};

const openStoredFile = async (fileUrl, fileName = "", triggerEl = null) => {
  const safeFileUrl = safeUrl(fileUrl);
  if (safeFileUrl === "#") return;

  setFileLinkLoading(triggerEl, true);

  try {
    // Check if browser supports DecompressionStream (most modern desktop browsers)
    const supportsDecompression = typeof DecompressionStream === "function";
    const isCompressed = isGzipFileLink(safeFileUrl, fileName);

    // If compressed and browser supports decompression, decompress before opening
    if (isCompressed && supportsDecompression) {
      try {
        const response = await fetch(safeFileUrl, { cache: "no-store" });
        if (!response.ok || !response.body) {
          throw new Error(`Download failed (${response.status})`);
        }

        const decompressedStream = response.body.pipeThrough(
          new DecompressionStream("gzip"),
        );
        const decompressedBlob = await new Response(decompressedStream).blob();
        const mimeType = getReconstructedMimeType(fileName);
        const rebuiltBlob = new Blob([decompressedBlob], { type: mimeType });

        const objectUrl = URL.createObjectURL(rebuiltBlob);
        window.open(objectUrl, "_blank", "noopener");

        setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
        return;
      } catch (error) {
        console.error("Failed to decompress file:", error);
        // Fall through to opening the URL directly
      }
    }

    // For non-compressed files or when decompression not supported/failed:
    // Open the file URL in a new tab
    window.open(safeFileUrl, "_blank", "noopener");
  } finally {
    setFileLinkLoading(triggerEl, false);
  }
};
const viewModal = document.getElementById("view-modal");
const closeViewBtn = document.getElementById("close-view");
const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const cancelConfirmBtn = document.getElementById("cancel-confirm");
const confirmConfirmBtn = document.getElementById("confirm-confirm");
const viewTaNumber = document.getElementById("view-ta-number");
const viewPurpose = document.getElementById("view-purpose");
const viewDestination = document.getElementById("view-destination");
const viewEmployees = document.getElementById("view-employees");
const viewTravelDate = document.getElementById("view-travel-date");
const viewTravelUntil = document.getElementById("view-travel-until");
const viewFileLink = document.getElementById("view-file-link");
const viewFileSize = document.getElementById("view-file-size");

const updateViewFileSize = async (fileUrl) => {
  if (!viewFileSize) return;
  if (!fileUrl || fileUrl === "#") {
    viewFileSize.textContent = "File size: -";
    return;
  }

  viewFileSize.textContent = "File size: Loading...";
  const expectedUrl = fileUrl;
  const size = await fetchFileSizeBytes(fileUrl);

  if (
    (viewFileLink.dataset.fileUrl ||
      viewFileLink.getAttribute("href") ||
      "") !== expectedUrl
  ) {
    return;
  }

  viewFileSize.textContent = size
    ? formatFileSize(size)
    : "File size: Unavailable";
};

const applyClientFilters = (rows) => {
  // If no filters are active, return all rows
  if (
    !activeFilters.taNumber &&
    !activeFilters.employee &&
    !activeFilters.year &&
    !activeFilters.travelDate
  ) {
    return rows;
  }

  return rows.filter((row) => {
    const checks = [];

    // Check TA Number filter
    if (activeFilters.taNumber) {
      const matchesTa =
        row.ta_number &&
        row.ta_number
          .toLowerCase()
          .includes(activeFilters.taNumber.toLowerCase());
      checks.push(matchesTa);
    }

    // Check Employee filter (contains match for comma-separated values)
    if (activeFilters.employee) {
      const matchesEmployee =
        row.employees &&
        row.employees
          .toLowerCase()
          .includes(activeFilters.employee.toLowerCase());
      checks.push(matchesEmployee);
    }

    // Check Year filter
    if (activeFilters.year) {
      const matchesYear =
        row.travel_date && row.travel_date.startsWith(activeFilters.year);
      checks.push(matchesYear);
    }

    // Check Travel Date filter
    if (activeFilters.travelDate) {
      const matchesDate =
        row.travel_date && row.travel_date === activeFilters.travelDate;
      checks.push(matchesDate);
    }

    // Return based on match mode (AND or OR)
    if (activeFilters.matchAll) {
      // AND: all filters must match
      return checks.every((check) => check === true);
    } else {
      // OR: at least one filter must match
      return checks.some((check) => check === true);
    }
  });
};

const applyClientSorting = (rows) => {
  if (!activeSort.by) {
    return rows;
  }

  const sorted = [...rows].sort((a, b) => {
    let aVal, bVal;

    if (activeSort.by === "ta") {
      aVal = a.ta_number || "";
      bVal = b.ta_number || "";
    } else if (activeSort.by === "travel-date") {
      aVal = a.travel_date || "";
      bVal = b.travel_date || "";
    }

    if (activeSort.order === "asc") {
      return aVal.localeCompare(bVal);
    } else {
      return bVal.localeCompare(aVal);
    }
  });

  return sorted;
};

const buildDashRowHtml = (row, globalIndex, batchIndex) => {
  const shouldAnimateRows =
    dashboardUserRole === "user" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const dateText = row.travel_date
    ? new Date(row.travel_date).toLocaleDateString()
    : "-";
  const untilText = row.travel_until
    ? new Date(row.travel_until).toLocaleDateString()
    : "-";
  const fileUrl = safeUrl(row.file_url);
  const safeName = row.file_name || "Download";
  const displayName = formatFileLabel(safeName);
  const hasFile = !!row.file_url;

  let employeesText = row.employees || "-";
  if (employeesText !== "-") {
    const employeeArray = employeesText.split(",").map((e) => e.trim());
    if (employeeArray.length > 2) {
      employeesText = employeeArray.slice(0, 2).join(", ") + "...";
    }
  }

  const animDelay = Math.min(batchIndex * 22, 220);
  const rowAnimationAttrs = shouldAnimateRows
    ? ` class="row-enter" style="--row-enter-delay:${animDelay}ms;"`
    : "";

  return `
            <tr${rowAnimationAttrs}>
                <td>
                    <button class="view-btn icon-btn" data-index="${globalIndex}" aria-label="View details">
                        <svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true" focusable="false">
                            <path d="M8 4H4m0 0v4m0-4 5 5m7-5h4m0 0v4m0-4-5 5M8 20H4m0 0v-4m0 4 5-5m7 5h4m0 0v-4m0 4-5-5"/>
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
                    ${
                      hasFile
                        ? `<a class="file-link row-file-link" href="${fileUrl}" data-file-url="${fileUrl}" data-file-name="${escapeHtml(safeName)}" target="_blank" rel="noopener">${escapeHtml(displayName)}</a>`
                        : `<span class="file-not-ready">Unavailable</span>`
                    }
                </td>
            </tr>
        `;
};

const bindDashRowEvents = (trs) => {
  trs.forEach((tr) => {
    const fileLink = tr.querySelector(".row-file-link");
    if (fileLink) {
      fileLink.addEventListener("click", async (e) => {
        e.preventDefault();
        const url =
          fileLink.getAttribute("data-file-url") ||
          fileLink.getAttribute("href") ||
          "";
        const name =
          fileLink.getAttribute("data-file-name") ||
          fileLink.textContent ||
          "Open file";
        if (!url || url === "#") return;
        await openStoredFile(url, name, fileLink);
      });
    }
    const viewBtn = tr.querySelector(".view-btn");
    if (viewBtn) {
      viewBtn.addEventListener("click", (e) => {
        const index = Number(e.currentTarget.getAttribute("data-index"));
        const record = currentDisplayRows[index];
        if (!record) return;

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
          viewFileLink.dataset.fileName = record.file_name || "Open file";
          viewFileLink.textContent = record.file_name || "Open file";
          updateViewFileSize(safeFileUrl);
        } else {
          viewFileLink.href = "#";
          viewFileLink.dataset.fileUrl = "";
          viewFileLink.dataset.fileName = "";
          viewFileLink.textContent = "No file";
          if (viewFileSize) viewFileSize.textContent = "File size: -";
        }

        viewModal.classList.add("show");
        document.body.style.overflow = "hidden";
      });
    }
  });
};

const renderRows = (rows) => {
  const filteredRows = applyClientFilters(rows);
  currentDisplayRows = applyClientSorting(filteredRows);
  renderedCount = Math.min(LAZY_BATCH_SIZE, currentDisplayRows.length);

  if (!currentDisplayRows.length) {
    taBody.innerHTML =
      '<tr><td colspan="8">No records match the current filters.</td></tr>';
    if (taMoreBtn) taMoreBtn.style.display = "none";
    return;
  }

  taBody.innerHTML = currentDisplayRows
    .slice(0, renderedCount)
    .map((row, i) => buildDashRowHtml(row, i, i))
    .join("");
  bindDashRowEvents(Array.from(taBody.querySelectorAll("tr")));
  if (taMoreBtn)
    taMoreBtn.style.display =
      renderedCount < currentDisplayRows.length ? "flex" : "none";
};

const loadMoreDashRows = () => {
  if (renderedCount >= currentDisplayRows.length) return;
  const from = renderedCount;
  const to = Math.min(renderedCount + LAZY_BATCH_SIZE, currentDisplayRows.length);
  const temp = document.createElement("tbody");
  temp.innerHTML = currentDisplayRows
    .slice(from, to)
    .map((row, batchIdx) => buildDashRowHtml(row, from + batchIdx, batchIdx))
    .join("");
  const newTrs = Array.from(temp.querySelectorAll("tr"));
  newTrs.forEach((tr) => taBody.appendChild(tr));
  bindDashRowEvents(newTrs);
  renderedCount = to;
  updateTaFooter();
  if (taMoreBtn)
    taMoreBtn.style.display =
      renderedCount < currentDisplayRows.length ? "flex" : "none";
};

const updateTaFooter = () => {
  const totalFiltered = currentDisplayRows.length;
  const hasActiveFilters =
    activeFilters.taNumber ||
    activeFilters.employee ||
    activeFilters.year ||
    activeFilters.travelDate;

  if (!taRows.length) {
    taStatus.textContent = "No records yet.";
  } else if (!totalFiltered) {
    taStatus.textContent = "No records match the current filters.";
  } else if (renderedCount < totalFiltered) {
    taStatus.textContent = hasActiveFilters
      ? `Showing ${renderedCount} of ${totalFiltered} filtered record${totalFiltered === 1 ? "" : "s"} (${taRows.length} total). Scroll for more.`
      : `Showing ${renderedCount} of ${totalFiltered} record${totalFiltered === 1 ? "" : "s"}. Scroll for more.`;
  } else if (hasActiveFilters) {
    taStatus.textContent = `Showing ${totalFiltered} of ${taRows.length} record${taRows.length === 1 ? "" : "s"} (filtered).`;
  } else {
    taStatus.textContent = `Loaded ${taRows.length} record${taRows.length === 1 ? "" : "s"}.`;
  }
};

const loadTravelAuthorities = async (reset = false) => {
  if (reset) {
    taRows = [];
    taBody.innerHTML = '<tr><td colspan="7">Loading records...</td></tr>';
  }

  taStatus.textContent = "Fetching travel authorities.";
  try {
    const { data, error } = await supabase
      .from("travel_authorities")
      .select(
        "ta_number, purpose, destination, employees, travel_date, travel_until, file_name, file_url, created_at, is_demo",
      )
      .eq("is_demo", false)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    taRows = data || [];
    latestKnownTimestamp = taRows[0]?.created_at || latestKnownTimestamp;
    if (taLastUpdated && latestKnownTimestamp) {
      const diff = Date.now() - new Date(latestKnownTimestamp).getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      const rel =
        mins < 1
          ? "just now"
          : mins < 60
            ? `${mins}m ago`
            : hrs < 24
              ? `${hrs}h ago`
              : days === 1
                ? "yesterday"
                : `${days} days ago`;
      taLastUpdated.textContent = `Last record added ${rel}`;
    }
    renderRows(taRows);
    renderAgendaTracker();
    updateTaFooter();
    await populateYearFilter();
  } catch (error) {
    console.error("Dashboard load error:", error);
    taBody.innerHTML = '<tr><td colspan="7">Unable to load records.</td></tr>';
    taStatus.textContent = "Failed to load travel authorities.";
  }
};
// Infinite scroll: auto-load more rows when sentinel scrolls into view
if (taMoreBtn) {
  const dashTableWrap = document.querySelector("#ta-panel .table-wrap");
  const dashLazyObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadMoreDashRows();
    },
    { threshold: 0.1, root: dashTableWrap },
  );
  dashLazyObserver.observe(taMoreBtn);
}

// Fade scrollbar in on scroll, fade out after idle
(function () {
  const wrap = document.querySelector("#ta-panel .table-wrap");
  if (!wrap) return;
  let fadeTimer;
  wrap.addEventListener(
    "scroll",
    () => {
      wrap.classList.add("is-scrolling");
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => wrap.classList.remove("is-scrolling"), 1000);
    },
    { passive: true },
  );
})();

closeViewBtn.addEventListener("click", () => {
  viewModal.classList.remove("show");
  document.body.style.overflow = "";
});

viewModal.addEventListener("click", (e) => {
  if (e.target === viewModal) {
    viewModal.classList.remove("show");
    document.body.style.overflow = "";
  }
});

viewFileLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const fileUrl =
    viewFileLink.dataset.fileUrl || viewFileLink.getAttribute("href") || "";
  const fileName =
    viewFileLink.dataset.fileName || viewFileLink.textContent || "Open file";
  if (!fileUrl || fileUrl === "#") return;
  await openStoredFile(fileUrl, fileName, viewFileLink);
});

// Filter panel functionality
const filterToggleBtn = document.getElementById("filter-toggle-btn");
const refreshTableBtn = document.getElementById("refresh-table-btn");
const filterPanel = document.getElementById("filter-panel");
const applyFilterBtn = document.getElementById("apply-filter-btn");
const clearFilterBtn = document.getElementById("clear-filter-btn");
const filterTaNumberInput = document.getElementById("ta-number-search");
const filterEmployeeInput = document.getElementById("filter-employee");
const filterYearSelect = document.getElementById("filter-year");
const filterTravelDateInput = document.getElementById("filter-travel-date");
const filterMatchAllCheckbox = document.getElementById("filter-match-all");

// Refresh table manually
if (refreshTableBtn) {
  refreshTableBtn.addEventListener("click", () => {
    refreshTableBtn.classList.remove("has-new-data");
    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.remove("show");
    loadTravelAuthorities(true);
  });
}

// Load employees for filter
const loadEmployeesForFilter = async () => {
  try {
    const { data, error } = await supabase
      .from("employee_list")
      .select("name, is_active")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw error;
    employeesListForFilter = data ? data : [];
  } catch (error) {
    console.error("Failed to load employees for filter:", error);
    employeesListForFilter = [];
  }
};

// Realtime subscription for employee_list changes in dashboard
let dashboardEmployeeRealtimeChannel = null;
const setupDashboardEmployeeRealtimeSubscription = () => {
  // Clean up existing subscription if any
  if (dashboardEmployeeRealtimeChannel) {
    supabase.removeChannel(dashboardEmployeeRealtimeChannel);
  }

  // Subscribe to changes on employee_list table
  dashboardEmployeeRealtimeChannel = supabase
    .channel("employee_list_dashboard_changes")
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to all events
        schema: "public",
        table: "employee_list",
      },
      (payload) => {
        // Silently refresh the employee filter dropdown
        loadEmployeesForFilter();
      },
    )
    .subscribe((status) => {});
};

// Initialize employee realtime subscription
setupDashboardEmployeeRealtimeSubscription();

// Filter official autocomplete
const filterEmployeeDropdown = document.getElementById(
  "filter-employee-autocomplete",
);

const setFilterEmpDropdownVisible = (visible) => {
  if (filterEmployeeDropdown)
    filterEmployeeDropdown.style.display = visible ? "block" : "none";
};

const showFilterEmpSuggestions = (inputValue) => {
  if (!filterEmployeeDropdown) return;
  const trimmed = inputValue.toLowerCase().trim();
  if (!trimmed) {
    setFilterEmpDropdownVisible(false);
    return;
  }

  const matches = employeesListForFilter
    .filter((emp) => emp.name.toLowerCase().includes(trimmed))
    .slice(0, 10);

  if (matches.length === 0) {
    filterEmployeeDropdown.innerHTML =
      '<div class="autocomplete-no-options">No officials found</div>';
    setFilterEmpDropdownVisible(true);
    return;
  }

  filterEmployeeDropdown.innerHTML = matches
    .map((emp, i) => {
      const badge =
        emp.is_active === false
          ? ' <span class="inactive-badge">Inactive</span>'
          : "";
      return `<div class="autocomplete-item" data-value="${escapeHtml(emp.name)}" data-index="${i}">${escapeHtml(emp.name)}${badge}</div>`;
    })
    .join("");
  setFilterEmpDropdownVisible(true);

  filterEmployeeDropdown
    .querySelectorAll(".autocomplete-item")
    .forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        filterEmployeeInput.value = item.getAttribute("data-value");
        setFilterEmpDropdownVisible(false);
      });
      item.addEventListener("mouseenter", () => {
        filterEmployeeDropdown
          .querySelectorAll(".autocomplete-item")
          .forEach((i) => i.classList.remove("highlighted"));
        item.classList.add("highlighted");
      });
    });
};

if (filterEmployeeInput) {
  filterEmployeeInput.addEventListener("input", () =>
    showFilterEmpSuggestions(filterEmployeeInput.value),
  );
  filterEmployeeInput.addEventListener("focus", () => {
    if (filterEmployeeInput.value.length > 0)
      showFilterEmpSuggestions(filterEmployeeInput.value);
  });
  filterEmployeeInput.addEventListener("keydown", (e) => {
    const items = filterEmployeeDropdown
      ? filterEmployeeDropdown.querySelectorAll(".autocomplete-item")
      : [];
    if (!items.length) return;
    const highlighted = filterEmployeeDropdown.querySelector(
      ".autocomplete-item.highlighted",
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!highlighted) {
        items[0].classList.add("highlighted");
      } else {
        const next = Array.from(items).indexOf(highlighted) + 1;
        if (next < items.length) {
          highlighted.classList.remove("highlighted");
          items[next].classList.add("highlighted");
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (highlighted) {
        const prev = Array.from(items).indexOf(highlighted) - 1;
        highlighted.classList.remove("highlighted");
        if (prev >= 0) items[prev].classList.add("highlighted");
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted) {
        filterEmployeeInput.value = highlighted.getAttribute("data-value");
        setFilterEmpDropdownVisible(false);
      }
    } else if (e.key === "Escape") {
      setFilterEmpDropdownVisible(false);
    }
  });
}

// Button state updates only on Apply/Clear — no live UI listeners here

document.addEventListener("click", (e) => {
  if (
    filterEmployeeDropdown &&
    !filterEmployeeDropdown.contains(e.target) &&
    e.target !== filterEmployeeInput
  ) {
    setFilterEmpDropdownVisible(false);
  }
});

// Populate year filter from available data
const populateYearFilter = async () => {
  try {
    // Get all unique years from database
    const { data, error } = await supabase
      .from("travel_authorities")
      .select("travel_date");

    if (error) throw error;

    const years = new Set();
    data.forEach((row) => {
      if (row.travel_date) {
        const year = row.travel_date.substring(0, 4);
        if (year && year.length === 4) {
          years.add(year);
        }
      }
    });

    const sortedYears = Array.from(years).sort((a, b) => b - a);
    filterYearSelect.innerHTML =
      '<option value="">All Years</option>' +
      sortedYears
        .map(
          (year) =>
            `<option value="${escapeHtml(year)}"${year === currentYear ? " selected" : ""}>${escapeHtml(year)}</option>`,
        )
        .join("");
  } catch (error) {
    console.error("Error populating year filter:", error);
  }
};

// Auto-dash formatting for TA Number filter
const formatTaNumber = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 4);
  const part2 = digits.slice(4, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length <= 4) return part1;
  if (digits.length <= 6) return `${part1}-${part2}`;
  return `${part1}-${part2}-${part3}`;
};

filterTaNumberInput.addEventListener("input", () => {
  const formatted = formatTaNumber(filterTaNumberInput.value);
  filterTaNumberInput.value = formatted;
  const isComplete = /^\d{4}-\d{2}-\d{4}$/.test(formatted);
  if (!isComplete && formatted !== "") return; // partial — wait for more digits
  if (formatted === (activeFilters.taNumber || "")) return; // no effective change
  filterTaNumberInput.classList.toggle("is-matched", isComplete);
  activeFilters.taNumber = formatted;
  saveFiltersToStorage();
  renderRows(taRows);
  updateTaFooter();
  updateButtonStates();
});

// Initialize flatpickr for date filter
window.flatpickr(filterTravelDateInput, {
  dateFormat: "Y-m-d",
  allowInput: true,
  disableMobile: true,
  static: false,
  monthSelectorType: "static",
  position: "auto center",
  onChange: function (selectedDates, dateStr) {
    // Auto-sync year filter when date is selected
    if (dateStr && dateStr.length >= 4) {
      const selectedYear = dateStr.substring(0, 4);
      // Check if this year exists in the dropdown
      const yearOption = Array.from(filterYearSelect.options).find(
        (opt) => opt.value === selectedYear,
      );
      if (yearOption) {
        filterYearSelect.value = selectedYear;
      } else {
        // Year not available in records, set to "No selection"
        filterYearSelect.value = "";
      }
    }
  },
});

filterToggleBtn.addEventListener("click", () => {
  filterPanel.classList.toggle("show");
  if (!filterPanel.classList.contains("show"))
    setFilterEmpDropdownVisible(false);
});

applyFilterBtn.addEventListener("click", () => {
  activeFilters.employee = filterEmployeeInput.value.trim();
  activeFilters.year = filterYearSelect.value;
  activeFilters.travelDate = filterTravelDateInput.value;
  activeFilters.matchAll = filterMatchAllCheckbox.checked;
  saveFiltersToStorage();
  updateButtonStates();
  renderRows(taRows);
  updateTaFooter();
  filterPanel.classList.remove("show");
});

clearFilterBtn.addEventListener("click", () => {
  activeFilters.taNumber = "";
  activeFilters.employee = "";
  activeFilters.year = "";
  activeFilters.travelDate = "";
  activeFilters.matchAll = true;
  filterTaNumberInput.value = "";
  filterTaNumberInput.classList.remove("is-matched");
  filterEmployeeInput.value = "";
  setFilterEmpDropdownVisible(false);
  filterYearSelect.value = "";
  filterTravelDateInput.value = "";
  filterMatchAllCheckbox.checked = true;
  saveFiltersToStorage();
  updateButtonStates();
  renderRows(taRows);
  updateTaFooter();
});

// Sort panel functionality
const sortToggleBtn = document.getElementById("sort-toggle-btn");
const sortPanel = document.getElementById("sort-panel");
const applySortBtn = document.getElementById("apply-sort-btn");
const clearSortBtn = document.getElementById("clear-sort-btn");
const sortBySelect = document.getElementById("sort-by");
const sortOrderSelect = document.getElementById("sort-order");

sortToggleBtn.addEventListener("click", () => {
  sortPanel.classList.toggle("show");
});

applySortBtn.addEventListener("click", () => {
  activeSort.by = sortBySelect.value;
  activeSort.order = sortOrderSelect.value;
  saveSortToStorage();
  updateButtonStates();
  renderRows(taRows);
  updateTaFooter();
  sortPanel.classList.remove("show");
});

clearSortBtn.addEventListener("click", () => {
  activeSort.by = "";
  activeSort.order = "asc";
  sortBySelect.value = "ta";
  sortOrderSelect.value = "asc";
  saveSortToStorage();
  updateButtonStates();
  renderRows(taRows);
  updateTaFooter();
});

// Button state updates only on Apply/Clear — no live listeners for sort controls

// Close filter and sort panels when clicking outside
document.addEventListener("click", (e) => {
  if (
    !filterPanel.contains(e.target) &&
    !filterToggleBtn.contains(e.target) &&
    filterPanel.classList.contains("show")
  ) {
    filterPanel.classList.remove("show");
  }
  if (
    !sortPanel.contains(e.target) &&
    !sortToggleBtn.contains(e.target) &&
    sortPanel.classList.contains("show")
  ) {
    sortPanel.classList.remove("show");
  }
});

const init = async () => {
  await requireUser();

  // Set up realtime subscription now that the session is confirmed
  setupRealtimeSubscription();

  // Load saved filters and sort from localStorage
  loadFiltersFromStorage();
  loadSortFromStorage();

  // Restore UI state from loaded filters/sort
  if (filterTaNumberInput) {
    filterTaNumberInput.value = activeFilters.taNumber || "";
    filterTaNumberInput.classList.toggle(
      "is-matched",
      /^\d{4}-\d{2}-\d{4}$/.test(activeFilters.taNumber || ""),
    );
  }
  if (filterEmployeeInput)
    filterEmployeeInput.value = activeFilters.employee || "";
  if (filterYearSelect) filterYearSelect.value = activeFilters.year || "";
  if (filterTravelDateInput)
    filterTravelDateInput.value = activeFilters.travelDate || "";
  if (filterMatchAllCheckbox)
    filterMatchAllCheckbox.checked =
      activeFilters.matchAll !== undefined ? activeFilters.matchAll : true;

  if (sortBySelect) sortBySelect.value = activeSort.by || "ta";
  if (sortOrderSelect) sortOrderSelect.value = activeSort.order || "asc";

  await loadEmployeesForFilter();
  await loadTravelAuthorities(true);
  initAgendaTracker();

  // Update button states after loading data
  updateButtonStates();

  // Initialize Travel Frequency chart
  void initTravelFrequencyYears();

  // Initialize Officials Summary chart
  void initOfficialsSummaryChart();

  // Initialize Destinations chart
  void initDestinationsChart();

  initInsightsLayoutSync();
  queueInsightsLayoutSync();

  // Start activity-driven heartbeat to track online status
  // This avoids marking idle users as online just because their tab is open.
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
      }
    } catch (error) {
      // Silently fail - user might not have the function yet
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
};

// === Travel Frequency Chart ===
let travelFrequencyChart = null;

const loadTravelFrequencyChart = async (year) => {
  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const counts = new Array(12).fill(0);

  try {
    const { data, error } = await supabase
      .from("travel_authorities")
      .select("travel_date")
      .eq("is_demo", false)
      .gte("travel_date", `${year}-01-01`)
      .lte("travel_date", `${year}-12-31`);

    if (!error && data) {
      data.forEach((row) => {
        if (row.travel_date) {
          const month = parseInt(row.travel_date.substring(5, 7), 10) - 1;
          if (month >= 0 && month < 12) counts[month]++;
        }
      });
    }
  } catch (e) {
    console.error("Travel frequency chart error:", e);
  }

  const canvas = document.getElementById("tf-chart");
  if (!canvas) return;
  const displayCounts = counts.map((count) => (count === 0 ? null : count));
  const maxCount = Math.max(...counts, 0);
  const targetYAxisLevels = 8;
  const yStepSize =
    maxCount <= targetYAxisLevels - 1
      ? 1
      : Math.ceil(maxCount / (targetYAxisLevels - 1));
  const yAxisMax =
    maxCount === 0 ? 1 : yStepSize * Math.ceil(maxCount / yStepSize);

  if (travelFrequencyChart) {
    travelFrequencyChart.data.datasets[0].data = displayCounts;
    travelFrequencyChart.options.scales.y.max = yAxisMax;
    travelFrequencyChart.options.scales.y.ticks.stepSize = yStepSize;
    travelFrequencyChart.update();
    queueInsightsLayoutSync();
    return;
  }

  travelFrequencyChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "TAs Filed",
          data: displayCounts,
          backgroundColor: "#2f6fe4",
          borderColor: "#2f6fe4",
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          minBarLength: 12,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ` ${ctx.parsed.y} TA${ctx.parsed.y !== 1 ? "s" : ""}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "rgba(11,28,59,0.45)", font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          max: yAxisMax,
          grid: { color: "rgba(69,122,231,0.07)" },
          border: { display: false },
          ticks: {
            color: "rgba(11,28,59,0.45)",
            font: { size: 11 },
            precision: 0,
            stepSize: yStepSize,
          },
        },
      },
    },
  });

  queueInsightsLayoutSync();
};

const initTravelFrequencyYears = async () => {
  const select = document.getElementById("tf-year-select");
  if (!select) return;

  try {
    const { data, error } = await supabase
      .from("travel_authorities")
      .select("travel_date")
      .eq("is_demo", false);

    if (!error && data) {
      const years = [
        ...new Set(
          data
            .filter((r) => r.travel_date)
            .map((r) => r.travel_date.substring(0, 4)),
        ),
      ].sort((a, b) => b - a);

      select.innerHTML = years.length
        ? years
            .map(
              (y) =>
                `<option value="${escapeHtml(y)}"${y === currentYear ? " selected" : ""}>${escapeHtml(y)}</option>`,
            )
            .join("")
        : '<option value="">No data</option>';

      const selectedYear = select.value || years[0];
      if (selectedYear) await loadTravelFrequencyChart(selectedYear);
    }
  } catch (e) {
    console.error("Failed to init travel frequency years:", e);
  }

  select.addEventListener("change", () => {
    if (select.value) loadTravelFrequencyChart(select.value);
  });
};
// === End Travel Frequency Chart ===

// === Officials Summary List ===
const initOfficialsSummaryChart = async () => {
  const list = document.getElementById("os-list");
  if (!list) return;

  try {
    const { data: employees, error: empError } = await supabase
      .from("employee_list")
      .select("name, position")
      .eq("is_active", true);

    if (empError) throw empError;

    const validEmployees = (employees || []).filter(
      (e) => e.position && e.position.trim().toLowerCase() !== "officials",
    );

    if (!validEmployees.length) {
      list.innerHTML =
        '<div class="insight-chart-placeholder" style="height:120px"><span>No officials found</span></div>';
      queueInsightsLayoutSync();
      return;
    }

    const { data: tas, error: taError } = await supabase
      .from("travel_authorities")
      .select("employees")
      .eq("is_demo", false);

    if (taError) throw taError;

    const counts = {};
    validEmployees.forEach((e) => {
      counts[e.name] = 0;
    });
    (tas || []).forEach((ta) => {
      if (!ta.employees) return;
      ta.employees
        .split(",")
        .map((n) => n.trim())
        .forEach((name) => {
          if (name in counts) counts[name]++;
        });
    });

    const ranked = validEmployees
      .filter((e) => counts[e.name] >= 1)
      .sort((a, b) => counts[b.name] - counts[a.name]);

    if (!ranked.length) {
      list.innerHTML =
        '<div class="insight-chart-placeholder" style="height:120px"><span>No travel records yet</span></div>';
      queueInsightsLayoutSync();
      return;
    }

    list.innerHTML = ranked
      .map(
        (e) => `
            <div class="os-official-row">
                <span class="os-official-name">${e.name}</span>
                <span class="os-official-count">${counts[e.name]}</span>
            </div>
        `,
      )
      .join("");
    queueInsightsLayoutSync();
  } catch (e) {
    console.error("Officials summary error:", e);
  }
};
// === End Officials Summary List ===

// === Destinations Chart ===
const initDestinationsChart = async () => {
  const canvas = document.getElementById("dest-chart");
  const title = document.getElementById("dest-card-title");
  const subtitle = document.getElementById("dest-card-subtitle");
  if (!canvas) return;

  const DESTINATION_TITLES = {
    region: "Travel Destinations",
    calabarzon: "Travel Destinations",
  };
  const DESTINATION_SUBTITLES = {
    region: "Groups destination records by Philippine region.",
    calabarzon:
      "Groups CALABARZON trips by province based on each destination entry.",
  };

  // Fallback entries used when PSGC API is unavailable.
  // Ordered: more specific keywords before broader ones to avoid false matches.
  const FALLBACK_REGION_ENTRIES = [
    [
      "NCR",
      [
        "metro manila",
        "national capital",
        "quezon city",
        "makati",
        "pasig",
        "taguig",
        "marikina",
        "caloocan",
        "las piñas",
        "las pinas",
        "malabon",
        "mandaluyong",
        "muntinlupa",
        "navotas",
        "parañaque",
        "paranaque",
        "pasay",
        "pateros",
        "valenzuela",
        "manila",
      ],
    ],
    [
      "CAR",
      [
        "cordillera",
        "baguio",
        "benguet",
        "ifugao",
        "kalinga",
        "apayao",
        "abra",
        "mountain province",
        "tabuk",
      ],
    ],
    [
      "Region I",
      [
        "ilocos norte",
        "ilocos sur",
        "la union",
        "pangasinan",
        "vigan",
        "laoag",
        "dagupan",
        "urdaneta",
      ],
    ],
    [
      "Region II",
      [
        "cagayan valley",
        "batanes",
        "isabela",
        "nueva vizcaya",
        "quirino",
        "tuguegarao",
        "bayombong",
        "santiago city",
      ],
    ],
    [
      "Region III",
      [
        "bulacan",
        "pampanga",
        "tarlac",
        "nueva ecija",
        "zambales",
        "bataan",
        "malolos",
        "cabanatuan",
        "clark",
        "olongapo",
        "subic",
        "angeles",
      ],
    ],
    [
      "CALABARZON",
      [
        "cavite",
        "laguna",
        "batangas",
        "antipolo",
        "calamba",
        "santa rosa",
        "bacoor",
        "dasmariñas",
        "dasmarinas",
        "imus",
        "tagaytay",
        "lucena",
        "cainta",
        "taytay",
        "biñan",
        "binan",
        "san pablo",
        "cabuyao",
        "lipa",
      ],
    ],
    [
      "MIMAROPA",
      ["palawan", "mindoro", "romblon", "marinduque", "puerto princesa"],
    ],
    [
      "Region V",
      [
        "albay",
        "camarines",
        "catanduanes",
        "sorsogon",
        "naga",
        "legazpi",
        "bicol",
      ],
    ],
    [
      "Region VI",
      [
        "iloilo",
        "capiz",
        "aklan",
        "antique",
        "guimaras",
        "negros occidental",
        "bacolod",
        "kalibo",
        "western visayas",
      ],
    ],
    [
      "Region VII",
      [
        "cebu",
        "bohol",
        "negros oriental",
        "siquijor",
        "mandaue",
        "lapu-lapu",
        "tagbilaran",
        "dumaguete",
        "central visayas",
      ],
    ],
    [
      "Region VIII",
      [
        "leyte",
        "samar",
        "biliran",
        "tacloban",
        "ormoc",
        "catbalogan",
        "eastern visayas",
      ],
    ],
    ["Region IX", ["zamboanga", "dipolog", "pagadian"]],
    [
      "Region X",
      [
        "misamis oriental",
        "misamis occidental",
        "bukidnon",
        "camiguin",
        "lanao del norte",
        "cagayan de oro",
        "iligan",
        "malaybalay",
        "northern mindanao",
      ],
    ],
    ["Region XI", ["davao", "tagum", "digos", "compostela valley", "mati"]],
    [
      "Region XII",
      [
        "south cotabato",
        "north cotabato",
        "sultan kudarat",
        "sarangani",
        "general santos",
        "koronadal",
        "kidapawan",
      ],
    ],
    ["Region XIII", ["agusan", "surigao", "dinagat", "butuan", "caraga"]],
    [
      "BARMM",
      [
        "cotabato city",
        "maguindanao",
        "lanao del sur",
        "basilan",
        "sulu",
        "tawi-tawi",
        "marawi",
        "bangsamoro",
      ],
    ],
  ];

  const FALLBACK_CALABARZON_ENTRIES = [
    [
      "Cavite",
      [
        "cavite",
        "bacoor",
        "dasmariñas",
        "dasmarinas",
        "imus",
        "tagaytay",
        "general trias",
        "trece martires",
        "tanza",
        "silang",
      ],
    ],
    [
      "Laguna",
      [
        "laguna",
        "calamba",
        "santa rosa",
        "biñan",
        "binan",
        "los baños",
        "los banos",
        "san pedro",
        "cabuyao",
        "pagsanjan",
        "san pablo",
      ],
    ],
    ["Batangas", ["batangas", "lipa", "tanauan", "nasugbu", "lemery", "bauan"]],
    [
      "Rizal",
      [
        "antipolo",
        "cainta",
        "taytay",
        "angono",
        "binangonan",
        "pililla",
        "cardona",
      ],
    ],
    [
      "Quezon",
      [
        "lucena",
        "tayabas",
        "quezon province",
        "sariaya",
        "tiaong",
        "gumaca",
        "infanta",
      ],
    ],
  ];

  // PSGC API: fetches official province and city/municipality names per region.
  // Results are merged with fallback keywords so existing matches are never lost.
  // Responses are cached in sessionStorage (refreshed daily).
  const PSGC_BASE = "https://psgc.rootscratch.com";
  // v3: dropped broken /province?id= city-fetch for CALABARZON drill-down
  const PSGC_CACHE_KEY = "psgc_geo_v3";
  const PSGC_CACHE_DATE_KEY = "psgc_geo_date_v3";

  const psgcFetch = (url) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
  };

  const psgcDeriveLabel = (name) => {
    const u = name.toUpperCase();
    if (u.includes("NATIONAL CAPITAL")) return "NCR";
    if (u.includes("CORDILLERA")) return "CAR";
    if (u.includes("BANGSAMORO") || u.includes("BARMM")) return "BARMM";
    if (u.includes("CALABARZON")) return "CALABARZON";
    if (u.includes("MIMAROPA")) return "MIMAROPA";
    if (u.includes("NEGROS ISLAND")) return "NIR";
    const m = name.match(/Region\s+([\w\-]+)/i);
    if (m) return `Region ${m[1].toUpperCase()}`;
    return name;
  };

  const loadPsgcEntries = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (sessionStorage.getItem(PSGC_CACHE_DATE_KEY) === today) {
        const cached = sessionStorage.getItem(PSGC_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      }
    } catch (_) {}

    // Fetch all regions and all provinces in parallel — 2 calls.
    // Avoids /region?id= which returns the region record itself, not its provinces.
    const [regRes, provRes] = await Promise.all([
      psgcFetch(`${PSGC_BASE}/region`),
      psgcFetch(`${PSGC_BASE}/province`),
    ]);
    if (!regRes.ok || !provRes.ok) throw new Error("PSGC fetch failed");
    const regions = await regRes.json();
    const allProvinces = await provRes.json();

    // PSGC IDs are hierarchical: the first 2 digits identify the region.
    // Province IDs share the same 2-digit prefix as their parent region.
    const regionPrefixMap = new Map(); // e.g. "04" → "CALABARZON"
    regions.forEach((r) => {
      regionPrefixMap.set(r.psgc_id.substring(0, 2), psgcDeriveLabel(r.name));
    });

    // Group province names under their region label
    const regionProvincesMap = new Map();
    allProvinces.forEach((p) => {
      const label = regionPrefixMap.get(p.psgc_id.substring(0, 2));
      if (!label) return;
      if (!regionProvincesMap.has(label)) regionProvincesMap.set(label, []);
      regionProvincesMap.get(label).push(p.name.toLowerCase().trim());
    });

    // Merge province names into fallback region entries
    const regionEntries = FALLBACK_REGION_ENTRIES.map(([label, fbKws]) => {
      const apiKws = regionProvincesMap.get(label) || [];
      return [label, [...new Set([...apiKws, ...fbKws])]];
    });
    for (const [label, kws] of regionProvincesMap) {
      if (!regionEntries.find(([l]) => l === label) && kws.length) {
        regionEntries.push([label, kws]);
      }
    }

    // CALABARZON drill-down: the PSGC API's /municipal-city endpoint is
    // currently non-functional (returns empty), so city/municipality-level
    // enrichment is not possible. Use the static fallback keywords which
    // already cover the main cities and municipalities per province.
    const calabarzonEntries = FALLBACK_CALABARZON_ENTRIES;

    const result = { regionEntries, calabarzonEntries };
    try {
      sessionStorage.setItem(PSGC_CACHE_KEY, JSON.stringify(result));
      sessionStorage.setItem(
        PSGC_CACHE_DATE_KEY,
        new Date().toISOString().slice(0, 10),
      );
    } catch (_) {}
    return result;
  };

  const classifyDest = (dest, entries) => {
    if (!dest) return "Others";
    const d = dest.toLowerCase();
    for (const [label, keywords] of entries) {
      for (const kw of keywords) {
        if (d.includes(kw)) return label;
      }
    }
    return "Others";
  };

  const REGION_PALETTE = [
    "#2563eb",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
    "#7c3aed",
    "#db2777",
    "#0284c7",
    "#16a34a",
    "#ca8a04",
    "#b91c1c",
    "#0d9488",
    "#4f46e5",
    "#be185d",
    "#15803d",
    "#b45309",
    "#6366f1",
    "#64748b",
  ];
  const CALABARZON_PALETTE = [
    "#2563eb",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
  ];

  try {
    // Fetch travel authorities and PSGC geographic data in parallel
    const [{ data: tas, error: taError }, psgcEntries] = await Promise.all([
      supabase
        .from("travel_authorities")
        .select("destination")
        .eq("is_demo", false),
      loadPsgcEntries().catch((err) => {
        console.warn(
          "PSGC API unavailable, using local classification data:",
          err,
        );
        return null;
      }),
    ]);

    if (taError) throw taError;

    const REGION_ENTRIES = psgcEntries
      ? psgcEntries.regionEntries
      : FALLBACK_REGION_ENTRIES;
    const CALABARZON_ENTRIES = psgcEntries
      ? psgcEntries.calabarzonEntries
      : FALLBACK_CALABARZON_ENTRIES;

    const dataBadge = document.getElementById("dest-data-badge");
    const usedPsgc = !!psgcEntries;
    const updateBadge = (view) => {
      if (!dataBadge) return;
      if (view !== "region" || !usedPsgc) {
        dataBadge.hidden = true;
        return;
      }
      dataBadge.textContent = "PSGC API";
      dataBadge.className = "dest-data-badge dest-data-badge--api";
      dataBadge.href = "https://psgc.rootscratch.com/";
      dataBadge.hidden = false;
    };

    let destChart = null;

    const centerLabelPlugin = {
      id: "destCenterLabel",
      afterDraw(chart) {
        const {
          ctx,
          chartArea: { top, bottom, left, right },
        } = chart;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        ctx.save();
        ctx.font = "700 22px Inter, sans-serif";
        ctx.fillStyle = "#0b1c3b";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(total, cx, cy - 9);
        ctx.font = "500 10px Inter, sans-serif";
        ctx.fillStyle = "rgba(11,28,59,0.4)";
        ctx.fillText("travels", cx, cy + 10);
        ctx.restore();
      },
    };

    const renderLegend = (labels, data, colors) => {
      const legend = document.getElementById("dest-legend");
      if (!legend) return;
      const total = data.reduce((a, b) => a + b, 0);
      legend.innerHTML = labels
        .map((label, i) => {
          const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : "0.0";
          return `<div class="dest-legend-item">
                    <span class="dest-legend-dot" style="background:${colors[i]}"></span>
                    <span class="dest-legend-label">${label}</span>
                    <span class="dest-legend-meta">
                        <span class="dest-legend-count">${data[i]}</span>
                        <span class="dest-legend-pct">${pct}%</span>
                    </span>
                </div>`;
        })
        .join("");
    };

    const buildData = (entries, palette) => {
      const counts = {};
      (tas || []).forEach((ta) => {
        const label = classifyDest(ta.destination, entries);
        counts[label] = (counts[label] || 0) + 1;
      });
      const sorted = Object.entries(counts)
        .filter(([k]) => k !== "Others")
        .sort((a, b) => b[1] - a[1]);
      if (counts["Others"]) sorted.push(["Others", counts["Others"]]);
      const labels = sorted.map((e) => e[0]);
      const data = sorted.map((e) => e[1]);
      const colors = labels.map((l, i) =>
        l === "Others" ? "#94a3b8" : palette[i % palette.length],
      );
      return { labels, data, colors };
    };

    const renderChart = (view) => {
      if (title) {
        title.textContent =
          DESTINATION_TITLES[view] || DESTINATION_TITLES.region;
      }
      if (subtitle) {
        subtitle.textContent =
          DESTINATION_SUBTITLES[view] || DESTINATION_SUBTITLES.region;
      }
      updateBadge(view);

      const entries = view === "region" ? REGION_ENTRIES : CALABARZON_ENTRIES;
      const palette = view === "region" ? REGION_PALETTE : CALABARZON_PALETTE;
      const { labels, data, colors } = buildData(entries, palette);

      if (!labels.length) {
        canvas.parentElement.innerHTML =
          '<div class="insight-chart-placeholder" style="height:220px"><span>No destination data yet</span></div>';
        queueInsightsLayoutSync();
        return;
      }

      renderLegend(labels, data, colors);

      if (destChart) {
        destChart.data.labels = labels;
        destChart.data.datasets[0].data = data;
        destChart.data.datasets[0].backgroundColor = colors;
        destChart.update();
      } else {
        destChart = new Chart(canvas, {
          type: "doughnut",
          data: {
            labels,
            datasets: [
              {
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.85)",
                hoverOffset: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "60%",
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = ((ctx.parsed / total) * 100).toFixed(1);
                    return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                  },
                },
              },
            },
          },
          plugins: [centerLabelPlugin],
        });
      }

      queueInsightsLayoutSync();
    };

    renderChart("calabarzon");
    syncSegmentedControl(
      document.querySelector(".dest-switcher[data-segmented-control]"),
    );

    document.querySelectorAll(".dest-switch-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".dest-switch-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        syncSegmentedControl(btn.closest("[data-segmented-control]"));
        renderChart(btn.dataset.view);
      });
    });
  } catch (e) {
    console.error("Destinations chart error:", e);
  }
};
// === End Destinations Chart ===

init();

// Realtime subscription for travel_authorities changes
let realtimeChannel = null;
const setupRealtimeSubscription = () => {
  // Clean up existing subscription if any
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  // Subscribe to all changes (INSERT, UPDATE, DELETE) on travel_authorities table
  realtimeChannel = supabase
    .channel("travel_authorities_dashboard_changes")
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to all events
        schema: "public",
        table: "travel_authorities",
      },
      (payload) => {
        // Check if this is a demo file - suppress toast for regular users
        let isDemo = false;
        let changedToDemo = false;

        if (payload.eventType === "INSERT") {
          isDemo = payload.new?.is_demo === true;
        } else if (payload.eventType === "UPDATE") {
          isDemo = payload.new?.is_demo === true;
          // Check if file was just changed to demo (wasn't demo before, is demo now)
          changedToDemo =
            !payload.old?.is_demo && payload.new?.is_demo === true;
        } else if (payload.eventType === "DELETE") {
          isDemo = payload.old?.is_demo === true;
        }

        // Don't show toast for demo files on dashboard (regular users)
        // EXCEPT when a file was just updated to demo status (admin forgot to mark it initially)
        if (isDemo && !changedToDemo) {
          return;
        }

        // Show notification with flashing refresh button
        let message = "";
        switch (payload.eventType) {
          case "INSERT":
            message = "New record added";
            break;
          case "UPDATE":
            message = "Record updated";
            break;
          case "DELETE":
            message = "Record deleted";
            break;
        }

        if (refreshTableBtn) {
          refreshTableBtn.classList.add("has-new-data");
        }

        showToast(`${message} - Click Reload to refresh`, "info", 30000);
      },
    )
    .subscribe((status) => {});
};

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
if (window.headerLoaded) {
  window.initHeaderButtons();
}

document.getElementById("close-settings").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.remove("show");
});

document.getElementById("settings-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("settings-modal")) {
    document.getElementById("settings-modal").classList.remove("show");
  }
});

// Sidebar collapse toggle
const dashSidebar = document.getElementById("dash-sidebar");
const dashSidebarToggle = document.getElementById("dash-sidebar-toggle");

// Restore saved collapse state
const dashWrapper = document.getElementById("dashboard-wrapper");
const savedSidebarCollapsed =
  localStorage.getItem("dashSidebarCollapsed") === "true";
if (dashSidebar && savedSidebarCollapsed) {
  dashSidebar.classList.add("collapsed");
  if (dashWrapper) dashWrapper.classList.add("sidebar-collapsed");
}

if (dashSidebar && dashSidebarToggle) {
  dashSidebarToggle.addEventListener("click", () => {
    const isNowCollapsed = dashSidebar.classList.toggle("collapsed");
    if (dashWrapper)
      dashWrapper.classList.toggle("sidebar-collapsed", isNowCollapsed);
    localStorage.setItem("dashSidebarCollapsed", isNowCollapsed);
    scheduleInsightsLayoutSync();
  });
}

// Sidebar tab switching
const switchDashTab = (target) => {
  document.querySelectorAll(".dash-sidebar-tab").forEach((t) => {
    const isTarget = t.getAttribute("data-tab") === target;
    t.classList.toggle("active", isTarget);
    t.setAttribute("aria-selected", isTarget ? "true" : "false");
  });
  document
    .querySelectorAll(".dash-tab-pane")
    .forEach((p) => p.classList.remove("active"));
  const pane = document.getElementById(`tab-${target}`);
  if (pane) pane.classList.add("active");
  if (target === "insights") {
    renderAgendaTracker();
    scheduleAgendaCalendarLayoutSync();
    scheduleInsightsLayoutSync();
  }
  if (target === "draft-ta" && window.initDraftTaPanel) {
    window.initDraftTaPanel(supabase);
  }
  localStorage.setItem("dashActiveTab", target);
};

document.querySelectorAll(".dash-sidebar-tab").forEach((tab) => {
  if (!tab.dataset.tab) return; // skip action-type buttons (e.g. Draft TA)
  tab.addEventListener("click", () => {
    switchDashTab(tab.getAttribute("data-tab"));
  });
});

// Restore last active tab on load
const savedDashTab = localStorage.getItem("dashActiveTab");
if (savedDashTab) switchDashTab(savedDashTab);
