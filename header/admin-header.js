// Header menus, notices, and draft form behavior for this page.
export const createAdminHeader = ({ supabase, getEmployees, loadEmployees, markCurrentUserOffline, clearAdminClientState }) => {
  let headerButtonsInitialized = false;
  const initHeaderButtons = () => {
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
    let headerDraftEmployeesMultiSelect = null;

    window.headerDraftSelectedEmployees = headerDraftSelectedEmployees;

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
      const isSuper = window.adminCurrentRole === "super";
      let query = supabase
        .from("notices")
        .select("id, message, sender, created_at, receiver")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!isSuper) {
        query = query.or("receiver.eq.admins,receiver.eq.both");
      }

      const { data: notices, error } = await query;

      const items = error ? [] : (notices || []);
      const hasNotices = items.length > 0;

      noticeEmpty?.toggleAttribute("hidden", hasNotices);
      noticeDivider?.toggleAttribute("hidden", !isSuper || !hasNotices);
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
          const actionBtns = isSuper ? `
            <div class="header-notice-item-actions">
              <button class="header-notice-item-btn notice-edit-receiver-btn" data-id="${escapeHtml(String(notice.id))}" title="Edit receiver" aria-label="Edit receiver">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z"/></svg>
              </button>
              <button class="header-notice-item-btn danger notice-delete-btn" data-id="${escapeHtml(String(notice.id))}" title="Delete notice" aria-label="Delete notice">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/></svg>
              </button>
            </div>` : "";
          const receiverEditRow = isSuper ? `
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
                ${isSuper ? `<span class="header-notice-item-receiver">${escapeHtml(receiverLabel)}</span>` : ""}
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

      if (isSuper) {
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
        await loadEmployees();
      } catch (error) {
        console.error("Failed to load officials for Draft TA:", error);
      }
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

      const closeDropdown = () => {
        draftTaOfficialsSearch.value = "";
        draftTaOfficialsDropdown.classList.remove("show");
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
        const filteredEmployees = getEmployees().filter(
          (emp) =>
            emp.name.toLowerCase().includes(searchTerm) &&
            !headerDraftSelectedEmployees.includes(emp.name),
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

                const existingEmployee = getEmployees().find(
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

      draftTaOfficialsDisplay.addEventListener("click", (e) => {
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

      document.addEventListener("click", (e) => {
        if (
          headerPopup.contains(e.target) ||
          e.target === userMenuBtn ||
          userMenuBtn.contains(e.target)
        ) {
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

    const headerDraftRequiredFieldConfigs = [
      {
        label: "Purpose",
        isMissing: () => !draftTaPurposeInput?.value.trim(),
        focus: () => draftTaPurposeInput?.focus(),
        errorTarget:
          draftTaPurposeInput?.closest(".input-wrap") || draftTaPurposeInput,
        input: draftTaPurposeInput,
      },
      {
        label: "Destination",
        isMissing: () => !draftTaDestinationInput?.value.trim(),
        focus: () => draftTaDestinationInput?.focus(),
        errorTarget:
          draftTaDestinationInput?.closest(".input-wrap") ||
          draftTaDestinationInput,
        input: draftTaDestinationInput,
      },
      {
        label: "Travel Date",
        isMissing: () => !draftTaTravelDateInput?.value,
        focus: () => draftTaTravelDateInput?.focus(),
        errorTarget:
          draftTaTravelDateInput?.closest(".input-wrap") || draftTaTravelDateInput,
        input: draftTaTravelDateInput,
      },
      {
        label: "Officials",
        isMissing: () => headerDraftSelectedEmployees.length === 0,
        focus: () => draftTaOfficialsDisplay?.focus(),
        errorTarget: draftTaOfficialsDisplay,
        input: draftTaOfficialsDisplay,
      },
    ];

    const getHeaderDraftMissingRequiredFields = (focusFirstMissing = false) => {
      const missingConfigs = headerDraftRequiredFieldConfigs.filter((config) =>
        config.isMissing(),
      );

      if (focusFirstMissing) {
        missingConfigs[0]?.focus();
      }

      return missingConfigs;
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
    setMessagesButtonVisibility(window.adminCurrentRole || "");

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
                setMessagesButtonVisibility(window.adminCurrentRole || "");
              }
            } catch (err) {
              console.error("Error fetching user name:", err);
              if (userNameElement) {
                setResponsiveHeaderName("", "", session.user.email.split("@")[0]);
              }
              setMessagesButtonVisibility(window.adminCurrentRole || "");
            }
          } else {
            if (userEmailElement) {
              userEmailElement.textContent = "Not available";
            }
            if (userNameElement) {
              setResponsiveHeaderName("", "", "User");
            }
            setMessagesButtonVisibility(window.adminCurrentRole || "");
          }
        })
        .catch(() => {
          if (userEmailElement) {
            userEmailElement.textContent = "Not available";
          }
          if (userNameElement) {
            setResponsiveHeaderName("", "", "User");
          }
          setMessagesButtonVisibility(window.adminCurrentRole || "");
        });
    }

    // Toggle popup when user menu button is clicked
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      noticePanel?.classList.remove("show");
      headerPopup.classList.toggle("show");
    });

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
      .channel("notices_realtime_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => {
        void renderNoticePanel();
      })
      .subscribe();

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
        return !(travelDate && travelEnd && travelEnd < travelDate);
      };

      draftTaTravelDateInput.addEventListener("change", validateTravelDates);
      draftTaTravelEndInput.addEventListener("change", validateTravelDates);
    }

    if (draftTaCreateBtn) {
      draftTaCreateBtn.addEventListener("click", () => {
        const missingConfigs = getHeaderDraftMissingRequiredFields(true);
        if (missingConfigs.length > 0) {
          if (window.showAppAlert) {
            void window.showAppAlert(
              "Complete Required Fields",
              `Please complete the following required fields:\n\n${missingConfigs.map((config) => `- ${config.label}`).join("\n")}`,
            );
          } else {
            alert(
              `Please complete the following required fields:\n\n${missingConfigs.map((config) => `- ${config.label}`).join("\n")}`,
            );
          }
          return;
        }

        // Check date validation
        const travelDate = draftTaTravelDateInput.value;
        const selectedTravelEnd = draftTaTravelEndInput?.value || "";
        const travelEnd =
          selectedTravelEnd && selectedTravelEnd !== travelDate
            ? selectedTravelEnd
            : "";
        const dateRequest = draftTaDateRequestInput?.value || getTodayLocalISO();
        const travelType = draftTaTravelTypeSelect?.value || "official_business";
        const fundingOption =
          draftTaFundingOptionSelect?.value || "reimbursement";

        if (travelDate && selectedTravelEnd && selectedTravelEnd < travelDate) {
          if (window.showAppAlert) {
            void window.showAppAlert(
              "Invalid Travel End",
              "Travel end date cannot be before travel date.",
            );
          } else {
            alert("Travel end date cannot be before travel date.");
          }
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
          const employee = getEmployees().find(
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
    if (settingsOption) {
      settingsOption.addEventListener("click", () => {
        headerPopup.classList.remove("show");
        noticePanel?.classList.remove("show");
        document.getElementById("settings-modal").classList.add("show");
      });
    }

    // Handle logout option click
    if (logoutOption) {
      logoutOption.addEventListener("click", async () => {
        headerPopup.classList.remove("show");
        noticePanel?.classList.remove("show");

        // Check if showConfirmation is available
        if (!window.adminShowConfirmation) {
          console.error("showConfirmation not available");
          return;
        }

        // Show confirmation dialog
        const confirmed = await window.adminShowConfirmation(
          "Confirm Logout",
          "Are you sure you want to log out?",
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
        !headerPopup.contains(e.target) &&
        e.target !== userMenuBtn &&
        !userMenuBtn.contains(e.target)
      ) {
        headerPopup.classList.remove("show");
      }
    });
  };
  return initHeaderButtons;
};
