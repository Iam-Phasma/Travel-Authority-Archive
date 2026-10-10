// Session state cleanup, access monitoring, and periodic validation.
export const createDashboardSession = ({ supabase }) => {
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

  const validateSession = async () => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData?.session) {
      console.warn("Session expired or invalid. Redirecting to login.");
      window.location.href = "../index.html";
    }
  };

  return { markCurrentUserOffline, clearDashboardClientState, setupAccessMonitoring, validateSession };
};
