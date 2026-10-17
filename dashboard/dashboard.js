import { setupRecordToolbar } from "../shared/record-toolbar.js";
// Module: Dashboard — npm-managed dependencies via Vite
import "@lottiefiles/dotlottie-wc";
import { createClient } from "@supabase/supabase-js";
import Chart from "chart.js/auto";
import "../shared/draft-travel-datepicker.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabaseConfig } from "../config.js";
import { initAutoLogout } from "../auto-logout.js";
import { escapeHtml, safeUrl, formatFileSize, formatFileLabel, formatTaNumber } from "../shared/record-utils.js";
import { renderRecordBatch, createRecordsLoader } from "../shared/records-table.js";
import { createDashboardHeader } from "../header/dashboard-header.js";
import { createDashboardSession } from "../auth/dashboard-session.js";
import { fetchFileSizeBytes, createFileOpener, setupResponsiveViewDownload } from "../shared/record-files.js";
import { createInsights } from "./insights.js";
import { createAgendaTracker } from "./agenda.js";
import { createInsightsLayout } from "./insights-layout.js";
import { createDashboardAccess } from "../auth/page-access.js";
import "../pwa-update.js";

// Expose globals for non-module scripts (draft-ta-panel.js, draft-location-picker.js, ta-generator.js)
window.Chart = Chart;
window.L = L;

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
const { markCurrentUserOffline, clearDashboardClientState, setupAccessMonitoring, validateSession } = createDashboardSession({
  supabase,
});

// Initialize auto-logout (5 minutes warning, 6 minutes total)
initAutoLogout(supabase, {
  warningTime: 5 * 60 * 1000, // 5 minutes
  logoutTime: 6 * 60 * 1000, // 6 minutes (5 min warning + 1 min countdown)
  onLogout: async () => {
    await markCurrentUserOffline();
    clearDashboardClientState();
  },
});

// Initialize access monitoring
setupAccessMonitoring();

// Show confirmation modal and return a Promise
const showConfirmation = (title, message) => {
  return new Promise((resolve) => {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModal.classList.add("show");

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

      if (isLogout) {
        confirmConfirmBtn.style.background = "";
      }
    };

    confirmConfirmBtn.addEventListener("click", handleConfirm);
    cancelConfirmBtn.addEventListener("click", handleCancel);
    confirmModal.addEventListener("click", handleClickOutside);
  });
};

const showAlertModal = (title, message, confirmLabel = "OK") => {
  return new Promise((resolve) => {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalMessage.style.whiteSpace = "pre-line";
    cancelConfirmBtn.style.display = "none";
    const originalConfirmText = confirmConfirmBtn.textContent;
    confirmConfirmBtn.textContent = confirmLabel;
    confirmModal.classList.add("show");

    const closeModal = (result) => {
      confirmModal.classList.remove("show");
      cleanup();
      resolve(result);
    };

    const handleConfirm = () => closeModal(true);
    const handleClickOutside = (e) => {
      if (e.target === confirmModal) {
        closeModal(false);
      }
    };

    const cleanup = () => {
      confirmConfirmBtn.removeEventListener("click", handleConfirm);
      confirmModal.removeEventListener("click", handleClickOutside);
      cancelConfirmBtn.style.display = "";
      confirmConfirmBtn.textContent = originalConfirmText;
      confirmModalMessage.style.whiteSpace = "";
    };

    confirmConfirmBtn.addEventListener("click", handleConfirm);
    confirmModal.addEventListener("click", handleClickOutside);
  });
};
window.showAppAlert = showAlertModal;

window.initHeaderButtons = createDashboardHeader({
  supabase, markCurrentUserOffline, clearDashboardClientState, showConfirmation,
});

// Check session every 30 seconds
setInterval(validateSession, 30000);

