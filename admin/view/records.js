import { setupRecordToolbar } from "../../shared/record-toolbar.js";
import { escapeHtml, safeUrl, formatFileLabel, formatTaNumber } from "../../shared/record-utils.js";
import { renderRecordBatch, createRecordsLoader } from "../../shared/records-table.js";
import { createFileOpener, setupResponsiveViewDownload } from "../../shared/record-files.js";

// Initialize Records after its panel and modals have loaded.
export const initAdminRecords = ({
  supabase, getCurrentUserId, getUpdateEmployeesMultiSelect,
  updateSelectedEmployees, updateViewFileSize, parseEmployeeNames,
  bindTaFormatter, isValidTaNumber,
}) => {
  let latestKnownTimestamp = null;
  // Table view functionality
  const viewBody = document.getElementById("view-body");
  const viewStatus = document.getElementById("view-status");
  const viewMoreBtn = document.getElementById("view-lazy-sentinel");
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
      const file =
        updateScanFile && updateScanFile.files && updateScanFile.files[0];
      if (!file) {
        const hint = document.getElementById("update-ocr-hint");
        if (hint) {
          hint.textContent = "No file attached. Upload a scanned file first.";
          hint.classList.add("status--error");
          setTimeout(() => {
            hint.textContent =
              "Scan the attached file to autofill purpose and destination.";
            hint.classList.remove("status--error");
          }, 3000);
        }
        return;
      }
      if (typeof window.autoFillFieldOCR !== "function") {
        console.warn("[OCR] autoFillFieldOCR not ready yet");
        return;
      }
      const originalHTML = updateOcrBtn.innerHTML;
      updateOcrBtn.disabled = true;
      updateOcrBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="animation:ocr-spin .7s linear infinite"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg> Scanning\u2026';
      const results = await Promise.allSettled([
        window.autoFillFieldOCR("purpose", file),
        window.autoFillFieldOCR("destination", file),
      ]);
      let filled = 0;
      [
        ["purpose", "update-purpose"],
        ["destination", "update-destination"],
      ].forEach(([key, elId], i) => {
        const r = results[i];
        if (r.status === "fulfilled" && r.value) {
          const el = document.getElementById(elId);
          if (el) {
            el.value = r.value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            filled++;
          }
        } else {
          console.warn(
            `[OCR] ${key}: ${results[i].reason?.message || "failed"}`,
          );
        }
      });
      updateOcrBtn.innerHTML =
        filled === 2
          ? "\u2713 Both filled!"
          : filled === 1
            ? "\u2713 1 of 2 filled"
            : "\u2717 Not found \u2014 try a clearer scan";
      const hint = document.getElementById("update-ocr-hint");
      if (hint && filled > 0)
        hint.textContent =
          "Please review and correct any misscanned text before updating.";
      setTimeout(() => {
        updateOcrBtn.innerHTML = originalHTML;
        updateOcrBtn.disabled = false;
      }, 2500);
    });
  }
  const viewTaNumber = document.getElementById("view-ta-number");
  const viewPurpose = document.getElementById("view-purpose");
  const viewDestination = document.getElementById("view-destination");
  const viewEmployees = document.getElementById("view-employees");
  const viewTravelDate = document.getElementById("view-travel-date");
  const viewTravelUntil = document.getElementById("view-travel-until");
  const viewFileLink = document.getElementById("view-file-link");
  setupResponsiveViewDownload(viewFileLink);
  setupRecordToolbar(document.getElementById("view-panel"));
  const viewFileSize = document.getElementById("view-file-size");
  const updateTaInput = document.getElementById("update-ta-number");
  const updatePurposeInput = document.getElementById("update-purpose");
  const updateDestinationInput = document.getElementById("update-destination");
  const updateTravelDateInput = document.getElementById("update-travel-date");
  const updateTravelUntilInput = document.getElementById("update-travel-until");
  const updateScanFileInput = document.getElementById("update-scan-file");
  const updateIsDemoCheckbox = document.getElementById(
    "update-is-demo-checkbox",
  );
  const updateStatus = document.getElementById("update-status");
  const toast = document.getElementById("toast");
  bindTaFormatter(updateTaInput);

  const autoResizeUpdateTextarea = (el) => {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "auto";
    const minH = parseFloat(getComputedStyle(el).minHeight) || 0;
    const newH = Math.min(Math.max(el.scrollHeight, minH), 170);
    el.style.height = newH + "px";
    el.style.overflowY = el.scrollHeight > 170 ? "auto" : "hidden";
  };
  [updatePurposeInput, updateDestinationInput].forEach((el) => {
    if (el) el.addEventListener("input", () => autoResizeUpdateTextarea(el));
  });

  // Real-time TA number validation for update modal
  let updateTaCheckTimer = null;
  updateTaInput.addEventListener("input", async () => {
    const taNumber = updateTaInput.value.trim();

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

          if (error && error.code !== "PGRST116") {
            // PGRST116 is "no rows returned" - that's expected if TA doesn't exist
            console.error("Error checking TA number:", error);
            return;
          }

          // Only warn if TA exists AND it's a different record than the one being updated
          if (data && updateRecordData && data.id !== updateRecordData.id) {
            showToast(
              `TA ${taNumber} already exists in another record.`,
              "warning",
            );
          }
        } catch (err) {
          console.error("Error checking TA number:", err);
        }
      }, 500);
    }
  });

  const recordCache = new Map();
  let viewRows = [];
  let adminCurrentDisplayRows = [];
  let adminRenderedCount = 0;
  const ADMIN_LAZY_BATCH_SIZE = 50;
  const currentYear = new Date().getFullYear().toString();
  let deleteRecordData = null;
  let updateRecordData = null;
  let toastTimer = null;
  let adminActiveFilters = {
    taNumber: "",
    employee: "",
    year: currentYear,
    travelDate: "",
    matchAll: true,
  };
  let adminActiveSort = {
    by: "ta",
    order: "desc",
  };
  const ADMIN_COLUMNS_DEFAULT = {
    ta_number: true,
    purpose: true,
    destination: true,
    officials: true,
    travel_end: true,
    file: true,
  };
  let adminActiveColumns = { ...ADMIN_COLUMNS_DEFAULT };
  let adminEmployeesListForFilter = [];
  window.adminEmployeesListForFilter = adminEmployeesListForFilter;

  // Helper functions for localStorage persistence
  // Employee, TA number, and travel date filters stay in memory only.
  const saveAdminFiltersToStorage = () => {
    try {
      localStorage.removeItem("adminFilters");
      localStorage.setItem("adminFilterPreferences", JSON.stringify({
        year: /^\d{4}$/.test(adminActiveFilters.year)
          ? adminActiveFilters.year
          : "",
        matchAll: adminActiveFilters.matchAll === true,
      }));
    } catch (e) {
      console.error("Failed to save admin filter preferences:", e);
    }
  };

  const loadAdminFiltersFromStorage = () => {
    try {
      // Remove legacy filters without restoring personal information.
      localStorage.removeItem("adminFilters");
      const saved = localStorage.getItem("adminFilterPreferences");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.year === "string" &&
            (parsed.year === "" || /^\d{4}$/.test(parsed.year))) {
          adminActiveFilters.year = parsed.year;
        }
        if (typeof parsed?.matchAll === "boolean") {
          adminActiveFilters.matchAll = parsed.matchAll;
        }
      }
    } catch (e) {
      console.error("Failed to load admin filter preferences:", e);
    }
  };

  const saveAdminSortToStorage = () => {
    localStorage.setItem("adminSort", JSON.stringify(adminActiveSort));
  };

  const getAdminColumnsStorageKey = () => {
    return `adminColumns:${getCurrentUserId() || "anonymous"}`;
  };

  const saveAdminColumnsToStorage = () => {
    localStorage.setItem(
      getAdminColumnsStorageKey(),
      JSON.stringify(adminActiveColumns),
    );
  };

  const loadAdminColumnsFromStorage = () => {
    const saved = localStorage.getItem(getAdminColumnsStorageKey());
    adminActiveColumns = { ...ADMIN_COLUMNS_DEFAULT };
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      Object.keys(ADMIN_COLUMNS_DEFAULT).forEach((key) => {
        if (typeof parsed?.[key] === "boolean") {
          adminActiveColumns[key] = parsed[key];
        }
      });
    } catch (error) {
      console.error("Failed to parse saved admin columns:", error);
    }
  };

  const applyAdminColumnVisibility = () => {
    const table = document.querySelector("#view-panel .data-table");
    if (!table) return;

    Object.entries(adminActiveColumns).forEach(([columnKey, isVisible]) => {
      table.querySelectorAll(`[data-col="${columnKey}"]`).forEach((cell) => {
        cell.style.display = isVisible ? "" : "none";
      });
    });
  };

  const syncAdminColumnInputs = () => {
    document
      .querySelectorAll('#admin-settings-columns-list input[data-column-key]')
      .forEach((input) => {
        const columnKey = input.getAttribute("data-column-key");
        if (!columnKey || !(columnKey in adminActiveColumns)) return;
        input.checked = adminActiveColumns[columnKey];
      });
  };

  const initAdminColumnControls = () => {
    document
      .querySelectorAll('#admin-settings-columns-list input[data-column-key]')
      .forEach((input) => {
        input.addEventListener("change", () => {
          const columnKey = input.getAttribute("data-column-key");
          if (!columnKey || !(columnKey in adminActiveColumns)) return;
          adminActiveColumns[columnKey] = input.checked;
          saveAdminColumnsToStorage();
          applyAdminColumnVisibility();
        });
      });
  };

  const loadAdminSortFromStorage = () => {
    const saved = localStorage.getItem("adminSort");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const resolvedBy = parsed.by && parsed.by !== "" ? parsed.by : adminActiveSort.by;
        const resolvedOrder =
          parsed.order && parsed.order !== "" ? parsed.order : adminActiveSort.order;
        adminActiveSort = { ...adminActiveSort, by: resolvedBy, order: resolvedOrder };
      } catch (e) {
        console.error("Failed to parse saved admin sort:", e);
      }
    }
  };

  const updateAdminButtonStates = () => {
    const adminFilterToggleBtn = document.getElementById(
      "admin-filter-toggle-btn",
    );
    const adminSortToggleBtn = document.getElementById("admin-sort-toggle-btn");

    const isFilterActive =
      adminActiveFilters.taNumber ||
      adminActiveFilters.employee ||
      (adminActiveFilters.year &&
        adminActiveFilters.year !== new Date().getFullYear().toString()) ||
      adminActiveFilters.travelDate ||
      adminActiveFilters.matchAll === false;

    const isSortActive =
      adminActiveSort.by !== "ta" || adminActiveSort.order !== "desc";

    if (adminFilterToggleBtn) {
      if (isFilterActive) {
        adminFilterToggleBtn.classList.add("active");
      } else {
        adminFilterToggleBtn.classList.remove("active");
      }
    }

    if (adminSortToggleBtn) {
      if (isSortActive) {
        adminSortToggleBtn.classList.add("active");
      } else {
        adminSortToggleBtn.classList.remove("active");
      }
    }
  };

  const showToast = (message, type = "success", duration = 2600) => {
    if (!toast) return;
    toast.textContent = message;

    toast.classList.remove(
      "toast--success",
      "toast--info",
      "toast--warning",
      "toast--error",
    );

    toast.classList.add(`toast--${type}`);
    toast.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    if (duration > 0)
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, duration);
  };
  // Expose for upload.js
  window.showToast = showToast;
  window.adminShowToast = showToast;
  const openStoredFile = createFileOpener({ showToast, notifyCompressed: true });

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
  window.adminShowConfirmation = showConfirmation;
  window.adminShowAlert = showAlertModal;
  window.showAppAlert = showAlertModal;

  window.flatpickr(updateTravelDateInput, {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    static: false,
    monthSelectorType: "static",
    position: "auto center",
  });

  window.flatpickr(updateTravelUntilInput, {
    dateFormat: "Y-m-d",
    allowInput: true,
    disableMobile: true,
    static: false,
    monthSelectorType: "static",
    position: "auto center",
  });

  const applyAdminClientFilters = (rows) => {

    if (
      !adminActiveFilters.taNumber &&
      !adminActiveFilters.employee &&
      !adminActiveFilters.year &&
      !adminActiveFilters.travelDate
    ) {
      return rows;
    }

    return rows.filter((row) => {
      const checks = [];

      if (adminActiveFilters.taNumber) {
        const matchesTa =
          row.ta_number &&
          row.ta_number
            .toLowerCase()
            .includes(adminActiveFilters.taNumber.toLowerCase());
        checks.push(matchesTa);
      }

      // Check Employee filter (contains match for comma-separated values)
      if (adminActiveFilters.employee) {
        const matchesEmployee =
          row.employees &&
          row.employees
            .toLowerCase()
            .includes(adminActiveFilters.employee.toLowerCase());
        checks.push(matchesEmployee);
      }

      if (adminActiveFilters.year) {
        const matchesYear =
          row.travel_date &&
          row.travel_date.startsWith(adminActiveFilters.year);
        checks.push(matchesYear);
      }

      if (adminActiveFilters.travelDate) {
        const matchesDate =
          row.travel_date && row.travel_date === adminActiveFilters.travelDate;
        checks.push(matchesDate);
      }

      // Return based on match mode (AND or OR)
      if (adminActiveFilters.matchAll) {

        return checks.every((check) => check === true);
      } else {

        return checks.some((check) => check === true);
      }
    });
  };

  const applyAdminClientSorting = (rows) => {
    if (!adminActiveSort.by) {
      return rows;
    }

    const sorted = [...rows].sort((a, b) => {
      let aVal, bVal;

      if (adminActiveSort.by === "ta") {
        aVal = a.ta_number || "";
        bVal = b.ta_number || "";
      } else if (adminActiveSort.by === "travel-date") {
        aVal = a.travel_date || "";
        bVal = b.travel_date || "";
      }

      if (adminActiveSort.order === "asc") {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });

    return sorted;
  };

  const buildAdminRowHtml = (row, batchIndex) => {
    const shouldAnimateRows = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
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
    const isDemoClass = row.is_demo ? " is-demo" : "";
    const rowClass = (
      isDemoClass + (shouldAnimateRows ? " row-enter" : "")
    ).trim();
    const rowStyle = shouldAnimateRows
      ? ` style="--row-enter-delay:${Math.min(batchIndex * 22, 220)}ms;"`
      : "";

    let employeesText = row.employees || "-";
    if (employeesText !== "-") {
      const employeeArray = parseEmployeeNames(employeesText);
      if (employeeArray.length > 2) {
        employeesText = employeeArray.slice(0, 2).join(", ") + "...";
      }
    }

    return `
            <tr data-id="${escapeHtml(row.id)}" class="${rowClass}"${rowStyle}>
                <td>
                    <button class="view-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="View details">
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
                        ? `<a class="file-link open-file-link" href="${fileUrl}" data-file-url="${fileUrl}" data-file-name="${escapeHtml(safeName)}" target="_blank" rel="noopener">${escapeHtml(displayName)}</a>`
                        : `<span class="file-not-ready">Unavailable</span>`
                    }
                </td>
                <td class="actions-cell">
                    <button class="update-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="Update" title="Update">
                        <svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true" focusable="false">
                            <path d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z" />
                        </svg>
                    </button>
                    ${
                      window.adminCurrentRole === "super" ||
                      window.adminCurrentControl >= 2
                        ? `
                    <button class="delete-btn icon-btn" data-id="${escapeHtml(row.id)}" aria-label="Delete" title="Delete">
                        <svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true" focusable="false">
                            <path d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z" />
                        </svg>
                    </button>`
                        : ""
                    }
                </td>
            </tr>
        `;
  };

  const bindAdminRowEvents = (trs) => {
    trs.forEach((tr) => {
      const deleteBtn = tr.querySelector(".delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          const row = e.target.closest("tr");
          const recordId = (row?.getAttribute("data-id") || "").trim();
          const record = recordCache.get(recordId);
          deleteRecordData = {
            id: recordId,
            file_url: record?.file_url || "",
          };
          deleteModal.classList.add("show");
        });
      }

      const updateBtn = tr.querySelector(".update-btn");
      if (updateBtn) {
        updateBtn.addEventListener("click", (e) => {
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
            is_demo: record.is_demo || false,
          };

          updateTaInput.value = record.ta_number || "";
          updatePurposeInput.value = record.purpose || "";
          updateDestinationInput.value = record.destination || "";
          autoResizeUpdateTextarea(updatePurposeInput);
          autoResizeUpdateTextarea(updateDestinationInput);
          updateTravelDateInput.value = record.travel_date || "";
          updateTravelUntilInput.value = record.travel_until || "";
          updateScanFileInput.value = "";
          if (updateIsDemoCheckbox)
            updateIsDemoCheckbox.checked = record.is_demo || false;

          updateSelectedEmployees.length = 0;
          if (record.employees) {
            const employeeNames = parseEmployeeNames(record.employees);
            updateSelectedEmployees.push(...employeeNames);
          }
          getUpdateEmployeesMultiSelect().updateDisplay();
          getUpdateEmployeesMultiSelect().renderOptions();

          updateStatus.textContent = "";
          updateStatus.classList.remove("status--error");
          updateStatus.classList.add("hidden");

          updateModal.classList.add("show");
        });
      }

      const openFileLink = tr.querySelector(".open-file-link");
      if (openFileLink) {
        openFileLink.addEventListener("click", async (e) => {
          e.preventDefault();
          const fileUrl =
            e.currentTarget?.getAttribute("data-file-url") ||
            e.currentTarget?.getAttribute("href") ||
            "";
          const fileName =
            e.currentTarget?.getAttribute("data-file-name") || "Download";
          await openStoredFile(fileUrl, fileName, e.currentTarget);
        });
      }

      const viewBtn = tr.querySelector(".view-btn");
      if (viewBtn) {
        viewBtn.addEventListener("click", (e) => {
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
          document.getElementById("view-edit-btn")._currentRecordId = recordId;
        });
      }
    });
  };

  const renderViewRows = (rows) => {
    const filteredRows = applyAdminClientFilters(rows);
    adminCurrentDisplayRows = applyAdminClientSorting(filteredRows);

    recordCache.clear();
    adminCurrentDisplayRows.forEach((row) => {
      recordCache.set(String(row.id), row);
    });

    adminRenderedCount = renderRecordBatch({
      body: viewBody, sentinel: viewMoreBtn, rows: adminCurrentDisplayRows, batchSize: ADMIN_LAZY_BATCH_SIZE,
      buildRow: (row, _globalIndex, batchIndex) => buildAdminRowHtml(row, batchIndex),
      applyColumnVisibility: applyAdminColumnVisibility, bindRowEvents: bindAdminRowEvents,
    });
  };

  const loadMoreAdminRows = () => {
    if (recordsLoader.loading || adminRenderedCount >= adminCurrentDisplayRows.length) return;
    adminRenderedCount = renderRecordBatch({
      body: viewBody, sentinel: viewMoreBtn, rows: adminCurrentDisplayRows, batchSize: ADMIN_LAZY_BATCH_SIZE,
      from: adminRenderedCount, append: true,
      buildRow: (row, _globalIndex, batchIndex) => buildAdminRowHtml(row, batchIndex),
      applyColumnVisibility: applyAdminColumnVisibility, bindRowEvents: bindAdminRowEvents,
    });
    updateViewFooter();
  };

  // Set up modal event listeners (only once, not on every render)
  viewFileLink.addEventListener("click", async (e) => {
    e.preventDefault();
    const fileUrl =
      viewFileLink.dataset.fileUrl || viewFileLink.getAttribute("href") || "";
    const fileName =
      viewFileLink.dataset.fileName || viewFileLink.textContent || "Open file";
    if (!fileUrl || fileUrl === "#") return;
    await openStoredFile(fileUrl, fileName, viewFileLink);
  });

  document.getElementById("view-edit-btn").addEventListener("click", () => {
    const recordId = document.getElementById("view-edit-btn")._currentRecordId;
    const record = recordCache.get(recordId);
    if (!recordId || !record) return;

    viewModal.classList.remove("show");
    document.body.style.overflow = "";

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
      is_demo: record.is_demo || false,
    };

    updateTaInput.value = record.ta_number || "";
    updatePurposeInput.value = record.purpose || "";
    updateDestinationInput.value = record.destination || "";
    autoResizeUpdateTextarea(updatePurposeInput);
    autoResizeUpdateTextarea(updateDestinationInput);
    updateTravelDateInput.value = record.travel_date || "";
    updateTravelUntilInput.value = record.travel_until || "";
    updateScanFileInput.value = "";
    if (updateIsDemoCheckbox)
      updateIsDemoCheckbox.checked = record.is_demo || false;

    updateSelectedEmployees.length = 0;
    if (record.employees) {
      const employeeNames = parseEmployeeNames(record.employees);
      updateSelectedEmployees.push(...employeeNames);
    }
    getUpdateEmployeesMultiSelect().updateDisplay();
    getUpdateEmployeesMultiSelect().renderOptions();

    updateStatus.textContent = "";
    updateStatus.classList.remove("status--error");
    updateStatus.classList.add("hidden");

    updateModal.classList.add("show");
  });

  const updateViewFooter = () => {
    const totalFiltered = adminCurrentDisplayRows.length;
    viewStatus.textContent = `Showing ${adminRenderedCount} of ${totalFiltered}`;
  };

  const recordsLoader = createRecordsLoader({
    onStart: (reset) => {
      if (reset) {
        viewRows = [];
        adminCurrentDisplayRows = [];
        adminRenderedCount = 0;
        if (viewMoreBtn) viewMoreBtn.style.display = "none";
        viewBody.innerHTML = '<tr><td colspan="8">Loading records...</td></tr>';
      }

      viewStatus.textContent = "Fetching travel authorities.";
    },
    fetchRecords: () => supabase
        .from("travel_authorities")
        .select(
          "id, ta_number, purpose, destination, employees, travel_date, travel_until, file_name, file_url, created_at, is_demo",
        )
        .order("created_at", { ascending: false }),
    onLoaded: async (rows) => {
      viewRows = rows;
      latestKnownTimestamp = viewRows[0]?.created_at || latestKnownTimestamp;
      const adminLastUpdated = document.getElementById("admin-last-updated");
      if (adminLastUpdated && latestKnownTimestamp) {
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
        adminLastUpdated.textContent = `Last record added ${rel}`;
      }
      renderViewRows(viewRows);
      updateViewFooter();
      await populateAdminYearFilter();
    },
    onError: (error) => {
      console.error("View load error:", error);
      viewBody.innerHTML =
        '<tr><td colspan="9">Unable to load records.</td></tr>';
      viewStatus.textContent = "Failed to load travel authorities.";
    },
  });
  const loadTravelAuthorities = (reset = false) => recordsLoader.load(reset);

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
    const wrap = document.querySelector("#view-panel .table-wrap");
    if (!wrap) return;
    let fadeTimer;
    wrap.addEventListener(
      "scroll",
      () => {
        wrap.classList.add("is-scrolling");
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(
          () => wrap.classList.remove("is-scrolling"),
          1000,
        );
      },
      { passive: true },
    );
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
      .channel("travel_authorities_admin_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "travel_authorities",
        },
        (payload) => {
          // Check if this is from the admin's own recent action
          const now = Date.now();
          const timeSinceUpload = now - window.adminRecentUploadTimestamp;
          const timeSinceUpdate = now - window.adminRecentUpdateTimestamp;
          const timeSinceDelete = now - window.adminRecentDeleteTimestamp;

          const isOwnUpload =
            payload.eventType === "INSERT" && timeSinceUpload < 3000;
          const isOwnUpdate =
            payload.eventType === "UPDATE" && timeSinceUpdate < 3000;
          const isOwnDelete =
            payload.eventType === "DELETE" && timeSinceDelete < 3000;

          if (isOwnUpload || isOwnUpdate || isOwnDelete) {
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

          const adminRefreshBtnEl =
            document.getElementById("admin-refresh-btn");
          if (adminRefreshBtnEl) {
            adminRefreshBtnEl.classList.add("has-new-data");
          }

          showToast(`${message} - Click Reload to refresh`, "info", 30000);
        },
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
    const confirmUndemoBtn = document.getElementById(
      "confirm-undemo-disclaimer",
    );

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

  // Infinite scroll: auto-load more rows when sentinel scrolls into view
  if (viewMoreBtn) {
    const adminTableWrap = document.querySelector("#view-panel .table-wrap");
    const adminLazyObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreAdminRows();
      },
      { threshold: 0.1, root: adminTableWrap },
    );
    adminLazyObserver.observe(viewMoreBtn);
  }

  closeViewBtn.addEventListener("click", () => {
    viewModal.classList.remove("show");
    document.body.style.overflow = "";
  });

  // Refresh button
  const adminRefreshBtn = document.getElementById("admin-refresh-btn");
  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", () => {
      adminRefreshBtn.classList.remove("has-new-data");
      if (toastTimer) clearTimeout(toastTimer);
      if (toast) toast.classList.remove("show");
      loadTravelAuthorities(true);
    });
  }

  // Admin filter panel functionality
  const adminFilterToggleBtn = document.getElementById(
    "admin-filter-toggle-btn",
  );
  const adminFilterPanel = document.getElementById("admin-filter-panel");
  const adminApplyFilterBtn = document.getElementById("admin-apply-filter-btn");
  const adminClearFilterBtn = document.getElementById("admin-clear-filter-btn");
  const adminFilterTaNumberInput = document.getElementById(
    "admin-ta-number-search",
  );
  const adminFilterEmployeeInput = document.getElementById(
    "admin-filter-employee",
  );
  const adminFilterYearSelect = document.getElementById("admin-filter-year");
  const adminFilterTravelDateInput = document.getElementById(
    "admin-filter-travel-date",
  );
  const adminFilterMatchAllCheckbox = document.getElementById(
    "admin-filter-match-all",
  );
  initAdminColumnControls();

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
  const adminFilterEmployeeDropdown = document.getElementById(
    "admin-filter-employee-autocomplete",
  );

  const setAdminFilterEmpDropdownVisible = (visible) => {
    if (adminFilterEmployeeDropdown)
      adminFilterEmployeeDropdown.style.display = visible ? "block" : "none";
  };

  const showAdminFilterEmpSuggestions = (inputValue) => {
    if (!adminFilterEmployeeDropdown) return;
    const trimmed = inputValue.toLowerCase().trim();
    if (!trimmed) {
      setAdminFilterEmpDropdownVisible(false);
      return;
    }

    const matches = adminEmployeesListForFilter
      .filter((emp) => emp.name.toLowerCase().includes(trimmed))
      .slice(0, 10);

    if (matches.length === 0) {
      adminFilterEmployeeDropdown.innerHTML =
        '<div class="autocomplete-no-options">No officials found</div>';
      setAdminFilterEmpDropdownVisible(true);
      return;
    }

    adminFilterEmployeeDropdown.innerHTML = matches
      .map((emp, i) => {
        const badge =
          emp.is_active === false
            ? ' <span class="inactive-badge">Inactive</span>'
            : "";
        return `<div class="autocomplete-item" data-value="${escapeHtml(emp.name)}" data-index="${i}">${escapeHtml(emp.name)}${badge}</div>`;
      })
      .join("");
    setAdminFilterEmpDropdownVisible(true);

    adminFilterEmployeeDropdown
      .querySelectorAll(".autocomplete-item")
      .forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          adminFilterEmployeeInput.value = item.getAttribute("data-value");
          setAdminFilterEmpDropdownVisible(false);
        });
        item.addEventListener("mouseenter", () => {
          adminFilterEmployeeDropdown
            .querySelectorAll(".autocomplete-item")
            .forEach((i) => i.classList.remove("highlighted"));
          item.classList.add("highlighted");
        });
      });
  };

  if (adminFilterEmployeeInput) {
    adminFilterEmployeeInput.addEventListener("input", () =>
      showAdminFilterEmpSuggestions(adminFilterEmployeeInput.value),
    );
    adminFilterEmployeeInput.addEventListener("focus", () => {
      if (adminFilterEmployeeInput.value.length > 0)
        showAdminFilterEmpSuggestions(adminFilterEmployeeInput.value);
    });
    adminFilterEmployeeInput.addEventListener("keydown", (e) => {
      const items = adminFilterEmployeeDropdown
        ? adminFilterEmployeeDropdown.querySelectorAll(".autocomplete-item")
        : [];
      if (!items.length) return;
      const highlighted = adminFilterEmployeeDropdown.querySelector(
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
          adminFilterEmployeeInput.value =
            highlighted.getAttribute("data-value");
          setAdminFilterEmpDropdownVisible(false);
        }
      } else if (e.key === "Escape") {
        setAdminFilterEmpDropdownVisible(false);
      }
    });
  }

  document.addEventListener("click", (e) => {
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
      adminFilterYearSelect.innerHTML =
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

  adminFilterTaNumberInput.addEventListener("input", () => {
    const formatted = formatTaNumber(adminFilterTaNumberInput.value);
    adminFilterTaNumberInput.value = formatted;
    const isComplete = /^\d{4}-\d{2}-\d{4}$/.test(formatted);
    if (!isComplete && formatted !== "") return; // partial — wait for more digits
    if (formatted === (adminActiveFilters.taNumber || "")) return; // no effective change
    adminFilterTaNumberInput.classList.toggle("is-matched", isComplete);
    adminActiveFilters.taNumber = formatted;
    saveAdminFiltersToStorage();
    renderViewRows(viewRows);
    updateViewFooter();
    updateAdminButtonStates();
  });

  // Initialize flatpickr for admin date filter
  window.flatpickr(adminFilterTravelDateInput, {
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

        const yearOption = Array.from(adminFilterYearSelect.options).find(
          (opt) => opt.value === selectedYear,
        );
        if (yearOption) {
          adminFilterYearSelect.value = selectedYear;
        } else {
          // Year not available in records, set to "No selection"
          adminFilterYearSelect.value = "";
        }
      }
    },
  });

  adminFilterToggleBtn.addEventListener("click", () => {
    adminFilterPanel.classList.toggle("show");
    if (!adminFilterPanel.classList.contains("show"))
      setAdminFilterEmpDropdownVisible(false);
  });

  adminApplyFilterBtn.addEventListener("click", () => {
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
    adminFilterTaNumberInput.classList.remove("is-matched");
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
    adminActiveSort.by = "ta";
    adminActiveSort.order = "desc";
    adminSortBySelect.value = "ta";
    adminSortOrderSelect.value = "desc";
    saveAdminSortToStorage();
    updateAdminButtonStates();
    renderViewRows(viewRows);
    updateViewFooter();
  });

  // Close admin filter and sort panels when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !adminFilterPanel.contains(e.target) &&
      !adminFilterToggleBtn.contains(e.target) &&
      adminFilterPanel.classList.contains("show")
    ) {
      adminFilterPanel.classList.remove("show");
    }
    if (
      !adminSortPanel.contains(e.target) &&
      !adminSortToggleBtn.contains(e.target) &&
      adminSortPanel.classList.contains("show")
    ) {
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
    yearCheckboxes.forEach((cb) => (cb.checked = false));
  };

  let availableYearsForExport = [];

  // Populate export years from available data
  const populateExportYears = async () => {
    try {
      const { data, error } = await supabase
        .from("travel_authorities")
        .select("travel_date");

      if (error) throw error;

      const yearsSet = new Set();
      data.forEach((record) => {
        if (record.travel_date) {
          const year = new Date(record.travel_date).getFullYear();
          yearsSet.add(year);
        }
      });

      availableYearsForExport = Array.from(yearsSet).sort((a, b) => b - a);

      exportYearsList.innerHTML = availableYearsForExport
        .map(
          (year) => `
            <label class="checkbox-label">
                <input type="checkbox" class="export-year-checkbox" value="${escapeHtml(String(year))}">
                <span>${escapeHtml(String(year))}</span>
            </label>
        `,
        )
        .join("");
    } catch (error) {
      console.error("Error populating export years:", error);
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
    yearCheckboxes.forEach((cb) => (cb.checked = e.target.checked));
  });

  confirmExportBtn.addEventListener("click", async () => {
    try {
      exportStatus.textContent = "Preparing export...";
      exportStatus.classList.remove("hidden", "status--error");

      const selectedYears = [];
      if (exportAllYearsCheckbox.checked) {
        selectedYears.push(...availableYearsForExport);
      } else {
        const yearCheckboxes = document.querySelectorAll(
          ".export-year-checkbox:checked",
        );
        yearCheckboxes.forEach((cb) => selectedYears.push(parseInt(cb.value)));
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
        .select(
          "ta_number, purpose, destination, employees, travel_date, travel_until, is_demo",
        )
        .eq("is_demo", false)
        .order("travel_date", { ascending: false });

      if (error) throw error;

      // Filter by selected years
      const filteredData = data.filter((record) => {
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

      const exportData = filteredData.map((record) => ({
        "TA Number": record.ta_number || "",
        Purpose: record.purpose || "",
        Destination: record.destination || "",
        Employees: Array.isArray(record.employees)
          ? record.employees.join(", ")
          : record.employees || "",
        "Travel Date": record.travel_date || "",
        "Travel End": record.travel_until || "",
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      ws["!cols"] = [
        { wch: 15 }, // TA Number
        { wch: 30 }, // Purpose
        { wch: 20 }, // Destination
        { wch: 30 }, // Employees
        { wch: 12 }, // Travel Date
        { wch: 12 }, // Travel End
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Travel Authorities");

      // Generate filename with selected years
      const yearRange =
        selectedYears.length === availableYearsForExport.length
          ? "All_Years"
          : selectedYears.sort().join("_");
      const filename = `Travel_Authorities_${yearRange}_${new Date().toISOString().split("T")[0]}.xlsx`;

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
    if (
      !exportPanel.contains(e.target) &&
      !exportBtn.contains(e.target) &&
      exportPanel.classList.contains("show")
    ) {
      exportPanel.classList.remove("show");
      resetExportPanel();
    }
  });

  confirmDeleteBtn.addEventListener("click", async () => {
    if (!deleteRecordData || !deleteRecordData.id) return;

    try {
      viewStatus.textContent = "Deleting record...";

      // Record the action timestamp before the database request to suppress duplicate realtime notifications.
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
          const pathParts = url.pathname.split("/ta-files/");
          if (pathParts.length > 1) {
            const filePath = decodeURIComponent(pathParts[1]);

            const { error: storageError } = await supabase.storage
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

    if (
      !taNumber ||
      !purpose ||
      !destination ||
      !travelDate ||
      updateSelectedEmployees.length === 0
    ) {
      updateStatus.textContent = "Please fill in all required fields.";
      updateStatus.classList.add("status--error");
      updateStatus.classList.remove("status--shake", "hidden");
      void updateStatus.offsetWidth;
      updateStatus.classList.add("status--shake");
      return;
    }

    if (!isValidTaNumber(taNumber)) {
      updateStatus.textContent =
        "TA Number must be in the format 0000-00-0000.";
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

      if (checkError && checkError.code !== "PGRST116") {
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
      updateStatus.textContent =
        error.message || "Failed to validate TA number.";
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

    const hasAnyChange =
      hasFileChange ||
      hasTaNumberChange ||
      hasPurposeChange ||
      hasDestinationChange ||
      hasEmployeesChange ||
      hasTravelDateChange ||
      hasTravelUntilChange ||
      hasIsDemoChange;

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

      // Record the action timestamp before the database request to suppress duplicate realtime notifications.
      window.adminRecentUpdateTimestamp = Date.now();

      let fileUrl = updateRecordData.file_url || "";
      let fileName = updateRecordData.file_name || "";
      // Ensure both values are formatted consistently before comparing
      const taNumberChanged =
        formatTaNumber(taNumber) !== formatTaNumber(updateRecordData.ta_number);

      if (updateScanFileInput.files.length > 0) {
        // Validate and process files (PDF or images)
        updateStatus.textContent = "Processing files...";

        const processedFile = await window.validateAndProcessFiles(
          updateScanFileInput,
          taNumber,
        );
        const preparedUpload = window.prepareFileForStorage
          ? await window.prepareFileForStorage(processedFile, taNumber)
          : {
              storageFile: processedFile,
              extension: processedFile.name.substring(
                processedFile.name.lastIndexOf("."),
              ),
              compressed: false,
              originalSize: processedFile.size,
              storedSize: processedFile.size,
            };
        const processedSizeMB = (
          preparedUpload.storedSize /
          1024 /
          1024
        ).toFixed(2);

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
            const pathParts = url.pathname.split("/ta-files/");
            if (pathParts.length > 1) {
              const oldFilePath = decodeURIComponent(pathParts[1]);
              await supabase.storage.from("ta-files").remove([oldFilePath]);
            }
          } catch (e) {
            // Ignore deletion errors - file might not exist
          }
        }

        const { error: uploadError } = await supabase.storage
          .from("ta-files")
          .upload(filePath, preparedUpload.storageFile, { upsert: false });

        if (uploadError) {
          throw new Error(
            `Storage upload failed: ${uploadError.message || "Unknown error"}`,
          );
        }

        const { data: publicUrlData } = supabase.storage
          .from("ta-files")
          .getPublicUrl(filePath);

        fileUrl = publicUrlData.publicUrl;
        fileName = newFileName;
      } else if (taNumberChanged && updateRecordData.file_url) {
        // TA number changed but no new file uploaded - rename existing file
        updateStatus.textContent = "Renaming file to match new TA number...";

        try {
          const url = new URL(updateRecordData.file_url);
          const pathParts = url.pathname.split("/ta-files/");
          if (pathParts.length > 1) {
            const oldFilePath = decodeURIComponent(pathParts[1]);

            const { data: fileData, error: downloadError } =
              await supabase.storage.from("ta-files").download(oldFilePath);

            if (downloadError) {
              console.warn(
                "Could not download old file for renaming:",
                downloadError,
              );
            } else {
              // Upload with new TA number name and timestamp
              const safeTa = taNumber.replace(/[^a-z0-9-_]/gi, "_");
              const safeDate = travelDate.replace(/[^0-9-]/g, "-");
              const existingFileName = updateRecordData.file_name || "";
              const extensionMatch = existingFileName.match(
                /(\.pdf\.gz|\.pdf|\.png|\.jpe?g|\.gz)$/i,
              );
              const fileExtension = extensionMatch
                ? extensionMatch[1]
                : existingFileName.substring(existingFileName.lastIndexOf("."));
              const timestamp = Date.now();
              const newFileName = `${taNumber}_${timestamp}${fileExtension}`;
              const newFilePath = `travel-authorities/${safeTa}/${safeDate}/${newFileName}`;

              const { error: uploadError } = await supabase.storage
                .from("ta-files")
                .upload(newFilePath, fileData, { upsert: false });

              if (uploadError) {
                console.warn("Could not upload renamed file:", uploadError);
              } else {

                const { data: publicUrlData } = supabase.storage
                  .from("ta-files")
                  .getPublicUrl(newFilePath);

                fileUrl = publicUrlData.publicUrl;
                fileName = newFileName;

                // Delete old file
                const { error: deleteError } = await supabase.storage
                  .from("ta-files")
                  .remove([oldFilePath]);

                if (deleteError) {
                  console.warn(
                    "Could not delete old file after rename:",
                    deleteError,
                  );
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
          province: window.classifyDestinationProvince?.(destination) ?? "Others",
          employees: employees,
          travel_date: travelDate,
          travel_until: travelUntil,
          file_name: fileName,
          file_url: fileUrl,
          is_demo: isDemo,
        })
        .eq("id", updateRecordData.id)
        .select();

      if (updateError) {
        // Check for duplicate TA number error
        if (
          updateError.code === "23505" ||
          updateError.message?.includes("duplicate key") ||
          updateError.message?.includes("unique constraint")
        ) {
          throw new Error(
            `TA Number ${taNumber} already exists in the database.`,
          );
        }
        throw new Error(
          `Database update failed: ${updateError.message || "Unknown error"}`,
        );
      }

      updateModal.classList.remove("show");
      updateRecordData = null;
      viewStatus.textContent = "Record updated successfully.";

      showToast("Update saved.", "success");
      await loadTravelAuthorities(true);
    } catch (error) {
      console.error("Update error:", error);
      const message =
        error && error.message ? error.message : "Please try again.";
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
      document.body.style.overflow = "";
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
      localStorage.setItem(
        "autoClearFields",
        autoClearCheckbox.checked.toString(),
      );
    });
  }

  // Load employees for admin filter (must be called inside viewPanelLoaded scope)
  // Delay restoring persisted table state until auth is fully resolved.
  const restoreAdminTableState = () => {
    loadAdminFiltersFromStorage();
    loadAdminSortFromStorage();
    loadAdminColumnsFromStorage();
    syncAdminColumnInputs();
    applyAdminColumnVisibility();

    if (adminFilterTaNumberInput) {
      adminFilterTaNumberInput.value = adminActiveFilters.taNumber || "";
      adminFilterTaNumberInput.classList.toggle(
        "is-matched",
        /^\d{4}-\d{2}-\d{4}$/.test(adminActiveFilters.taNumber || ""),
      );
    }
    if (adminFilterEmployeeInput)
      adminFilterEmployeeInput.value = adminActiveFilters.employee || "";
    if (adminFilterYearSelect)
      adminFilterYearSelect.value = adminActiveFilters.year || "";
    if (adminFilterTravelDateInput)
      adminFilterTravelDateInput.value = adminActiveFilters.travelDate || "";
    if (adminFilterMatchAllCheckbox)
      adminFilterMatchAllCheckbox.checked =
        adminActiveFilters.matchAll !== undefined
          ? adminActiveFilters.matchAll
          : true;

    if (adminSortBySelect) adminSortBySelect.value = adminActiveSort.by || "ta";
    if (adminSortOrderSelect)
      adminSortOrderSelect.value = adminActiveSort.order || "desc";

    loadAdminEmployeesForFilter();

    // Update button states after a short delay to ensure DOM is ready
    setTimeout(() => {
      updateAdminButtonStates();
    }, 100);
  };

  if (window.adminCurrentRole) {
    restoreAdminTableState();
  } else {
    window.addEventListener("admin-role-ready", restoreAdminTableState, {
      once: true,
    });
  }
};
