import "@lottiefiles/dotlottie-wc";
import zxcvbn from "zxcvbn";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config.js";

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const loginStatus = document.getElementById("login-status");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password-btn");
const loginBtn = document.getElementById("login-btn");
const loginBtnText = document.getElementById("login-btn-text");
const loginBtnLottie = document.getElementById("login-btn-lottie");
const setLoginLoading = (loading) => {
  loginBtn.disabled = loading;
  loginBtnText.style.display = loading ? "none" : "";
  loginBtnLottie.style.display = loading ? "block" : "none";
};
const loginPanel = document.getElementById("login-panel");
const newPasswordPanel = document.getElementById("new-password-panel");
let loginCaptchaWidgetId = null;
let loginCaptchaToken = null;
let pendingLoginResolve = null;
let pendingLoginReject = null;
const MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_SCORE = 3;
const DEFAULT_LOGIN_RETRY_SECONDS = 60;
const GENERIC_LOGIN_FAILURE_MESSAGE = "Invalid email or password.";
const GENERIC_RESET_MESSAGE =
  "If the email is registered, a reset link will be sent.";
const HCAPTCHA_BASE_WIDTH = 303;
const HCAPTCHA_BASE_HEIGHT = 78;

const applyHCaptchaScale = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const availableWidth =
    container.clientWidth || container.getBoundingClientRect().width;
  if (!availableWidth) return;

  const scale = Math.min(1, availableWidth / HCAPTCHA_BASE_WIDTH);
  container.style.setProperty("--hcaptcha-scale", String(scale));
  container.style.setProperty(
    "--hcaptcha-height",
    `${Math.ceil(HCAPTCHA_BASE_HEIGHT * scale)}px`,
  );
};

const syncAllHCaptchaScales = () => {
  applyHCaptchaScale("hcaptcha-container");
};

const setHCaptchaVisibility = (containerId, isVisible) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.toggle("hcaptcha-active", Boolean(isVisible));
};

window.addEventListener("resize", syncAllHCaptchaScales);

if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    togglePasswordBtn.setAttribute(
      "aria-pressed",
      isVisible ? "false" : "true",
    );
    togglePasswordBtn.setAttribute(
      "aria-label",
      isVisible ? "Show password" : "Hide password",
    );
  });
}

// Show/hide new password
document
  .getElementById("show-new-password")
  .addEventListener("change", (e) => {
    const newPasswordInput = document.getElementById("new-password");
    const confirmPasswordInput =
      document.getElementById("confirm-password");
    const type = e.target.checked ? "text" : "password";
    newPasswordInput.type = type;
    confirmPasswordInput.type = type;
  });

const parseRetrySeconds = (
  value,
  fallback = DEFAULT_LOGIN_RETRY_SECONDS,
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.ceil(numeric);
};

// Route login through the Edge Function so lockout state is updated server-side.
const loginViaEdgeFunction = async ({
  email,
  password,
  captchaToken,
}) => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "secure-login",
      {
        body: {
          email,
          password,
          captchaToken,
        },
      },
    );

    if (error) {
      console.error("Secure login function error:", error);

      if (error.context?.json) {
        try {
          const errorData = await error.context.json();
          if (errorData && typeof errorData === "object") {
            return errorData;
          }
        } catch (parseError) {
          console.error(
            "Failed to parse secure login error response:",
            parseError,
          );
        }
      }

      return {
        authenticated: false,
        code: "service_unavailable",
      };
    }

    return (
      data || {
        authenticated: false,
        code: "service_unavailable",
      }
    );
  } catch (err) {
    console.error("Secure login function request failed:", err);
    return {
      authenticated: false,
      code: "service_unavailable",
    };
  }
};

// Dynamic countdown timer for lockout
let lockoutCountdownInterval = null;

const stopLockoutCountdown = () => {
  if (lockoutCountdownInterval) {
    clearInterval(lockoutCountdownInterval);
    lockoutCountdownInterval = null;
  }
};