const taBody = document.getElementById("ta-body");
const taStatus = document.getElementById("ta-status");
const taMoreBtn = document.getElementById("ta-lazy-sentinel");
let dashboardUserRole = "user";
let currentDashboardUserId = "";
const { requireUser } = createDashboardAccess({
  supabase,
  setCurrentUserId: (id) => { currentDashboardUserId = id; },
  setUserRole: (role) => { dashboardUserRole = role; },
});
let taRows = [];
let currentDisplayRows = [];
let renderedCount = 0;
const LAZY_BATCH_SIZE = 50;
const currentYear = new Date().getFullYear().toString();
let activeFilters = {
  taNumber: "",
  employee: "",
  year: currentYear,
  travelDate: "",
  matchAll: true,
};
let activeSort = {
  by: "ta",
  order: "desc",
};
const DASHBOARD_COLUMNS_DEFAULT = {
  ta_number: true,
  purpose: true,
  destination: true,
  officials: true,
  travel_end: true,
  file: true,
};
let activeDashboardColumns = { ...DASHBOARD_COLUMNS_DEFAULT };
let employeesListForFilter = [];

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
    viewFileLink.dataset.fileName = record.file_name || "Download";
    viewFileLink.textContent = "Download";
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

const {
  initAgendaTracker, renderAgendaTracker, queueAgendaCalendarLayoutSync,
  scheduleAgendaCalendarLayoutSync,
  syncSegmentedControl, syncAllSegmentedControls,
} = createAgendaTracker({
  getRecords: () => taRows,
  openViewModalForRecord,
  queueInsightsLayoutSync: () => queueInsightsLayoutSync(),
});

const {
  queueInsightsLayoutSync, scheduleInsightsLayoutSync, initInsightsLayoutSync,
} = createInsightsLayout({ queueAgendaCalendarLayoutSync, syncAllSegmentedControls });

// Helper functions for localStorage persistence
const FILTER_MATCH_ALL_VISIBILITY_KEY = "dashboardHideMatchAllFilter";

const getDashboardHideMatchAllFilter = () => {
  const saved = localStorage.getItem(FILTER_MATCH_ALL_VISIBILITY_KEY);
  return saved === null ? true : saved === "true";
};

const applyDashboardMatchAllFilterVisibility = (hide) => {
  const filterMode = document.getElementById("filter-mode");
  if (!filterMode) return;
  filterMode.style.display = hide ? "none" : "";
  filterMode.toggleAttribute("hidden", hide);
};

const settingsHideMatchAllFilter = document.getElementById(
  "settings-hide-match-all-filter",
);
if (settingsHideMatchAllFilter) {
  settingsHideMatchAllFilter.checked = getDashboardHideMatchAllFilter();
  settingsHideMatchAllFilter.addEventListener("change", () => {
    const hide = settingsHideMatchAllFilter.checked;
    localStorage.setItem(FILTER_MATCH_ALL_VISIBILITY_KEY, hide);
    applyDashboardMatchAllFilterVisibility(hide);
  });
}

applyDashboardMatchAllFilterVisibility(getDashboardHideMatchAllFilter());

// Employee, TA number, and travel date filters stay in memory only.
const saveFiltersToStorage = () => {
  try {
    localStorage.removeItem("dashboardFilters");
    localStorage.setItem("dashboardFilterPreferences", JSON.stringify({
      year: /^\d{4}$/.test(activeFilters.year)
        ? activeFilters.year
        : "",
      matchAll: activeFilters.matchAll === true,
    }));
  } catch (e) {
    console.error("Failed to save dashboard filter preferences:", e);
  }
};

const loadFiltersFromStorage = () => {
  try {
    // Remove legacy filters without restoring personal information.
    localStorage.removeItem("dashboardFilters");
    const saved = localStorage.getItem("dashboardFilterPreferences");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed?.year === "string" &&
          (parsed.year === "" || /^\d{4}$/.test(parsed.year))) {
        activeFilters.year = parsed.year;
      }
      if (typeof parsed?.matchAll === "boolean") {
        activeFilters.matchAll = parsed.matchAll;
      }
    }
  } catch (e) {
    console.error("Failed to load dashboard filter preferences:", e);
  }
};

const saveSortToStorage = () => {
  localStorage.setItem("dashboardSort", JSON.stringify(activeSort));
};

const getDashboardColumnsStorageKey = () => {
  return `dashboardColumns:${currentDashboardUserId || "anonymous"}`;
};

const saveDashboardColumnsToStorage = () => {
  localStorage.setItem(
    getDashboardColumnsStorageKey(),
    JSON.stringify(activeDashboardColumns),
  );
};

