// Session state cleanup, access monitoring, and periodic validation.
export const createAdminSession = ({ supabase, showToast, getUserRole }) => {
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

  const clearAdminClientState = () => {
    localStorage.removeItem("admin_session_token");
    localStorage.removeItem("adminActivePanel");
    localStorage.removeItem("adminSidebarCollapsed");
    localStorage.removeItem("adminFilters");
    localStorage.removeItem("adminSort");
    sessionStorage.removeItem("adminLoginMarker");
  };

  const setupAccessMonitoring = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      // Subscribe to changes on current user's profile
      const accessChannel = supabase
        .channel("admin_access_monitoring")
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
              showToast("Access disabled: You have been logged out.", "error");

              setTimeout(async () => {
                try {
                  await markCurrentUserOffline();
                  clearAdminClientState();
                  await supabase.auth.signOut();
                } catch (e) {
                  console.warn("Semi-graceful logout:", e);
                }
                window.location.href = "../index.html";
              }, 1000);
              return;
            }

            // Check if session_token changed — another device logged in
            if (payload.new && payload.new.session_token !== undefined) {
              const localToken = localStorage.getItem("admin_session_token");
              if (localToken && payload.new.session_token !== localToken) {
                showToast(
                  "Logged out: Another device logged into this account.",
                  "warning",
                );
                setTimeout(async () => {
                  try {
                    await markCurrentUserOffline();
                    clearAdminClientState();
                    await supabase.auth.signOut();
                  } catch (e) {
                    console.warn("Semi-graceful logout:", e);
                  }
                  window.location.href = "../index.html";
                }, 1000);
              }
            }
          },
        )
        .subscribe((status) => {});
    } catch (err) {
      console.error("Error setting up admin access monitoring:", err);
    }
  };

  const setupSessionMonitoring = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const localToken = localStorage.getItem("admin_session_token");
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
          showToast(
            "Logged out: Another device logged into this account.",
            "warning",
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          try {
            await markCurrentUserOffline();
            clearAdminClientState();
            await supabase.auth.signOut();
          } catch (e) {
            console.warn("Semi-graceful logout:", e);
          }
          window.location.href = "../index.html";
        }
      }
    } catch (err) {
      console.error("Error setting up session monitoring:", err);
    }
  };

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
    const localToken = localStorage.getItem("admin_session_token");
    if (localToken) {
      const { data: tokenData } = await supabase
        .from("profiles")
        .select("session_token")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (
        tokenData &&
        tokenData.session_token &&
        tokenData.session_token !== localToken
      ) {
        console.warn(
          "Session token mismatch detected in periodic check. Logging out.",
        );
        showToast(
          "Logged out: Another device logged into this account.",
          "warning",
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await markCurrentUserOffline();
          clearAdminClientState();
          await supabase.auth.signOut();
        } catch (e) {
          console.warn("Semi-graceful logout:", e);
        }
        window.location.href = "../index.html";
      }
    }
  };

  return { markCurrentUserOffline, clearAdminClientState, setupAccessMonitoring, setupSessionMonitoring, validateAdminSession };
};