const startLockoutCountdown = (seconds, mode = "account") => {
  stopLockoutCountdown(); // Clear any existing countdown
  let remaining = parseRetrySeconds(seconds);

  const updateCountdown = () => {
    if (remaining <= 0) {
      stopLockoutCountdown();
      loginStatus.textContent = "You can now try logging in again.";
      loginStatus.classList.remove("status--error", "hidden");
      loginStatus.classList.add("status--success");
      setTimeout(() => {
        loginStatus.classList.add("hidden");
      }, 3000);
      return;
    }

    if (mode === "network") {
      loginStatus.textContent = `Too many failed attempts from this network. Try again in ${remaining} second${remaining !== 1 ? "s" : ""}.`;
    } else {
      loginStatus.textContent = `Too many failed attempts. Try again in ${remaining} second${remaining !== 1 ? "s" : ""}.`;
    }
    loginStatus.classList.remove("status--success", "hidden");
    loginStatus.classList.add("status--error");
    remaining--;
  };

  // Initial update
  updateCountdown();

  // Update every second
  lockoutCountdownInterval = setInterval(updateCountdown, 1000);
};

// Clean up countdown on page unload
window.addEventListener("beforeunload", stopLockoutCountdown);

const getRedirectPage = async (userId) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, access_enabled")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Check if user has access enabled
    if (data?.access_enabled === false) {
      // User account is disabled
      await supabase.auth.signOut();
      throw new Error("AUTH_FAILED_GENERIC");
    }

    // Role-based redirect is for UX only.
    // Real access control is enforced by Supabase RLS policies.
    const role = data?.role || "user";

    // Redirect admin and super users to admin panel, regular users to dashboard
    const page =
      role === "admin" || role === "super"
        ? "admin/admin.html"
        : "dashboard/dashboard.html";

    return { role, page };
  } catch (error) {
    console.error("Error fetching user role:", error);
    if (error.message === "AUTH_FAILED_GENERIC") {
      throw error;
    }
    // Default to dashboard if role lookup fails
    return { role: "user", page: "dashboard/dashboard.html" };
  }
};