const loadDashboardColumnsFromStorage = () => {
  const saved = localStorage.getItem(getDashboardColumnsStorageKey());
  activeDashboardColumns = { ...DASHBOARD_COLUMNS_DEFAULT };
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    Object.keys(DASHBOARD_COLUMNS_DEFAULT).forEach((key) => {
      if (typeof parsed?.[key] === "boolean") {
        activeDashboardColumns[key] = parsed[key];
      }
    });
  } catch (error) {
    console.error("Failed to parse dashboard columns settings:", error);
  }
};

const applyDashboardColumnVisibility = () => {
  const table = document.querySelector("#ta-panel .data-table");
  if (!table) return;

  Object.entries(activeDashboardColumns).forEach(([columnKey, isVisible]) => {
    table.querySelectorAll(`[data-col="${columnKey}"]`).forEach((cell) => {
      cell.style.display = isVisible ? "" : "none";
    });
  });
};

const syncDashboardColumnInputs = () => {
  document
    .querySelectorAll('#settings-columns-list input[data-column-key]')
    .forEach((input) => {
      const columnKey = input.getAttribute("data-column-key");
      if (!columnKey || !(columnKey in activeDashboardColumns)) return;
      input.checked = activeDashboardColumns[columnKey];
    });
};

const initDashboardColumnControls = () => {
  document
    .querySelectorAll('#settings-columns-list input[data-column-key]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        const columnKey = input.getAttribute("data-column-key");
        if (!columnKey || !(columnKey in activeDashboardColumns)) return;
        activeDashboardColumns[columnKey] = input.checked;
        saveDashboardColumnsToStorage();
        applyDashboardColumnVisibility();
      });
    });
};

const loadSortFromStorage = () => {
  const saved = localStorage.getItem("dashboardSort");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const resolvedBy = parsed.by && parsed.by !== "" ? parsed.by : activeSort.by;
      const resolvedOrder =
        parsed.order && parsed.order !== "" ? parsed.order : activeSort.order;
      activeSort = { ...activeSort, by: resolvedBy, order: resolvedOrder };
    } catch (e) {
      console.error("Failed to parse saved sort:", e);
    }
  }
};

