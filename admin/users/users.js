import { escapeHtml } from "../../shared/record-utils.js";

// Super Admin user directory, edits, filters, and realtime updates.
export const createUserManagement = ({ supabase, isSuperUser }) => {
  let allUsersData = []; // Store all users for filtering
  let usersTableFilters = {
    super: { access: "", status: "" },
    admin: { access: "", status: "" },
    user: { access: "", status: "" },
  };

  const updateUsersFilterButtonStates = () => {
    ["super", "admin", "user"].forEach((role) => {
      const toggleBtn = document.getElementById(`users-filter-toggle-btn-${role}`);
      const applied = usersTableFilters[role] || { access: "", status: "" };
      const isActive = Boolean((applied.access && applied.access !== "") || (applied.status && applied.status !== ""));
      if (toggleBtn) toggleBtn.classList.toggle("active", !!isActive);
    });
  };

  const getRolePriority = (role) => {
    const priorities = { super: 3, admin: 2, user: 1 };
    return priorities[role] || 0;
  };

  const truncateEmail = (email, maxLocalLength = 10) => {
    if (!email || !email.includes("@")) return email;

    const [localPart, domain] = email.split("@");

    if (localPart.length <= maxLocalLength) {
      return email;
    }

    // Truncate local part but keep domain
    const truncated = localPart.substring(0, maxLocalLength) + "...";
    return `${truncated}@${domain}`;
  };

  const capitalizeWords = (value) => {
    if (!value) return "";
    return String(value)
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  };

  const formatHeaderLikeName = (fname, lname, compact = false) => {
    const normalizedFirst = capitalizeWords(fname || "");
    const normalizedLast = capitalizeWords(lname || "");
    const fullName = `${normalizedFirst} ${normalizedLast}`.trim();

    if (!compact || !normalizedFirst) {
      return fullName;
    }

    const initials = normalizedFirst
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

    return `${initials} ${normalizedLast}`.trim() || fullName;
  };

  const formatLastOnlineDate = (lastSeen) => {
    if (!lastSeen) return "—";
    const date = new Date(lastSeen);
    if (Number.isNaN(date.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const year = parts.find((part) => part.type === "year")?.value;
    return `${month}-${day}-${year}`;
  };

  let editUserNameData = null;
  let userNameModalHandlersInitialized = false;
  window.currentlyEditingUserId = null; // Track which user is being edited
  window.currentlyChangingRoleUserId = null;

  const closeEditUserNameModal = () => {
    const modal = document.getElementById("edit-user-name-modal");
    const statusEl = document.getElementById("edit-user-name-status");
    const fnameInput = document.getElementById("edit-user-fname");
    const lnameInput = document.getElementById("edit-user-lname");

    if (modal) {
      modal.classList.remove("show");
    }
    if (statusEl) {
      statusEl.classList.add("hidden");
      statusEl.classList.remove("status--error");
      statusEl.textContent = "";
    }
    if (fnameInput) fnameInput.value = "";
    if (lnameInput) lnameInput.value = "";
    editUserNameData = null;
    window.currentlyEditingUserId = null; // Clear tracked user
  };

  const submitEditUserName = async () => {
    const statusEl = document.getElementById("edit-user-name-status");
    const fnameInput = document.getElementById("edit-user-fname");
    const lnameInput = document.getElementById("edit-user-lname");

    if (!editUserNameData || !fnameInput || !lnameInput) {
      return;
    }

    const latestUser = allUsersData.find((u) => u.id === editUserNameData.id);
    if (latestUser?.is_online === true) {
      if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.classList.add("status--error");
        statusEl.textContent =
          "User is online. Name can only be edited while offline.";

        statusEl.classList.remove("status--shake");
        void statusEl.offsetWidth; // Trigger reflow to restart animation
        statusEl.classList.add("status--shake");
      }
      return;
    }

    const rawFName = fnameInput.value.trim();
    const rawLName = lnameInput.value.trim();

    if (!rawFName || !rawLName) {
      if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.classList.add("status--error");
        statusEl.textContent = "Both first name and last name are required.";
      }
      return;
    }

    try {
      if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.classList.remove("status--error");
        statusEl.textContent = "Saving changes...";
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          FName: capitalizeWords(rawFName),
          LName: capitalizeWords(rawLName),
        })
        .eq("id", editUserNameData.id);

      if (error) {
        throw error;
      }

      window.showToast("User name updated successfully.", "success");
      closeEditUserNameModal();
      await loadUsers();
    } catch (error) {
      console.error("Failed to update user name:", error);
      if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.classList.add("status--error");
        statusEl.textContent = error?.message || "Failed to update user name.";
      }
    }
  };

  const initUserNameModalHandlers = () => {
    if (userNameModalHandlersInitialized) {
      return;
    }

    const modal = document.getElementById("edit-user-name-modal");
    const cancelBtn = document.getElementById("cancel-edit-user-name");
    const confirmBtn = document.getElementById("confirm-edit-user-name");

    if (!modal || !cancelBtn || !confirmBtn) {
      return;
    }

    cancelBtn.addEventListener("click", closeEditUserNameModal);
    confirmBtn.addEventListener("click", submitEditUserName);
    modal.addEventListener("click", (event) => {
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
      window.showToast("User must be offline before editing name.", "warning");
      return;
    }

    const modal = document.getElementById("edit-user-name-modal");
    const fnameInput = document.getElementById("edit-user-fname");
    const lnameInput = document.getElementById("edit-user-lname");
    const statusEl = document.getElementById("edit-user-name-status");

    if (!modal || !fnameInput || !lnameInput) {
      return;
    }

    editUserNameData = {
      id: user.id,
      email: user.email || "",
    };

    // Track which user is being edited for realtime protection
    window.currentlyEditingUserId = user.id;

    fnameInput.value = user.FName || "";
    lnameInput.value = user.LName || "";

    if (statusEl) {
      statusEl.classList.add("hidden");
      statusEl.classList.remove("status--error");
      statusEl.textContent = "";
    }

    modal.classList.add("show");
  };

  const renderUsersTable = (users) => {
    const usersStatus = document.getElementById("users-status");
    if (!usersStatus) {
      console.warn("Users panel elements not found in DOM yet");
      return;
    }

    const useCompactName = window.matchMedia("(max-width: 768px)").matches;

    for (const role of ["super", "admin", "user"]) {
      const tbody = document.getElementById(`users-body-${role}`);
      const countEl = document.getElementById(`users-count-${role}`);
      if (!tbody) continue;

      const filters = usersTableFilters[role] || {};
      const allInRole = (users || []).filter((u) => u.role === role);
      let group = allInRole.slice();

      if (filters.access === "enabled")
        group = group.filter((u) => u.access_enabled === true);
      else if (filters.access === "disabled")
        group = group.filter((u) => u.access_enabled === false);

      if (filters.status === "online")
        group = group.filter(
          (u) => u.is_online === true && u.access_enabled !== false,
        );
      else if (filters.status === "offline")
        group = group.filter(
          (u) => u.is_online === false && u.access_enabled !== false,
        );
      else if (filters.status === "blocked")
        group = group.filter((u) => u.access_enabled === false);

      if (countEl) {
        const isFiltered = filters.access || filters.status;
        countEl.textContent = isFiltered
          ? `${group.length} of ${allInRole.length}`
          : `${allInRole.length}`;
      }

      if (group.length === 0) {
        const label =
          role === "super"
            ? "super users"
            : role === "admin"
              ? "admins"
              : "users";
        tbody.innerHTML = `<tr><td colspan="6">No ${label} found.</td></tr>`;
        continue;
      }

      tbody.innerHTML = group
        .map((user) => {
          const accessEnabled = user.access_enabled !== false;
          const displayEmail = truncateEmail(user.email || "No email", 10);
          const fullEmail = user.email || "No email";
          const isOnline = user.is_online === true;
          const statusClass = !accessEnabled
            ? "status-blocked"
            : isOnline
              ? "status-online"
              : "status-offline";
          const statusText = !accessEnabled
            ? "Blocked"
            : isOnline
              ? "Online"
              : "Offline";
          const nameDisplay =
            formatHeaderLikeName(user.FName, user.LName, useCompactName) ||
            fullEmail.split("@")[0] ||
            "Unknown User";
          const editDisabledReason = "Can't edit: user is online.";
          const editTooltip = isOnline ? editDisabledReason : "Edit user name";
          const roleDisabledReason = isOnline
            ? "Can't change role: user is online."
            : !accessEnabled
              ? "Can't change role: access is disabled."
              : "";
          const roleTooltip = roleDisabledReason || "Change user role";
          return `
          <tr class="${!accessEnabled ? "user-disabled" : ""}">
              <td class="text-left">
                  <span class="user-name-cell">
                      <span class="user-edit-tooltip-wrap" title="${escapeHtml(editTooltip)}">
                          <button
                              type="button"
                              class="update-btn icon-btn user-edit-btn"
                              data-user-id="${escapeHtml(user.id)}"
                              ${isOnline ? "disabled" : ""}
                              aria-label="Edit user name"
                          >
                              <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
                                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5c.39-.39.39-1.02 0-1.41L19.66 3c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75L21 5.75z"/>
                              </svg>
                          </button>
                      </span>
                      ${escapeHtml(nameDisplay)}
                  </span>
              </td>
              <td class="text-left" title="${escapeHtml(fullEmail)}">${escapeHtml(displayEmail)}</td>
              <td><span class="status-indicator ${statusClass}">${statusText}</span></td>
              <td>
                  <select class="access-select" data-user-id="${escapeHtml(user.id)}" data-current-access="${accessEnabled}">
                      <option value="true" ${accessEnabled ? "selected" : ""}>Enabled</option>
                      <option value="false" ${!accessEnabled ? "selected" : ""}>Disabled</option>
                  </select>
              </td>
              <td>
                  <span class="user-edit-tooltip-wrap" title="${escapeHtml(roleTooltip)}">
                      <select class="role-select" data-user-id="${escapeHtml(user.id)}" data-current-role="${escapeHtml(user.role)}" ${!accessEnabled || isOnline ? "disabled" : ""}>
                          <option value="">-- Select Role --</option>
                          <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
                          <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
                          <option value="super" ${user.role === "super" ? "selected" : ""}>Super</option>
                      </select>
                  </span>
              </td>
              <td>${escapeHtml(formatLastOnlineDate(user.last_seen))}</td>
          </tr>
      `;
        })
        .join("");
    }

    // Re-attach all event listeners across all 3 sections
    document.querySelectorAll(".role-select").forEach((select) => {
      select.addEventListener("change", async (e) => {
        const userId = e.target.getAttribute("data-user-id");
        const currentRole = e.target.getAttribute("data-current-role");
        const newRole = e.target.value;

        if (!newRole || newRole === currentRole) {
          e.target.value = currentRole; // Reset if no selection or same role
          return;
        }

        window.currentlyChangingRoleUserId = userId;

        // Confirm role change
        const confirmChange = await window.adminShowConfirmation(
          "Confirm Role Change",
          `Change user role from "${currentRole}" to "${newRole}"?`,
        );

        window.currentlyChangingRoleUserId = null;

        if (!confirmChange) {
          e.target.value = currentRole; // Reset to original
          return;
        }

        await changeUserRole(userId, newRole, e.target);
      });
    });

    // Add change event listeners to access selects
    document.querySelectorAll(".access-select").forEach((select) => {
      select.addEventListener("change", async (e) => {
        const userId = e.target.getAttribute("data-user-id");
        const currentAccess =
          e.target.getAttribute("data-current-access") === "true";
        const newAccess = e.target.value === "true";

        if (newAccess === currentAccess) {
          return; // No change
        }

        // Confirm access change
        const action = newAccess ? "enable" : "disable";
        const confirmChange = await window.adminShowConfirmation(
          "Confirm Access Change",
          `Are you sure you want to ${action} access for this user?`,
        );
        if (!confirmChange) {
          e.target.value = currentAccess.toString(); // Reset to original
          return;
        }

        await toggleUserAccess(userId, newAccess, e.target);
      });
    });

    document.querySelectorAll(".user-edit-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const userId = button.getAttribute("data-user-id");
        if (!userId) return;
        openEditUserNameModal(userId);
      });
    });

    usersStatus.textContent = `Loaded ${(users || []).length} user(s).`;
  };

  const loadUsers = async () => {
    const usersStatus = document.getElementById("users-status");

    if (!isSuperUser()) {
      console.warn("Blocked non-super user from loading users panel data.");
      ["super", "admin", "user"].forEach((r) => {
        const tb = document.getElementById(`users-body-${r}`);
        if (tb) tb.innerHTML = '<tr><td colspan="6">Permission denied.</td></tr>';
      });
      if (usersStatus) {
        usersStatus.textContent = "Only super users can view this panel.";
        usersStatus.classList.add("status--error");
      }
      return;
    }

    const isLegacyGetUsersSignatureError = (rpcError) => {
      if (!rpcError) return false;
      const code = String(rpcError.code || "");
      const combined =
        `${rpcError.message || ""} ${rpcError.details || ""} ${rpcError.hint || ""}`.toLowerCase();
      if (!combined.includes("get_all_users_with_emails")) return false;
      return (
        code === "PGRST202" ||
        code === "42883" ||
        combined.includes("schema cache") ||
        combined.includes("does not exist")
      );
    };

    const getUsersWithEmailRows = async () => {
      let response = await supabase.rpc("get_all_users_with_emails", {
        client_session_token: localStorage.getItem("admin_session_token"),
      });

      if (!response.error || !isLegacyGetUsersSignatureError(response.error)) {
        return response;
      }

      console.warn(
        "Falling back to legacy get_all_users_with_emails() signature without client_session_token.",
      );
      response = await supabase.rpc("get_all_users_with_emails");
      return response;
    };

    if (!usersStatus) {
      console.error("Users panel elements not found in DOM");
      return;
    }

    initUserNameModalHandlers();

    try {
      usersStatus.textContent = "Loading users...";
      usersStatus.classList.remove("status--error");
      // Use RPC function to get users with emails from auth.users
      // This is secure because the RPC function validates super user permission
      const { data, error } = await getUsersWithEmailRows();
      if (error) {
        console.error("Error loading users:", error);
        console.error("Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        const combinedErrorText = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
        const normalizedErrorText = combinedErrorText.toLowerCase();
        // Provide helpful error messages
        if (isLegacyGetUsersSignatureError(error)) {
          throw new Error(
            "Database function get_all_users_with_emails is missing. Please run sql/create_get_users_function.sql.",
          );
        } else if (normalizedErrorText.includes("permission denied")) {
          throw new Error(
            "Permission denied. Only super users can view all users.",
          );
        } else if (normalizedErrorText.includes("session invalid")) {
          throw new Error("Session invalid or expired. Please sign in again.");
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
          .from("profiles")
          .select("id, FName, LName")
          .in("id", userIds);

        if (namesError) {
          console.warn("Unable to load user names from profiles:", namesError);
        } else {
          namesById = (profileNames || []).reduce((accumulator, profile) => {
            accumulator[profile.id] = {
              FName: profile.FName || "",
              LName: profile.LName || "",
            };
            return accumulator;
          }, {});
        }
      }

      const enrichedUsers = data.map((user) => ({
        ...user,
        FName: namesById[user.id]?.FName || "",
        LName: namesById[user.id]?.LName || "",
      }));

      // Sort by role priority: super > admin > user
      allUsersData = enrichedUsers.sort((a, b) => {
        const priorityDiff = getRolePriority(b.role) - getRolePriority(a.role);
        if (priorityDiff !== 0) return priorityDiff;
        // If same role, sort by email
        return (a.email || "").localeCompare(b.email || "");
      });
      // Per-section filter wiring
      for (const role of ["super", "admin", "user"]) {
        const applyBtn = document.getElementById(
          `users-apply-filter-btn-${role}`,
        );
        const clearBtn = document.getElementById(
          `users-clear-filter-btn-${role}`,
        );
        const accessSel = document.getElementById(`users-access-filter-${role}`);
        const statusSel = document.getElementById(`users-status-filter-${role}`);
        const filterPanel = document.getElementById(`users-filter-panel-${role}`);

        if (applyBtn) {
          applyBtn.onclick = () => {
            usersTableFilters[role].access = accessSel?.value || "";
            usersTableFilters[role].status = statusSel?.value || "";
            renderUsersTable(allUsersData);
            filterPanel?.classList.remove("show");
            updateUsersFilterButtonStates();
          };
        }
        if (clearBtn) {
          clearBtn.onclick = () => {
            usersTableFilters[role].access = "";
            usersTableFilters[role].status = "";
            if (accessSel) accessSel.value = "";
            if (statusSel) statusSel.value = "";
            renderUsersTable(allUsersData);
            filterPanel?.classList.remove("show");
            updateUsersFilterButtonStates();
          };
        }
        // Button state updates only on Apply/Clear — no live listeners for selects
      }

      renderUsersTable(allUsersData);
    } catch (error) {
      console.error("Failed to load users:", error);
      ["super", "admin", "user"].forEach((r) => {
        const tb = document.getElementById(`users-body-${r}`);
        if (tb)
          tb.innerHTML = '<tr><td colspan="6">Error loading users.</td></tr>';
      });
      if (usersStatus) {
        usersStatus.textContent = error?.message || "Failed to load users.";
        usersStatus.classList.add("status--error");
      }
    }
  };

  const changeUserRole = async (userId, newRole, selectElement) => {
    const originalRole = selectElement.getAttribute("data-current-role");
    const usersStatus = document.getElementById("users-status");

    try {
      if (usersStatus) {
        usersStatus.textContent = "Changing user role...";
        usersStatus.classList.remove("status--error");
      }

      // Double-check user is still offline before changing role
      const targetUser = allUsersData.find((u) => u.id === userId);
      if (targetUser && targetUser.is_online) {
        // User went online between modal confirmation and now - prevent role change
        selectElement.value = originalRole; // Revert the select
        const errorMessage = "User went online. Role change cancelled.";
        if (usersStatus) {
          usersStatus.textContent = errorMessage;
          usersStatus.classList.add("status--error");
        }
        window.showToast(errorMessage, "warning");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      // Call server-side RPC function that validates permissions
      // The RPC must enforce the caller’s super role on the server.
      const { data, error } = await supabase.rpc("change_user_role", {
        target_user_id: userId,
        new_role: newRole,
        client_session_token: localStorage.getItem("admin_session_token"),
      });

      if (error) {
        throw error;
      }

      selectElement.setAttribute("data-current-role", newRole);
      if (usersStatus) {
        usersStatus.textContent = "Role updated successfully";
      }
      window.showToast(`Role changed to ${newRole}`, "success");

      await loadUsers();
    } catch (error) {
      console.error("Failed to change user role:", error);

      // Revert select to original role
      selectElement.value = originalRole;

      let errorMessage = "Failed to change role";

      if (error.hint) {
        errorMessage = error.hint;
      } else if (error.message) {
        if (error.message.includes("last super user")) {
          errorMessage =
            "You are the last super user. There must be at least one super user.";
        } else if (error.message.includes("Permission denied")) {
          errorMessage = "Permission denied. Only super users can change roles.";
        } else if (error.message.includes("Invalid role")) {
          errorMessage = "Invalid role selected.";
        } else if (error.message.includes("User not found")) {
          errorMessage = "User not found.";
        } else {
          errorMessage = error.message;
        }
      }

      const usersStatus = document.getElementById("users-status");
      if (usersStatus) {
        usersStatus.textContent = errorMessage;
        usersStatus.classList.add("status--error");
      }
      window.showToast(errorMessage, "error");
    }
  };

  const toggleUserAccess = async (userId, newAccessEnabled, selectElement) => {
    const originalAccess =
      selectElement.getAttribute("data-current-access") === "true";
    const usersStatus = document.getElementById("users-status");

    try {
      if (usersStatus) {
        usersStatus.textContent = `${newAccessEnabled ? "Enabling" : "Disabling"} user access...`;
        usersStatus.classList.remove("status--error");
      }

      // Call server-side RPC function that validates permissions
      // The RPC must enforce the caller’s super role on the server.
      const { data, error } = await supabase.rpc("toggle_user_access", {
        target_user_id: userId,
        new_access_enabled: newAccessEnabled,
        client_session_token: localStorage.getItem("admin_session_token"),
      });

      if (error) {
        throw error;
      }

      const action = newAccessEnabled ? "enabled" : "disabled";
      if (usersStatus) {
        usersStatus.textContent = "Access updated successfully";
      }
      window.showToast(`Access ${action}`, "success");

      await loadUsers();
    } catch (error) {
      console.error("Failed to toggle user access:", error);

      // Revert select to original value
      selectElement.value = originalAccess.toString();

      let errorMessage = "Failed to change access";

      if (error.hint) {
        errorMessage = error.hint;
      } else if (error.message) {
        if (error.message.includes("last super user")) {
          errorMessage =
            "You are the last super user. There must be at least one super user with access.";
        } else if (error.message.includes("Cannot disable your own access")) {
          errorMessage = "You cannot disable your own access.";
        } else if (error.message.includes("Permission denied")) {
          errorMessage = "Permission denied. Only super users can change access.";
        } else if (error.message.includes("User not found")) {
          errorMessage = "User not found.";
        } else {
          errorMessage = error.message;
        }
      }

      const usersStatus = document.getElementById("users-status");
      if (usersStatus) {
        usersStatus.textContent = errorMessage;
        usersStatus.classList.add("status--error");
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
      .channel("profiles_admin_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          // Check whether the user being edited has come online.
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            const userWentOnline =
              payload.old.is_online === false && payload.new.is_online === true;
            const isEditingThisUser =
              window.currentlyEditingUserId === payload.new.id;
            const isChangingRoleForThisUser =
              window.currentlyChangingRoleUserId === payload.new.id;

            if (userWentOnline && isEditingThisUser) {
              closeEditUserNameModal();
              window.showToast("User went online. Edit modal closed.", "warning");
            }

            if (userWentOnline && isChangingRoleForThisUser) {
              // Close confirmation modal if user went online during role change
              const confirmModal = document.getElementById("admin-confirm-modal");
              const cancelBtn = document.getElementById(
                "admin-confirm-cancel-btn",
              );
              if (confirmModal && confirmModal.classList.contains("active")) {
                confirmModal.classList.remove("active");
                window.currentlyChangingRoleUserId = null;
                window.showToast(
                  "User went online. Role change cancelled.",
                  "warning",
                );
              }
            }
          }

          // Check if users panel is currently visible
          const usersPanel = document.getElementById("users-panel");
          if (!usersPanel || usersPanel.classList.contains("hidden")) {
            // Users panel not visible, don't reload
            return;
          }

          // Determine what changed
          let changeType = "";
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            if (payload.new.is_online !== payload.old.is_online) {
              changeType = "status";
            } else if (payload.new.role !== payload.old.role) {
              changeType = "role";
            } else if (
              payload.new.access_enabled !== payload.old.access_enabled
            ) {
              changeType = "access";
            }
          }

          // Silently refresh the users table to show updated status/role/access
          loadUsers();

          // Optional: Show subtle notification for role/access changes only
          // (not for online status changes as those are frequent)
          if (changeType === "role" || changeType === "access") {
            const usersStatus = document.getElementById("users-status");
            if (usersStatus) {
              usersStatus.textContent = "User list updated";
            }
          }
        },
      )
      .subscribe((status) => {});
  };

  return { loadUsers, setupProfilesRealtimeSubscription };
};