const handleLogin = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    loginStatus.textContent = "Please enter email and password.";
    loginStatus.classList.remove("status--success", "hidden");
    loginStatus.classList.add("status--error");
    loginStatus.classList.remove("status--shake");
    void loginStatus.offsetWidth;
    loginStatus.classList.add("status--shake");
    return;
  }

  if (typeof hcaptcha === "undefined") {
    loginStatus.textContent =
      "Verification service not loaded. Please refresh the page.";
    loginStatus.classList.remove("status--success", "hidden");
    loginStatus.classList.add("status--error");
    return;
  }

  loginStatus.textContent = "Signing in...";
  loginStatus.classList.remove(
    "status--error",
    "status--success",
    "hidden",
  );
  setLoginLoading(true);

  // Render invisible widget once, then auto-execute on each sign-in attempt
  if (loginCaptchaWidgetId === null) {
    loginCaptchaWidgetId = hcaptcha.render("login-hcaptcha", {
      sitekey: "fcc42bc6-e25c-48f2-85ea-497021987410",
      size: "invisible",
      callback: (token) => {
        loginCaptchaToken = token;
        if (pendingLoginResolve) {
          const resolve = pendingLoginResolve;
          pendingLoginResolve = null;
          pendingLoginReject = null;
          resolve(token);
        }
      },
      "expired-callback": () => {
        loginCaptchaToken = null;
        if (pendingLoginReject) {
          const reject = pendingLoginReject;
          pendingLoginResolve = null;
          pendingLoginReject = null;
          reject(new Error("captcha_expired"));
        }
      },
      "error-callback": () => {
        loginCaptchaToken = null;
        if (pendingLoginReject) {
          const reject = pendingLoginReject;
          pendingLoginResolve = null;
          pendingLoginReject = null;
          reject(new Error("captcha_error"));
        }
      },
      "close-callback": () => {
        // User dismissed the challenge popup — unblock the button
        if (pendingLoginReject) {
          const reject = pendingLoginReject;
          pendingLoginResolve = null;
          pendingLoginReject = null;
          reject(new Error("captcha_closed"));
        }
      },
    });
  }

  let hcaptchaResponse;
  try {
    hcaptchaResponse = await new Promise((resolve, reject) => {
      pendingLoginResolve = resolve;
      pendingLoginReject = reject;
      hcaptcha.execute(loginCaptchaWidgetId);
    });
  } catch (captchaErr) {
    if (loginCaptchaWidgetId !== null) {
      hcaptcha.reset(loginCaptchaWidgetId);
      loginCaptchaToken = null;
    }
    setLoginLoading(false);
    const closed = captchaErr?.message === "captcha_closed";
    loginStatus.textContent = closed
      ? "Verification cancelled. Click Sign in to try again."
      : "Verification failed. Please try again.";
    loginStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    loginStatus.classList.add(
      closed ? "status--neutral" : "status--error",
    );
    if (!closed) {
      void loginStatus.offsetWidth;
      loginStatus.classList.add("status--shake");
    }
    return;
  }

  try {
    const loginResult = await loginViaEdgeFunction({
      email,
      password,
      captchaToken: hcaptchaResponse,
    });

    if (!loginResult?.authenticated) {
      if (loginCaptchaWidgetId !== null) {
        hcaptcha.reset(loginCaptchaWidgetId);
        loginCaptchaToken = null;
      }
      setLoginLoading(false);

      if (loginResult?.code === "locked") {
        startLockoutCountdown(loginResult?.seconds_remaining, "account");
        return;
      }

      if (loginResult?.code === "ip_limited") {
        startLockoutCountdown(loginResult?.seconds_remaining, "network");
        return;
      }

      if (loginResult?.code === "access_disabled") {
        loginStatus.textContent =
          "Your account access has been disabled. Please contact the administrator.";
        loginStatus.classList.remove(
          "status--success",
          "hidden",
          "status--shake",
        );
        loginStatus.classList.add("status--error");
        return;
      }

      if (
        loginResult?.code === "captcha_failed" ||
        loginResult?.code === "captcha_required"
      ) {
        loginStatus.textContent =
          "CAPTCHA verification failed. Please try again.";
      } else {
        const attemptsRemaining = Number(loginResult?.attempts_remaining);
        if (
          Number.isFinite(attemptsRemaining) &&
          attemptsRemaining <= 5 &&
          attemptsRemaining >= 0
        ) {
          loginStatus.textContent = `${GENERIC_LOGIN_FAILURE_MESSAGE}. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining.`;
        } else {
          loginStatus.textContent = GENERIC_LOGIN_FAILURE_MESSAGE;
        }
      }

      loginStatus.classList.remove(
        "status--success",
        "hidden",
        "status--shake",
      );
      loginStatus.classList.add("status--error");
      void loginStatus.offsetWidth;
      loginStatus.classList.add("status--shake");
      return;
    }

    const session = loginResult?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Unable to create user session.");
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

    if (sessionError) {
      throw sessionError;
    }

    const user = sessionData?.user || loginResult?.user;
    if (!user?.id) {
      throw new Error("Unable to load user session.");
    }

    // Reset hCaptcha after successful login
    if (loginCaptchaWidgetId !== null) {
      hcaptcha.reset(loginCaptchaWidgetId);
      loginCaptchaToken = null;
    }

    const { role, page } = await getRedirectPage(user.id);

    loginStatus.textContent = "Signed in. Redirecting...";
    loginStatus.classList.remove("hidden");
    loginStatus.classList.add("status--success");

    // For admin and super users, generate and store a session token to enforce single-session
    if (role === "admin" || role === "super") {
      const sessionToken = crypto.randomUUID();
      localStorage.setItem("admin_session_token", sessionToken);

      // Wait for database update to complete before redirecting
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ session_token: sessionToken })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to update session token:", updateError);
        loginStatus.textContent =
          "Warning: Session token update failed. " + updateError.message;
      }

      // Add extra delay to ensure database propagation
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setTimeout(() => {
      window.location.href = page;
    }, 500);
  } catch (error) {
    console.error("Login failed:", error);

    if (loginCaptchaWidgetId !== null) {
      hcaptcha.reset(loginCaptchaWidgetId);
      loginCaptchaToken = null;
    }
    setLoginLoading(false);

    loginStatus.textContent = GENERIC_LOGIN_FAILURE_MESSAGE;
    loginStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    loginStatus.classList.add("status--error");
    void loginStatus.offsetWidth;
    loginStatus.classList.add("status--shake");
  }
};

const redirectIfLoggedIn = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { page } = await getRedirectPage(user.id);
  window.location.href = page;
};

loginBtn.addEventListener("click", handleLogin);

// Trigger login when Enter key is pressed
emailInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleLogin();
  }
});

passwordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleLogin();
  }
});

