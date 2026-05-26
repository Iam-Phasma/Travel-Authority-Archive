// Official Management Module

window.initEmployeeManagement = (supabase) => {
  // Get references to required functions and variables from parent scope
  const showToast =
    window.adminShowToast ||
    function (msg) {
      console.log("Toast:", msg);
    };
  const showConfirmation =
    window.adminShowConfirmation ||
    function (title, msg) {
      return Promise.resolve(confirm(msg));
    };
  const getEmployeesList = () => window.adminEmployeesList || [];
  const setEmployeesList = (list) => {
    window.adminEmployeesList = list;
  };
  const renderEmployeesOptions =
    window.adminRenderEmployeesOptions || function () {};
  const renderUpdateEmployeesOptions =
    window.adminRenderUpdateEmployeesOptions || function () {};
  const getAdminEmployeesListForFilter = () =>
    window.adminEmployeesListForFilter || [];
  const setAdminEmployeesListForFilter = (list) => {
    window.adminEmployeesListForFilter = list;
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

  // Employee Management Functionality
  const employeeNameInput = document.getElementById("employee-name");
  const employeePositionInput = document.getElementById("employee-position");
  const employeePositionSuggestions = document.getElementById(
    "employee-position-suggestions",
  );
  const employeeOfficeInput = document.getElementById("employee-office");
  const employeeOfficeSuggestions = document.getElementById(
    "employee-office-suggestions",
  );
  const addEmployeeBtn = document.getElementById("add-employee-btn");
  const employeeStatus = document.getElementById("employee-status");
  const employeeListContainer = document.getElementById("employee-list");
  const employeeSummaryContainer = document.getElementById("employee-summary");
  const employeeSearchInput = document.getElementById("employee-search");
  const employeePositionFilter = document.getElementById(
    "employee-position-filter",
  );
  const employeeStatusFilter = document.getElementById(
    "employee-status-filter",
  );
  const employeeOfficeFilter = document.getElementById("employee-office-filter");
  const employeeSortStatusSelect = document.getElementById("employee-sort-status");
  const employeeSortOrderSelect = document.getElementById(
    "employee-sort-order",
  );
  const employeeFilterToggleBtn = document.getElementById(
    "employee-filter-toggle-btn",
  );
  const employeeFilterPanel = document.getElementById("employee-filter-panel");
  const employeeSortToggleBtn = document.getElementById(
    "employee-sort-toggle-btn",
  );
  const employeeSortPanel = document.getElementById("employee-sort-panel");
  const employeeApplyFilterBtn = document.getElementById(
    "employee-apply-filter-btn",
  );
  const employeeClearFilterBtn = document.getElementById(
    "employee-clear-filter-btn",
  );
  const employeeApplySortBtn = document.getElementById(
    "employee-apply-sort-btn",
  );
  const employeeClearSortBtn = document.getElementById(
    "employee-clear-sort-btn",
  );
  let activeEmpFilters = { position: "", status: "", office: "" };
  let activeEmpSort = { order: "az", status: "active-first" };
  let allEmployeesData = []; // Store all employees for filtering
  let allEmployeesCache = []; // Always holds the full unfiltered list
  const deleteEmployeeModal = document.getElementById("delete-employee-modal");
  const cancelDeleteEmployeeBtn = document.getElementById(
    "cancel-delete-employee",
  );
  const confirmDeleteEmployeeBtn = document.getElementById(
    "confirm-delete-employee",
  );
  const editEmployeeModal = document.getElementById("edit-employee-modal");
  const editEmployeeNameInput = document.getElementById("edit-employee-name");
  const editEmployeePositionInput = document.getElementById(
    "edit-employee-position",
  );
  const editEmployeeOfficeInput = document.getElementById(
    "edit-employee-office",
  );
  const editEmployeeStatus = document.getElementById("edit-employee-status");
  const cancelEditEmployeeBtn = document.getElementById("cancel-edit-employee");
  const confirmEditEmployeeBtn = document.getElementById(
    "confirm-edit-employee",
  );
  const editEmployeeRecordsNote = document.getElementById(
    "edit-employee-records-note",
  );
  let editEmployeeNameWarningShown = false;
  let deleteEmployeeData = null;
  let editEmployeeData = null;

  const renderPositionSuggestions = (employees = []) => {
    if (!employeePositionSuggestions) return;

    const seen = new Set();
    const positions = [];

    (employees || []).forEach((emp) => {
      const position = String(emp?.position || "").trim();
      if (!position) return;
      const key = position.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      positions.push(position);
    });

    positions.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    employeePositionSuggestions.innerHTML = positions
      .map((position) => `<option value="${escapeHtml(position)}"></option>`)
      .join("");
  };

  const renderOfficeSuggestions = (employees = []) => {
    if (!employeeOfficeSuggestions) return;

    const seen = new Set();
    const offices = [];

    (employees || []).forEach((emp) => {
      const office = String(emp?.office || "").trim();
      if (!office) return;
      const key = office.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      offices.push(office);
    });

    offices.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    employeeOfficeSuggestions.innerHTML = offices
      .map((office) => `<option value="${escapeHtml(office)}"></option>`)
      .join("");
  };

  const renderPositionFilterOptions = (employees = []) => {
    if (!employeePositionFilter) return;

    const seen = new Set();
    const positions = [];

    (employees || []).forEach((emp) => {
      const position = String(emp?.position || "").trim();
      if (!position) return;
      const key = position.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      positions.push(position);
    });

    positions.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    const currentValue = employeePositionFilter.value;

    employeePositionFilter.innerHTML = [
      '<option value="">All Positions</option>',
      ...positions.map(
        (position) =>
          `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`,
      ),
    ].join("");

    if (
      currentValue &&
      positions.some(
        (position) => position.toLowerCase() === currentValue.toLowerCase(),
      )
    ) {
      const matched = positions.find(
        (position) => position.toLowerCase() === currentValue.toLowerCase(),
      );
      employeePositionFilter.value = matched || "";
    } else {
      employeePositionFilter.value = "";
    }
  };

  const renderOfficeFilterOptions = (employees = []) => {
    if (!employeeOfficeFilter) return;

    const seen = new Set();
    const offices = [];

    (employees || []).forEach((emp) => {
      const office = String(emp?.office || "").trim();
      if (!office) return;
      const key = office.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      offices.push(office);
    });

    offices.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const currentValue = employeeOfficeFilter.value;

    employeeOfficeFilter.innerHTML = [
      '<option value="">All Offices</option>',
      ...offices.map(
        (office) =>
          `<option value="${escapeHtml(office)}">${escapeHtml(office)}</option>`,
      ),
    ].join("");

    if (
      currentValue &&
      offices.some((office) => office.toLowerCase() === currentValue.toLowerCase())
    ) {
      const matched = offices.find((office) => office.toLowerCase() === currentValue.toLowerCase());
      employeeOfficeFilter.value = matched || "";
    } else {
      employeeOfficeFilter.value = "";
    }
  };

  const updateEmpButtonStates = () => {
    const isFilterActive = activeEmpFilters.position || activeEmpFilters.status || activeEmpFilters.office;
    const isSortActive = activeEmpSort.order !== "az" || activeEmpSort.status !== "active-first";
    if (employeeFilterToggleBtn)
      employeeFilterToggleBtn.classList.toggle("active", !!isFilterActive);
    if (employeeSortToggleBtn)
      employeeSortToggleBtn.classList.toggle("active", isSortActive);
  };

  const applyEmployeeFilters = () => {
    const searchTerm = (employeeSearchInput?.value || "").toLowerCase().trim();

    let filtered = allEmployeesCache.slice();

    if (searchTerm) {
      filtered = filtered.filter((emp) =>
        String(emp?.name || "")
          .toLowerCase()
          .includes(searchTerm),
      );
    }

    if (activeEmpFilters.position) {
      filtered = filtered.filter(
        (emp) =>
          String(emp?.position || "").toLowerCase() ===
          activeEmpFilters.position,
      );
    }

    if (activeEmpFilters.office) {
      filtered = filtered.filter(
        (emp) => String(emp?.office || "").toLowerCase() === activeEmpFilters.office,
      );
    }

    if (activeEmpFilters.status === "active") {
      filtered = filtered.filter((emp) => emp.is_active !== false);
    } else if (activeEmpFilters.status === "hidden") {
      filtered = filtered.filter((emp) => emp.is_active === false);
    }

    // Apply combined sorting: active/inactive status then name
    filtered.sort((a, b) => {
      const aActive = a.is_active !== false ? 1 : 0;
      const bActive = b.is_active !== false ? 1 : 0;

      if (activeEmpSort.status === "active-first") {
        if (aActive !== bActive) return bActive - aActive; // active (1) before inactive (0)
      } else if (activeEmpSort.status === "inactive-first") {
        if (aActive !== bActive) return aActive - bActive; // inactive (0) before active (1)
      }

      if (activeEmpSort.order === "az") {
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      }
      return String(b.name || "").localeCompare(String(a.name || ""), undefined, { sensitivity: "base" });
    });

    renderEmployeeList(filtered);
  };

  const renderEmployeeList = async (filteredData = null) => {
    try {
      if (filteredData === null) {
        employeeListContainer.innerHTML = `
              <div class="employee-table-header">
                <span class="employee-header-name">Name</span>
                <span class="employee-header-position">Position</span>
                <span class="employee-header-office">Office</span>
                <span class="employee-header-action">Actions</span>
              </div>
              <p class="loading-text">Loading officials...</p>
            `;
        if (employeeSummaryContainer) {
          employeeSummaryContainer.textContent =
            "Total: 0 | Active: 0 | Inactive: 0";
        }

          const { data, error } = await supabase
            .from("employee_list")
            .select("id, name, position, office, is_active")
          .order("is_active", { ascending: false })
          .order("name", { ascending: true });

        if (error) throw error;

        allEmployeesData = data || [];
        allEmployeesCache = allEmployeesData.slice(); // keep a full copy
      } else {
        allEmployeesData = filteredData;
      }

      renderPositionSuggestions(allEmployeesCache);
      renderOfficeSuggestions(allEmployeesCache);
      renderPositionFilterOptions(allEmployeesCache);
      renderOfficeFilterOptions(allEmployeesCache);

      if (!allEmployeesData || allEmployeesData.length === 0) {
        employeeListContainer.innerHTML = `
              <div class="employee-table-header">
                <span class="employee-header-name">Name</span>
                <span class="employee-header-position">Position</span>
                <span class="employee-header-office">Office</span>
                <span class="employee-header-action">Actions</span>
              </div>
              <p class="no-employees">No officials found.</p>
            `;
        if (employeeSummaryContainer) {
          employeeSummaryContainer.textContent =
            "Total: 0 | Active: 0 | Inactive: 0";
        }
        return;
      }

      const tableHeader = `
                <div class="employee-table-header">
                    <span class="employee-header-name">Name</span>
                    <span class="employee-header-position">Position</span>
                      <span class="employee-header-office">Office</span>
                    <span class="employee-header-action">Actions</span>
                </div>
            `;

      // Calculate employee counts
      const totalCount = allEmployeesData.length;
      const activeCount = allEmployeesData.filter(
        (emp) => emp.is_active !== false,
      ).length;
      const inactiveCount = totalCount - activeCount;

      const employeeItems = allEmployeesData
        .map((emp) => {
          // Ensure is_active is properly boolean (handle null/undefined)
          const isActive = emp.is_active !== false; // Default to true if null/undefined
          const inactiveClass = !isActive ? " employee-inactive" : "";
          const toggleIcon = !isActive
            ? '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/><path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>'
            : '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.933 13.909A4.357 4.357 0 0 1 3 12c0-1 4-6 9-6m7.6 3.8A5.068 5.068 0 0 1 21 12c0 1-3 6-9 6-.314 0-.62-.014-.918-.04M5 19 19 5m-4 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>';
          const toggleLabel = !isActive ? "Unhide official" : "Hide official";
          return `
                <div class="employee-item${inactiveClass}">
                    <span class="employee-name">${escapeHtml(emp.name)}</span>
                    <span class="employee-position">${escapeHtml(emp.position || "—")}</span>
                      <span class="employee-office">${escapeHtml(emp.office || "—")}</span>
                    <div class="employee-item-actions">
                        <button class="toggle-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" data-active="${isActive}" aria-label="${toggleLabel}" title="${toggleLabel}">
                            <svg class="icon-line" viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false">
                                ${toggleIcon}
                            </svg>
                        </button>
                        <button class="edit-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" data-position="${escapeHtml(emp.position || "")}" data-office="${escapeHtml(emp.office || "")}" aria-label="Update official" title="Update official">
                            <svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true" focusable="false">
                                <path d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z" />
                            </svg>
                        </button>
                        ${
                          window.adminCurrentRole === "super" ||
                          window.adminCurrentControl >= 2
                            ? `
                        <button class="delete-employee-btn icon-btn" data-id="${escapeHtml(emp.id)}" data-name="${escapeHtml(emp.name)}" aria-label="Delete official" title="Delete official">
                            <svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true" focusable="false">
                                <path d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z" />
                            </svg>
                        </button>`
                            : ""
                        }
                    </div>
                </div>
                `;
        })
        .join("");

      employeeListContainer.innerHTML = tableHeader + employeeItems;

      // Update summary container
      if (employeeSummaryContainer) {
        employeeSummaryContainer.textContent = `Total: ${totalCount} | Active: ${activeCount} | Inactive: ${inactiveCount}`;
      }

      // Add toggle active/inactive button listeners
      document.querySelectorAll(".toggle-employee-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const employeeId = btn.getAttribute("data-id");
          const employeeName = btn.getAttribute("data-name");
          const activeAttr = btn.getAttribute("data-active");
          // Handle boolean conversion: true, 'true', or anything else is false
          const isActive = activeAttr === "true" || activeAttr === true;
          const newStatus = !isActive;

          // Determine action and meaningful message
          const action = newStatus ? "unhide" : "hide";
          const title = newStatus ? "Unhide Official" : "Hide Official";
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

            const statusText = newStatus ? "unhidden" : "hidden";
            const toastType = newStatus ? "success" : "warning";
            showToast(
              `Official "${employeeName}" ${statusText} successfully!`,
              toastType,
            );
            await refreshEmployeeListPreservingFilters();
            // Refresh the global employee list for dropdowns
            if (window.adminLoadEmployees) {
              await window.adminLoadEmployees();
            }
          } catch (error) {
            console.error("Toggle employee status error:", error);
            showToast(
              `Failed to update official status: ${error.message}`,
              "error",
            );
          }
        });
      });

      // Add edit button listeners
      document.querySelectorAll(".edit-employee-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          editEmployeeData = {
            id: btn.getAttribute("data-id"),
            name: btn.getAttribute("data-name"),
            position: btn.getAttribute("data-position") || "",
            office: btn.getAttribute("data-office") || "",
          };
          editEmployeeNameInput.value = editEmployeeData.name;
          if (editEmployeePositionInput) {
            editEmployeePositionInput.value =
              editEmployeeData.position || "Not specified";
          }
          if (editEmployeeOfficeInput) {
            editEmployeeOfficeInput.value = editEmployeeData.office || "";
          }
          editEmployeeStatus.classList.add("hidden");
          if (editEmployeeRecordsNote)
            editEmployeeRecordsNote.classList.add("hidden");
          editEmployeeNameWarningShown = false;
          editEmployeeModal.classList.add("show");
        });
      });

      // Add delete button listeners
      document.querySelectorAll(".delete-employee-btn").forEach((btn) => {
        // Skip any delete buttons used as UI-only icons (e.g., multiselect clear-all)
        if (btn.getAttribute('data-clear-all') === 'true') return;
        btn.addEventListener("click", async () => {
          deleteEmployeeData = {
            id: btn.getAttribute("data-id"),
            name: btn.getAttribute("data-name"),
          };
          const recordsNote = document.getElementById(
            "delete-employee-records-note",
          );
          if (recordsNote) {
            recordsNote.textContent = "";
            recordsNote.classList.add("hidden");
            const { count } = await supabase
              .from("travel_authorities")
              .select("id", { count: "exact", head: true })
              .ilike("employees", `%${deleteEmployeeData.name}%`);
            if (count && count > 0) {
              recordsNote.textContent = `This official appears in ${count} travel authorit${count === 1 ? "y" : "ies"}. Those records will be kept but the name will remain as historical text.`;
              recordsNote.classList.remove("hidden");
            }
          }
          deleteEmployeeModal.classList.add("show");
        });
      });

      // Reload employee options in multiselects and filter
      if (filteredData === null) {
        setEmployeesList(allEmployeesData || []);
        renderEmployeesOptions();
        renderUpdateEmployeesOptions();

        // Update admin filter data for autocomplete
        setAdminEmployeesListForFilter(
          allEmployeesData ? allEmployeesData : [],
        );
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
        employeeSummaryContainer.textContent =
          "Total: 0 | Active: 0 | Inactive: 0";
      }
    }
  };

  // Employee search functionality
  if (employeeSearchInput) {
    employeeSearchInput.addEventListener("input", applyEmployeeFilters);
  }

  if (employeeFilterToggleBtn) {
    employeeFilterToggleBtn.addEventListener("click", () => {
      employeeFilterPanel?.classList.toggle("show");
      employeeSortPanel?.classList.remove("show");
    });
  }

  if (employeeSortToggleBtn) {
    employeeSortToggleBtn.addEventListener("click", () => {
      employeeSortPanel?.classList.toggle("show");
      employeeFilterPanel?.classList.remove("show");
    });
  }

  if (employeeApplyFilterBtn) {
    employeeApplyFilterBtn.addEventListener("click", () => {
      activeEmpFilters.position = (employeePositionFilter?.value || "")
        .toLowerCase()
        .trim();
      activeEmpFilters.status = employeeStatusFilter?.value || "";
      activeEmpFilters.office = (employeeOfficeFilter?.value || "").toLowerCase().trim();
      updateEmpButtonStates();
      applyEmployeeFilters();
      employeeFilterPanel?.classList.remove("show");
    });
  }

  if (employeeClearFilterBtn) {
    employeeClearFilterBtn.addEventListener("click", () => {
      activeEmpFilters.position = "";
      activeEmpFilters.status = "";
      activeEmpFilters.office = "";
      if (employeePositionFilter) employeePositionFilter.value = "";
      if (employeeStatusFilter) employeeStatusFilter.value = "";
      if (employeeOfficeFilter) employeeOfficeFilter.value = "";
      updateEmpButtonStates();
      applyEmployeeFilters();
      employeeFilterPanel?.classList.remove("show");
    });
  }

  if (employeeApplySortBtn) {
    employeeApplySortBtn.addEventListener("click", () => {
      activeEmpSort.order = employeeSortOrderSelect?.value || "az";
      activeEmpSort.status = employeeSortStatusSelect?.value || "active-first";
      updateEmpButtonStates();
      applyEmployeeFilters();
      employeeSortPanel?.classList.remove("show");
    });
  }

  if (employeeClearSortBtn) {
    employeeClearSortBtn.addEventListener("click", () => {
      activeEmpSort.order = "az";
      activeEmpSort.status = "active-first";
      if (employeeSortOrderSelect) employeeSortOrderSelect.value = "az";
      if (employeeSortStatusSelect) employeeSortStatusSelect.value = "active-first";
      updateEmpButtonStates();
      applyEmployeeFilters();
    });
  }

  document.addEventListener("click", (e) => {
    if (
      employeeFilterPanel &&
      !employeeFilterPanel.contains(e.target) &&
      !employeeFilterToggleBtn?.contains(e.target) &&
      employeeFilterPanel.classList.contains("show")
    ) {
      employeeFilterPanel.classList.remove("show");
    }
    if (
      employeeSortPanel &&
      !employeeSortPanel.contains(e.target) &&
      !employeeSortToggleBtn?.contains(e.target) &&
      employeeSortPanel.classList.contains("show")
    ) {
      employeeSortPanel.classList.remove("show");
    }
  });

  const refreshEmployeeListPreservingFilters = async () => {
    await renderEmployeeList();
    applyEmployeeFilters();
  };

  // Autocomplete functionality for "Add Official" field
  const autocompleteList = document.getElementById(
    "employee-autocomplete-list",
  );

  // Helper to show/hide dropdown with proper class management
  const setDropdownVisible = (visible) => {
    if (visible) {
      autocompleteList.style.display = "block";
      employeeNameInput.classList.add("autocomplete-active");
    } else {
      autocompleteList.style.display = "none";
      employeeNameInput.classList.remove("autocomplete-active");
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
      .filter(
        (emp) =>
          emp.is_active !== false && emp.name.toLowerCase().includes(trimmed),
      )
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
      const addBtn = autocompleteList.querySelector(".autocomplete-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          setDropdownVisible(false);
          addEmployeeBtn.click(); // Trigger the add employee button
        });
      }
      return;
    }

    // Build the suggestions HTML
    autocompleteList.innerHTML = matches
      .map((emp, index) => {
        return `<div class="autocomplete-item" data-value="${escapeHtml(emp.name)}" data-index="${index}" role="option">${escapeHtml(emp.name)}</div>`;
      })
      .join("");

    setDropdownVisible(true);

    // Add click handlers to suggestions
    document.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", () => {
        employeeNameInput.value = item.getAttribute("data-value");
        setDropdownVisible(false);
        employeeNameInput.focus();
      });

      item.addEventListener("mouseenter", () => {
        document
          .querySelectorAll(".autocomplete-item")
          .forEach((i) => i.classList.remove("highlighted"));
        item.classList.add("highlighted");
      });
    });
  };

  // Handle input event for autocomplete
  employeeNameInput.addEventListener("input", (e) => {
    showAutocompleteSuggestions(e.target.value);
  });

  // Handle keyboard navigation in autocomplete
  employeeNameInput.addEventListener("keydown", (e) => {
    const items = document.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    const highlighted = document.querySelector(
      ".autocomplete-item.highlighted",
    );

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!highlighted) {
        items[0].classList.add("highlighted");
      } else {
        const nextIndex = Array.from(items).indexOf(highlighted) + 1;
        if (nextIndex < items.length) {
          highlighted.classList.remove("highlighted");
          items[nextIndex].classList.add("highlighted");
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (highlighted) {
        const prevIndex = Array.from(items).indexOf(highlighted) - 1;
        if (prevIndex >= 0) {
          highlighted.classList.remove("highlighted");
          items[prevIndex].classList.add("highlighted");
        } else {
          highlighted.classList.remove("highlighted");
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted) {
        employeeNameInput.value = highlighted.getAttribute("data-value");
        setDropdownVisible(false);
      } else if (employeeNameInput.value.trim()) {
        // Trigger add button if Enter is pressed with no selection
        addEmployeeBtn.click();
      }
    } else if (e.key === "Escape") {
      setDropdownVisible(false);
    }
  });

  // Close autocomplete when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper")) {
      setDropdownVisible(false);
    }
  });

  // Show autocomplete when field is focused
  employeeNameInput.addEventListener("focus", (e) => {
    if (e.target.value.length > 0) {
      showAutocompleteSuggestions(e.target.value);
    }
  });

  addEmployeeBtn.addEventListener("click", async () => {
    const employeeName = employeeNameInput.value.trim();
    const employeePosition = employeePositionInput.value.trim();
    const employeeOffice = employeeOfficeInput?.value.trim() || "";

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
      employeeStatus.textContent =
        "Only letters, hyphens, apostrophes, periods, and commas are allowed.";
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
      const existingEmployee = getEmployeesList().find(
        (emp) => emp.name.toLowerCase() === employeeName.toLowerCase(),
      );
      if (existingEmployee) {
        throw new Error(`Official "${existingEmployee.name}" already exists.`);
      }

      const { error } = await supabase
        .from("employee_list")
        .insert([
          { name: employeeName, position: employeePosition, office: employeeOffice, is_active: true },
        ]);

      if (error) {
        console.error("Database insert error:", error);
        if (
          error.code === "23505" ||
          error.message?.includes("duplicate") ||
          error.message?.includes("unique")
        ) {
          // Try to fetch the conflicting record
          const { data: existingData } = await supabase
            .from("employee_list")
            .select("*")
            .ilike("name", employeeName)
            .limit(1);

          if (existingData && existingData.length > 0) {
            throw new Error(
              `Official "${existingData[0].name}" already exists (ID: ${existingData[0].id}).`,
            );
          } else {
            throw new Error(
              "This official name already exists in the database.",
            );
          }
        }
        throw error;
      }

      employeeStatus.textContent = "Official added successfully!";
      employeeNameInput.value = "";
      employeePositionInput.value = "";
      if (employeeOfficeInput) employeeOfficeInput.value = "";
      setDropdownVisible(false);
      await refreshEmployeeListPreservingFilters();
      // Refresh the global employee list for dropdowns
      if (window.adminLoadEmployees) {
        await window.adminLoadEmployees();
      }
      showToast("Official added successfully!", "success");
    } catch (error) {
      console.error("Add employee error:", error);
      const message =
        error && error.message ? error.message : "Failed to add official.";
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
      await refreshEmployeeListPreservingFilters();
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
    if (editEmployeeRecordsNote)
      editEmployeeRecordsNote.classList.add("hidden");
    editEmployeeNameWarningShown = false;
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
    const newPosition =
      (editEmployeePositionInput?.value || "").trim() || "Not specified";
    const newOffice = (editEmployeeOfficeInput?.value || "").trim() || "Not specified";
    if (!newName) {
      editEmployeeStatus.textContent = "Please enter an official name.";
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--success",
        "status--shake",
      );
      editEmployeeStatus.classList.add("status--error");
      void editEmployeeStatus.offsetWidth; // Force reflow to restart animation
      editEmployeeStatus.classList.add("status--shake");
      return;
    }

    // Validate allowed characters
    const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
    if (!namePattern.test(newName)) {
      editEmployeeStatus.textContent =
        "Only letters, spaces, hyphens, apostrophes, periods, and commas are allowed.";
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--success",
        "status--shake",
      );
      editEmployeeStatus.classList.add("status--error");
      void editEmployeeStatus.offsetWidth;
      editEmployeeStatus.classList.add("status--shake");
      return;
    }

    // Validate length
    if (newName.length > 30) {
      editEmployeeStatus.textContent =
        "Official name cannot exceed 30 characters.";
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--success",
        "status--shake",
      );
      editEmployeeStatus.classList.add("status--error");
      void editEmployeeStatus.offsetWidth;
      editEmployeeStatus.classList.add("status--shake");
      return;
    }

    const originalPosition =
      (editEmployeeData.position || "").trim() || "Not specified";
    const originalOffice = (editEmployeeData.office || "").trim() || "Not specified";

    if (
      newName === editEmployeeData.name &&
      newPosition === originalPosition &&
      newOffice === originalOffice
    ) {
      editEmployeeStatus.textContent = "No changes made.";
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--error",
        "status--shake",
      );
      editEmployeeStatus.classList.add("status--success");
      void editEmployeeStatus.offsetWidth; // Force reflow to restart animation
      editEmployeeStatus.classList.add("status--shake");
      return;
    }

    // On name change: first click warns + shows affected count; second click proceeds and cascades
    if (newName !== editEmployeeData.name) {
      if (!editEmployeeNameWarningShown && editEmployeeRecordsNote) {
        const { count } = await supabase
          .from("travel_authorities")
          .select("id", { count: "exact", head: true })
          .ilike("employees", `%${editEmployeeData.name}%`);
        if (count && count > 0) {
          editEmployeeRecordsNote.textContent = `Note: ${count} existing travel authorit${count === 1 ? "y" : "ies"} will also have the name updated. Click Update again to confirm.`;
          editEmployeeRecordsNote.classList.remove("hidden");
          editEmployeeNameWarningShown = true;
          return;
        } else {
          editEmployeeRecordsNote.classList.add("hidden");
        }
      }
    }
    editEmployeeNameWarningShown = false;

    const oldName = editEmployeeData.name;
    const nameChanged = newName !== oldName;

    try {
      editEmployeeStatus.textContent = "Updating official...";
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--error",
        "status--success",
      );

      const { data: updatedRows, error } = await supabase
        .from("employee_list")
        .update({ name: newName, position: newPosition, office: newOffice })
        .eq("id", editEmployeeData.id)
        .select();

      if (error) {
        if (
          error.code === "23505" ||
          error.message?.includes("duplicate") ||
          error.message?.includes("unique")
        ) {
          throw new Error("This official name already exists.");
        }
        throw error;
      }

      // Ensure the update actually affected a row (useful to surface RLS/permission issues)
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          "Update failed — record not found or insufficient permissions.",
        );
      }

      // Cascade name change to all travel_authorities records that reference the old name
      if (nameChanged) {
        const { data: affectedTAs, error: fetchError } = await supabase
          .from("travel_authorities")
          .select("id, employees")
          .ilike("employees", `%${oldName}%`);

        if (fetchError) throw fetchError;

        if (affectedTAs && affectedTAs.length > 0) {
          // Replace the old name within each comma-separated string
          const updates = affectedTAs.map((record) => {
            const updatedEmployees = record.employees
              .split(",")
              .map((n) => (n.trim() === oldName ? newName : n.trim()))
              .join(", ");
            return supabase
              .from("travel_authorities")
              .update({ employees: updatedEmployees })
              .eq("id", record.id);
          });
          const results = await Promise.all(updates);
          const cascadeError = results.find((r) => r.error)?.error;
          if (cascadeError) throw cascadeError;
        }
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
        if (editEmployeeRecordsNote)
          editEmployeeRecordsNote.classList.add("hidden");
      }, 1000);

      await refreshEmployeeListPreservingFilters();
      // Refresh the global employee list for dropdowns
      if (window.adminLoadEmployees) {
        await window.adminLoadEmployees();
      }
      showToast(
        `Official "${newName}" updated (Position: ${newPosition}).`,
        "success",
      );
    } catch (error) {
      console.error("Edit employee error:", error);
      const message =
        error && error.message ? error.message : "Failed to update official.";
      editEmployeeStatus.textContent = message;
      editEmployeeStatus.classList.remove(
        "hidden",
        "status--success",
        "status--shake",
      );
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
      if (editEmployeeRecordsNote)
        editEmployeeRecordsNote.classList.add("hidden");
      editEmployeeNameWarningShown = false;
    }
  });

  editEmployeeNameInput.addEventListener("input", () => {
    editEmployeeNameWarningShown = false;
    if (editEmployeeRecordsNote)
      editEmployeeRecordsNote.classList.add("hidden");
  });

  // Initialize - Load employees when module is initialized
  renderEmployeeList();

  // Expose renderEmployeeList to window for panel switching
  window.employeeRenderList = refreshEmployeeListPreservingFilters;

  // Realtime subscription for employee_list changes
  let employeeRealtimeChannel = null;
  const setupEmployeeRealtimeSubscription = () => {
    // Clean up existing subscription if any
    if (employeeRealtimeChannel) {
      supabase.removeChannel(employeeRealtimeChannel);
    }

    // Subscribe to all changes (INSERT, UPDATE, DELETE) on employee_list table
    employeeRealtimeChannel = supabase
      .channel("employee_list_admin_changes")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events
          schema: "public",
          table: "employee_list",
        },
        (payload) => {
          // Refresh the employee table
          refreshEmployeeListPreservingFilters();

          // Refresh upload multi-select dropdowns
          if (window.adminLoadEmployees) {
            window.adminLoadEmployees();
          }

          // Refresh admin view filter dropdown
          if (window.adminLoadEmployeesForFilter) {
            window.adminLoadEmployeesForFilter();
          }

          // Show toast notification with employee name
          let message = "";
          let employeeName = "";

          switch (payload.eventType) {
            case "INSERT":
              employeeName = payload.new?.name || "Official";
              message = `${employeeName} has been added to officials`;
              break;
            case "UPDATE":
              employeeName =
                payload.new?.name || payload.old?.name || "Official";
              message = `${employeeName} has been updated in officials`;
              break;
            case "DELETE":
              employeeName = payload.old?.name || "Official";
              message = `${employeeName} has been removed from officials`;
              break;
          }
          showToast(message, "success", 3000);
        },
      )
      .subscribe((status) => {});
  };

  // Initialize realtime subscription
  setupEmployeeRealtimeSubscription();
};