const updateButtonStates = () => {
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const sortToggleBtn = document.getElementById("sort-toggle-btn");


  const isFilterActive =
    activeFilters.taNumber ||
    activeFilters.employee ||
    (activeFilters.year &&
      activeFilters.year !== new Date().getFullYear().toString()) ||
    activeFilters.travelDate ||
    activeFilters.matchAll === false;


  const isSortActive = activeSort.by !== "ta" || activeSort.order !== "desc";

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
setupResponsiveViewDownload(viewFileLink);
  setupRecordToolbar(document.getElementById("ta-panel"));
const viewFileSize = document.getElementById("view-file-size");

const openStoredFile = createFileOpener({ showToast });

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

    if (activeFilters.year) {
      const matchesYear =
        row.travel_date && row.travel_date.startsWith(activeFilters.year);
      checks.push(matchesYear);
    }

    if (activeFilters.travelDate) {
      const matchesDate =
        row.travel_date && row.travel_date === activeFilters.travelDate;
      checks.push(matchesDate);
    }

    // Return based on match mode (AND or OR)
    if (activeFilters.matchAll) {

      return checks.every((check) => check === true);
    } else {

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
                <td data-col="ta_number">${escapeHtml(row.ta_number) || "-"}</td>
                <td data-col="purpose"><span class="truncate">${escapeHtml(row.purpose) || "-"}</span></td>
                <td data-col="destination" style="text-align: left;"><span class="truncate">${escapeHtml(row.destination) || "-"}</span></td>
                <td data-col="officials" style="text-align: left;"><span class="truncate">${escapeHtml(employeesText)}</span></td>
                <td>${dateText}</td>
                <td data-col="travel_end">${untilText}</td>
                <td data-col="file">
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
          viewFileLink.dataset.fileName = record.file_name || "Download";
          viewFileLink.textContent = "Download";
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

  renderedCount = renderRecordBatch({
    body: taBody, sentinel: taMoreBtn, rows: currentDisplayRows, batchSize: LAZY_BATCH_SIZE,
    buildRow: buildDashRowHtml,
    applyColumnVisibility: applyDashboardColumnVisibility, bindRowEvents: bindDashRowEvents,
  });
};

const loadMoreDashRows = () => {
  if (recordsLoader.loading || renderedCount >= currentDisplayRows.length) return;
  renderedCount = renderRecordBatch({
    body: taBody, sentinel: taMoreBtn, rows: currentDisplayRows, batchSize: LAZY_BATCH_SIZE,
    from: renderedCount, append: true,
    buildRow: buildDashRowHtml,
    applyColumnVisibility: applyDashboardColumnVisibility, bindRowEvents: bindDashRowEvents,
  });
  updateTaFooter();
};

const updateTaFooter = () => {
  const totalFiltered = currentDisplayRows.length;
  taStatus.textContent = `Showing ${renderedCount} of ${totalFiltered}`;
};

const recordsLoader = createRecordsLoader({
  onStart: (reset) => {
    if (reset) {
      taRows = [];
      currentDisplayRows = [];
      renderedCount = 0;
      if (taMoreBtn) taMoreBtn.style.display = "none";
      taBody.innerHTML = '<tr><td colspan="7">Loading records...</td></tr>';
    }

    taStatus.textContent = "Fetching travel authorities.";
  },
  fetchRecords: () => supabase
      .from("travel_authorities")
      .select(
        "ta_number, purpose, destination, employees, travel_date, travel_until, file_name, file_url, created_at, is_demo",
      )
      .eq("is_demo", false)
      .order("created_at", { ascending: false }),
  onLoaded: async (rows) => {
    taRows = rows;
    renderRows(taRows);
    renderAgendaTracker();
    updateTaFooter();
    await populateYearFilter();
  },
  onError: (error) => {
    console.error("Dashboard load error:", error);
    taBody.innerHTML = '<tr><td colspan="7">Unable to load records.</td></tr>';
    taStatus.textContent = "Failed to load travel authorities.";
  },
});
const loadTravelAuthorities = (reset = false) => recordsLoader.load(reset);
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
        event: "*",
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

const filterDatePicker = window.createDraftTravelDatepicker(filterTravelDateInput);
filterTravelDateInput.addEventListener('change', () => {
  const dateStr = filterTravelDateInput.value;
  if (dateStr) {
    const selectedYear = dateStr.substring(0, 4);
    const yearOption = Array.from(filterYearSelect.options).find(
      (option) => option.value === selectedYear,
    );
    filterYearSelect.value = yearOption ? selectedYear : '';
  }
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
  filterDatePicker.clear();
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
  activeSort.by = "ta";
  activeSort.order = "desc";
  sortBySelect.value = "ta";
  sortOrderSelect.value = "desc";
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

  const savedDashTab = localStorage.getItem("dashActiveTab");
  const hasSavedPane = savedDashTab
    ? document.getElementById(`tab-${savedDashTab}`)
    : null;
  switchDashTab(hasSavedPane ? savedDashTab : "insights");

  // Set up realtime subscription now that the session is confirmed
  setupRealtimeSubscription();

  // Load saved filters and sort from localStorage
  loadFiltersFromStorage();
  loadSortFromStorage();
  loadDashboardColumnsFromStorage();
  initDashboardColumnControls();
  syncDashboardColumnInputs();
  applyDashboardColumnVisibility();

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
    filterDatePicker.selectDate(activeFilters.travelDate || "", { silent: true });
  if (filterMatchAllCheckbox)
    filterMatchAllCheckbox.checked =
      activeFilters.matchAll !== undefined ? activeFilters.matchAll : true;

  if (sortBySelect) sortBySelect.value = activeSort.by || "ta";
  if (sortOrderSelect) sortOrderSelect.value = activeSort.order || "desc";

  await loadEmployeesForFilter();
  await loadTravelAuthorities(true);
  initAgendaTracker();

  // Update button states after loading data
  updateButtonStates();


  void initTravelFrequencyYears();


  void initOfficialsSummaryChart();


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

const { initTravelFrequencyYears, initOfficialsSummaryChart, initDestinationsChart } =
  createInsights({
    supabase, Chart, currentYear, queueInsightsLayoutSync, syncSegmentedControl,
  });

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
        event: "*",
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
        // Notify when an existing record becomes a demo so the displayed list can be refreshed.
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