// Check if user is in password recovery mode (clicked email link)
const checkPasswordRecovery = async () => {
  const hashParams = new URLSearchParams(
    window.location.hash.substring(1),
  );
  const type = hashParams.get("type");

  if (type === "recovery") {
    loginPanel.classList.add("hidden");
    newPasswordPanel.classList.remove("hidden");
    return true;
  }
  return false;
};

// Handle new password update
const handlePasswordUpdate = async () => {
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword =
    document.getElementById("confirm-password").value;
  const updatePasswordStatus = document.getElementById(
    "update-password-status",
  );
  const updatePasswordBtn = document.getElementById(
    "update-password-btn",
  );

  if (!newPassword || !confirmPassword) {
    updatePasswordStatus.textContent =
      "Please enter and confirm your new password.";
    updatePasswordStatus.classList.remove("status--success", "hidden");
    updatePasswordStatus.classList.add("status--error");
    return;
  }

  if (newPassword !== confirmPassword) {
    updatePasswordStatus.textContent = "Passwords do not match.";
    updatePasswordStatus.classList.remove("status--success", "hidden");
    updatePasswordStatus.classList.add("status--error");
    return;
  }

  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    updatePasswordStatus.textContent = passwordValidation.message;
    updatePasswordStatus.classList.remove("status--success", "hidden");
    updatePasswordStatus.classList.add("status--error");
    return;
  }

  updatePasswordStatus.textContent = "Updating password...";
  updatePasswordStatus.classList.remove(
    "status--error",
    "status--success",
    "hidden",
  );
  updatePasswordBtn.disabled = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session) {
      throw new Error(
        "No active session. Please click the reset link from your email again.",
      );
    }

    const passwordValidation = validatePasswordStrength(
      newPassword,
      sessionData?.session?.user?.email,
    );
    if (!passwordValidation.valid) {
      updatePasswordStatus.textContent = passwordValidation.message;
      updatePasswordStatus.classList.remove("status--success", "hidden");
      updatePasswordStatus.classList.add("status--error");
      updatePasswordBtn.disabled = false;
      return;
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw error;
    }

    updatePasswordStatus.textContent =
      "Password updated! Clearing session...";
    updatePasswordStatus.classList.remove("status--error", "hidden");
    updatePasswordStatus.classList.add("status--success");

    // Clear any failed login attempts for this user
    const userEmail = sessionData?.session?.user?.email;
    if (userEmail) {
      await clearLoginAttempts();
    }

    // Sign out to clear the recovery session
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.error("Sign out error:", signOutError);
    }

    // Clear all local storage and session storage
    localStorage.clear();
    sessionStorage.clear();

    updatePasswordStatus.textContent =
      "Password updated successfully! Redirecting to login...";

    // Always redirect to production URL after password reset
    setTimeout(() => {
      // Redirect to GitHub Pages for login (works from localhost or production)
      window.location.replace(
        supabaseConfig.productionUrl + "/index.html",
      );
    }, 2000);
  } catch (error) {
    console.error("Password update error:", error);
    updatePasswordStatus.textContent =
      error.message || "Failed to update password. Please try again.";
    updatePasswordStatus.classList.remove("status--success", "hidden");
    updatePasswordStatus.classList.add("status--error");
    updatePasswordBtn.disabled = false;
  }
};

// Add event listener for update password button
document
  .getElementById("update-password-btn")
  .addEventListener("click", handlePasswordUpdate);

const normalizeForComparison = (value) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const validatePasswordStrength = (password, email = "") => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }

  const normalizedPassword = normalizeForComparison(password);
  const emailLocalPart = (email || "").split("@")[0] || "";
  const normalizedLocalPart = normalizeForComparison(emailLocalPart);

  if (
    normalizedLocalPart &&
    normalizedPassword.includes(normalizedLocalPart)
  ) {
    return {
      valid: false,
      message:
        "Password is too predictable. Avoid using parts of your email.",
    };
  }

  const weakPatterns = [
    "password",
    "qwerty",
    "admin",
    "letmein",
    "welcome",
    "123456",
    "changeme",
  ];
  if (
    weakPatterns.some((pattern) => normalizedPassword.includes(pattern))
  ) {
    return {
      valid: false,
      message:
        "Password is too common. Use a less predictable passphrase.",
    };
  }

  if (typeof zxcvbn === "function") {
    const analysis = zxcvbn(password, [emailLocalPart]);
    if ((analysis?.score ?? 0) < MIN_PASSWORD_SCORE) {
      const suggestion =
        analysis?.feedback?.suggestions?.[0] ||
        "Add more words and make it less predictable.";
      return {
        valid: false,
        message: `Password is too weak. ${suggestion}`,
      };
    }
  }

  return { valid: true, message: "" };
};

