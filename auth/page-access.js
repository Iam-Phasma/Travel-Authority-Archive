// Browser page access checks supplement server-side authorization.
const createRoleLookup = (supabase) => {
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
  return getUserRole;
};

export const createAdminAccess = ({
  supabase, setCurrentUserId, markCurrentUserOffline, clearAdminClientState,
}) => {
  const getUserRole = createRoleLookup(supabase);
  const requireAdmin = async () => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData?.session) {
      // No valid session - redirect to login
      console.warn("No valid session found. Redirecting to login.");
      window.location.href = "../index.html";
      return null;
    }

    const user = sessionData.session.user;
    setCurrentUserId(user.id);

    // CRITICAL: Verify admin/super role from database (not localStorage which can be manipulated)
    const role = await getUserRole(user.id);

    if (role !== "admin" && role !== "super") {
      // User is not an admin or super - block access silently
      console.warn(
        "Access denied: User is not an admin or super. Redirecting to dashboard.",
      );
      window.location.href = "../dashboard/dashboard.html";
      return null;
    }

    if (
      role !== "super" &&
      localStorage.getItem("adminActivePanel") === "users-panel"
    ) {
      localStorage.setItem("adminActivePanel", "upload-panel");
    }

    // Clear persisted table state once per new authenticated admin session.
    try {
      const loginMarker = `${user.id}:${sessionData.session.access_token || ""}`;
      const previousLoginMarker = sessionStorage.getItem("adminLoginMarker");

      if (previousLoginMarker !== loginMarker) {
        localStorage.removeItem("adminFilters");
        localStorage.removeItem("adminSort");
        localStorage.setItem("adminActivePanel", "upload-panel");
        sessionStorage.setItem("adminLoginMarker", loginMarker);
      }
    } catch (storageError) {
      console.warn(
        "Unable to reset admin table state for new login:",
        storageError,
      );
    }

    // Additional check: Verify session token matches database
    const localToken = localStorage.getItem("admin_session_token");
    if (!localToken) {
      console.warn("No session token found. Redirecting to login.");
      window.location.href = "../index.html";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("session_token, control")
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

    return { role, control: profileData.control ?? 1 }; // Return role + control for UI customization

    // Note: Actual access control for admin operations (upload, delete)
    // is enforced by Supabase RLS policies, not this client-side check.
    // This check is for UX and adds defense-in-depth, but RLS is the real security.
  };
  return { getUserRole, requireAdmin };
};

export const createDashboardAccess = ({ supabase, setCurrentUserId, setUserRole }) => {
  const getUserRole = createRoleLookup(supabase);
  const requireUser = async () => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData?.session) {
      // No valid session - redirect to login
      console.warn("No valid session found. Redirecting to login.");
      window.location.href = "../index.html";
      return;
    }

    const user = sessionData.session.user;
    setCurrentUserId(user.id);

    // Clear persisted table state once per new authenticated session.
    try {
      const loginMarker = `${user.id}:${sessionData.session.access_token || ""}`;
      const previousLoginMarker = sessionStorage.getItem("dashboardLoginMarker");

      if (previousLoginMarker !== loginMarker) {
        localStorage.removeItem("dashboardFilters");
        localStorage.removeItem("dashboardSort");
        localStorage.setItem("dashActiveTab", "insights");
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
    setUserRole(role || "user");

    // If user is actually an admin, redirect to admin panel
    if (role === "admin") {
      window.location.href = "../admin/admin.html";
      return;
    }

    // Note: Access control for data operations is enforced by Supabase RLS policies.
    // Client-side checks are for UX only and should not be relied upon for security.
  };
  return { requireUser };
};