const showLivePasswordFeedback = () => {
  const updatePasswordStatus = document.getElementById(
    "update-password-status",
  );
  const newPasswordValue = document.getElementById("new-password").value;
  const confirmPasswordValue =
    document.getElementById("confirm-password").value;

  if (!newPasswordValue && !confirmPasswordValue) {
    updatePasswordStatus.textContent = "Enter your new password.";
    updatePasswordStatus.classList.remove(
      "status--error",
      "status--success",
    );
    updatePasswordStatus.classList.add("status--neutral", "hidden");
    return;
  }

  if (confirmPasswordValue && newPasswordValue !== confirmPasswordValue) {
    updatePasswordStatus.textContent = "Passwords do not match.";
    updatePasswordStatus.classList.remove(
      "status--success",
      "status--neutral",
      "hidden",
    );
    updatePasswordStatus.classList.add("status--error");
    return;
  }

  const validation = validatePasswordStrength(newPasswordValue);
  if (!validation.valid) {
    updatePasswordStatus.textContent = validation.message;
    updatePasswordStatus.classList.remove(
      "status--success",
      "status--neutral",
      "hidden",
    );
    updatePasswordStatus.classList.add("status--error");
    return;
  }

  updatePasswordStatus.textContent = "Strong password format.";
  updatePasswordStatus.classList.remove("status--error", "hidden");
  updatePasswordStatus.classList.add("status--success");
};

document
  .getElementById("new-password")
  .addEventListener("input", showLivePasswordFeedback);
document
  .getElementById("confirm-password")
  .addEventListener("input", showLivePasswordFeedback);

// Allow Enter key to update password
document
  .getElementById("new-password")
  .addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handlePasswordUpdate();
    }
  });

document
  .getElementById("confirm-password")
  .addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handlePasswordUpdate();
    }
  });

// Initialize - check if in recovery mode first
const initializePage = async () => {
  const isRecovery = await checkPasswordRecovery();
  if (!isRecovery) {
    // Only check login redirect if not in recovery mode
    await redirectIfLoggedIn();
  }
};

initializePage();

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    loginPanel.classList.add("hidden");
    newPasswordPanel.classList.remove("hidden");
  }
});

// Password Reset Functionality
const resetPasswordModal = document.getElementById(
  "reset-password-modal",
);
const forgotPasswordLink = document.getElementById(
  "forgot-password-link",
);
const cancelResetBtn = document.getElementById("cancel-reset-btn");
const sendResetBtn = document.getElementById("send-reset-btn");
const resetEmailInput = document.getElementById("reset-email");
const resetStatus = document.getElementById("reset-status");
let resetCaptchaWidgetId = null;
let resetCaptchaToken = null;
let resetCooldownInterval = null;
let lastResetEmail = "";
const RESET_COOLDOWN_SECONDS = 60; // seconds to wait between reset attempts

// Start a visible countdown on the Send Reset Link button
const applyResetCooldown = (secondsRemaining) => {
  sendResetBtn.disabled = true;
  if (resetCooldownInterval) clearInterval(resetCooldownInterval);

  const tick = () => {
    if (secondsRemaining <= 0) {
      clearInterval(resetCooldownInterval);
      resetCooldownInterval = null;
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = "Send Reset Link";
      resetCaptchaToken = null;
      return;
    }
    sendResetBtn.textContent = `Wait ${secondsRemaining}s`;
    secondsRemaining--;
  };
  tick();
  resetCooldownInterval = setInterval(tick, 1000);
};

// Check localStorage for an existing per-email cooldown and apply it if still active
const checkAndApplyExistingCooldown = (email) => {
  if (!email) return;
  const key = `reset_cooldown_${email}`;
  const expiryStr = localStorage.getItem(key);
  if (!expiryStr) return;
  const expiry = parseInt(expiryStr, 10);
  const now = Date.now();
  if (expiry > now) {
    const secondsLeft = Math.ceil((expiry - now) / 1000);
    applyResetCooldown(secondsLeft);
  } else {
    localStorage.removeItem(key);
  }
};

// Store cooldown expiry in localStorage for the given email
const storeResetCooldown = (email, seconds) => {
  const key = `reset_cooldown_${email}`;
  localStorage.setItem(key, (Date.now() + seconds * 1000).toString());
};

// Request password reset via Edge Function (server-side captcha + rate limiting).
const requestPasswordResetViaEdgeFunction = async ({
  email,
  captchaToken,
  redirectTo,
}) => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "request-password-reset",
      {
        body: {
          email,
          captchaToken,
          redirectTo,
        },
      },
    );
    if (error) {
      console.error("Password reset function error:", error);
      return {
        accepted: true,
        cooldown_seconds: RESET_COOLDOWN_SECONDS,
      };
    }
    return (
      data || {
        accepted: true,
        cooldown_seconds: RESET_COOLDOWN_SECONDS,
      }
    );
  } catch (err) {
    console.error("Password reset function request failed:", err);
    return {
      accepted: true,
      cooldown_seconds: RESET_COOLDOWN_SECONDS,
    };
  }
};

// Open reset password modal
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    resetPasswordModal.classList.remove("hidden");
    resetPasswordModal.classList.add("show");
    resetEmailInput.value = emailInput.value; // Pre-fill if email is entered
    resetEmailInput.focus();
    resetStatus.classList.add("hidden");

    // Apply any existing cooldown (use pre-filled email or last used email)
    sendResetBtn.disabled = false;
    const emailForCooldown = emailInput.value.trim() || lastResetEmail;
    checkAndApplyExistingCooldown(emailForCooldown);

    // Render CAPTCHA immediately
    if (typeof hcaptcha === "undefined") {
      resetStatus.textContent =
        "CAPTCHA is not loaded. Please refresh the page.";
      resetStatus.classList.remove(
        "hidden",
        "status--neutral",
        "status--success",
      );
      resetStatus.classList.add("status--error");
    } else if (resetCaptchaWidgetId === null) {
      setHCaptchaVisibility("hcaptcha-container", true);
      resetCaptchaWidgetId = hcaptcha.render("hcaptcha-container", {
        sitekey: "fcc42bc6-e25c-48f2-85ea-497021987410",
        callback: (token) => {
          resetCaptchaToken = token;
          resetStatus.textContent = "";
          resetStatus.classList.add("hidden");
          setHCaptchaVisibility("hcaptcha-container", true);
          syncAllHCaptchaScales();
        },
      });
      requestAnimationFrame(syncAllHCaptchaScales);
      setTimeout(syncAllHCaptchaScales, 120);
    }
  });
}

// Close modal handlers
const closeResetPasswordModal = () => {
  resetPasswordModal.classList.remove("show");
  resetPasswordModal.classList.add("hidden");
  resetEmailInput.value = "";
  resetStatus.classList.add("hidden");
  // Clear the countdown interval (cooldown persists in localStorage)
  if (resetCooldownInterval) {
    clearInterval(resetCooldownInterval);
    resetCooldownInterval = null;
  }
  // Only re-enable button if no active cooldown remains
  const cooldownKey = lastResetEmail
    ? `reset_cooldown_${lastResetEmail}`
    : null;
  const cooldownExpiry = cooldownKey
    ? parseInt(localStorage.getItem(cooldownKey) || "0", 10)
    : 0;
  if (cooldownExpiry > Date.now()) {
    sendResetBtn.disabled = true;
    sendResetBtn.textContent = "Send Reset Link";
  } else {
    sendResetBtn.disabled = false;
    sendResetBtn.textContent = "Send Reset Link";
  }
  resetCaptchaToken = null;
  if (resetCaptchaWidgetId !== null) {
    hcaptcha.reset(resetCaptchaWidgetId);
    hcaptcha.remove(resetCaptchaWidgetId);
    resetCaptchaWidgetId = null;
  }
  setHCaptchaVisibility("hcaptcha-container", false);
};

cancelResetBtn.addEventListener("click", closeResetPasswordModal);

// Close modal when clicking outside
resetPasswordModal.addEventListener("click", (e) => {
  if (e.target === resetPasswordModal) {
    closeResetPasswordModal();
  }
});

// Send password reset email
sendResetBtn.addEventListener("click", async () => {
  const email = resetEmailInput.value.trim().toLowerCase();

  if (!email) {
    resetStatus.textContent = "Please enter your email address.";
    resetStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--error");
    void resetStatus.offsetWidth;
    resetStatus.classList.add("status--shake");
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    resetStatus.textContent = "Please enter a valid email address.";
    resetStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--error");
    void resetStatus.offsetWidth;
    resetStatus.classList.add("status--shake");
    return;
  }

  // Client-side cooldown check — always runs regardless of button state
  const cooldownKey = `reset_cooldown_${email}`;
  const cooldownExpiry = parseInt(
    localStorage.getItem(cooldownKey) || "0",
    10,
  );
  if (cooldownExpiry > Date.now()) {
    const secsLeft = Math.ceil((cooldownExpiry - Date.now()) / 1000);
    applyResetCooldown(secsLeft);
    resetStatus.textContent = `Please wait ${secsLeft} second${secsLeft !== 1 ? "s" : ""} before requesting another reset link.`;
    resetStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--error");
    void resetStatus.offsetWidth;
    resetStatus.classList.add("status--shake");
    return;
  }

  // Check that captcha token is available
  if (!resetCaptchaToken) {
    resetStatus.textContent = "Please complete the CAPTCHA verification.";
    resetStatus.classList.remove(
      "status--success",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--error");
    void resetStatus.offsetWidth;
    resetStatus.classList.add("status--shake");
    return;
  }

  resetStatus.textContent = "Sending reset link...";
  resetStatus.classList.remove(
    "status--error",
    "status--success",
    "hidden",
    "status--shake",
  );
  resetStatus.classList.add("status--neutral");
  sendResetBtn.disabled = true;

  const hcaptchaResponse = resetCaptchaToken;
  resetCaptchaToken = null;

  try {
    const requestResult = await requestPasswordResetViaEdgeFunction({
      email,
      captchaToken: hcaptchaResponse,
      redirectTo: supabaseConfig.getRedirectUrl(),
    });

    if (
      requestResult?.accepted === false &&
      requestResult?.code === "captcha_failed"
    ) {
      resetStatus.textContent =
        "CAPTCHA verification failed. Please try again.";
      resetStatus.classList.remove(
        "status--success",
        "status--neutral",
        "hidden",
        "status--shake",
      );
      resetStatus.classList.add("status--error");
      void resetStatus.offsetWidth;
      resetStatus.classList.add("status--shake");

      if (resetCaptchaWidgetId !== null)
        hcaptcha.reset(resetCaptchaWidgetId);
      sendResetBtn.disabled = false;
      return;
    }

    const cooldownSecs = Math.max(
      1,
      Number(requestResult?.cooldown_seconds || RESET_COOLDOWN_SECONDS),
    );

    // Keep short client cooldown; server-side limiter is authoritative.
    lastResetEmail = email;
    storeResetCooldown(email, cooldownSecs);
    applyResetCooldown(cooldownSecs);

    resetStatus.textContent = GENERIC_RESET_MESSAGE;
    resetStatus.classList.remove(
      "status--error",
      "status--neutral",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--success");

    // Reset hCaptcha
    if (resetCaptchaWidgetId !== null)
      hcaptcha.reset(resetCaptchaWidgetId);

    // Close modal after response
    setTimeout(() => {
      closeResetPasswordModal();
    }, 3000);
  } catch (error) {
    console.error("Password reset error:", error);
    // Always show the generic message and apply cooldown to prevent spam,
    // regardless of whether the underlying request succeeded or failed
    lastResetEmail = email;
    storeResetCooldown(email, RESET_COOLDOWN_SECONDS);
    applyResetCooldown(RESET_COOLDOWN_SECONDS);

    resetStatus.textContent = GENERIC_RESET_MESSAGE;
    resetStatus.classList.remove(
      "status--error",
      "status--neutral",
      "hidden",
      "status--shake",
    );
    resetStatus.classList.add("status--success");
    // Reset hCaptcha on error
    if (resetCaptchaWidgetId !== null)
      hcaptcha.reset(resetCaptchaWidgetId);
  }
});

// Allow Enter key to send reset email
resetEmailInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendResetBtn.click();
  }
});

// Prevent browser back navigation after logout
// This prevents users from navigating back to authenticated pages after logging out
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    // Page was loaded from cache (back/forward button)
    window.location.reload();
  }
});
