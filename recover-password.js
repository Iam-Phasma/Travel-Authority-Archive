import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config.js";
import { validatePasswordStrength } from "./auth/password-validation.js";

import "@lottiefiles/dotlottie-wc";

const RECOVERY_STORAGE_KEY = "travel-authority-password-recovery";
const recoveryHash = window.location.hash.slice(1);
const recoveryParams = new URLSearchParams(recoveryHash);
const recoveryQueryParams = new URLSearchParams(window.location.search);
const recoveryTokenHash =
  recoveryParams.get("token_hash") || recoveryQueryParams.get("token_hash");
const recoveryType =
  recoveryParams.get("type") || recoveryQueryParams.get("type");
const recoveryAccessToken = recoveryParams.get("access_token");
const recoveryRefreshToken = recoveryParams.get("refresh_token");
const recoveryCode = recoveryQueryParams.get("code");
const form = document.getElementById("recovery-form");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const updatePasswordButton = document.getElementById("update-password-btn");
const updatePasswordButtonText = document.getElementById("update-password-btn-text");
const updatePasswordButtonLottie = document.getElementById("update-password-btn-lottie");
const status = document.getElementById("update-password-status");

const setStatus = (message, type = "neutral") => {
  status.textContent = message;
  status.classList.remove("hidden", "status--neutral", "status--success", "status--error");
  status.classList.add(`status--${type}`);
};

let recoveryClient = null;
let recoveryUser = null;

try {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    throw new Error("Supabase is not configured for this deployment.");
  }

  recoveryClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      storage: window.sessionStorage,
      storageKey: RECOVERY_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
} catch (error) {
  console.error("Password recovery initialization failed:", error);
  setStatus("Password reset is unavailable. Please request a new reset link.", "error");
}

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const isVisible = input.type === "text";
    input.type = isVisible ? "password" : "text";
    button.setAttribute("aria-pressed", isVisible ? "false" : "true");
    button.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  });
});

const showLivePasswordFeedback = () => {
  if (!newPasswordInput.value && !confirmPasswordInput.value) {
    status.textContent = "Enter your new password.";
    status.classList.remove("status--error", "status--success");
    status.classList.add("status--neutral", "hidden");
    return;
  }

  if (confirmPasswordInput.value && newPasswordInput.value !== confirmPasswordInput.value) {
    setStatus("Passwords do not match.", "error");
    return;
  }

  const validation = validatePasswordStrength(
    newPasswordInput.value,
    recoveryUser?.email || "",
  );
  if (!validation.valid) {
    setStatus(validation.message, "error");
    return;
  }

  setStatus("Strong password format.", "success");
};

newPasswordInput.addEventListener("input", showLivePasswordFeedback);
confirmPasswordInput.addEventListener("input", showLivePasswordFeedback);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!recoveryClient) return;

  const newPassword = newPasswordInput.value;
  if (!newPassword || !confirmPasswordInput.value) {
    setStatus("Please enter and confirm your new password.", "error");
    return;
  }
  if (newPassword !== confirmPasswordInput.value) {
    setStatus("Passwords do not match.", "error");
    return;
  }

  const validation = validatePasswordStrength(newPassword, recoveryUser?.email || "");
  if (!validation.valid) {
    setStatus(validation.message, "error");
    return;
  }

  updatePasswordButton.disabled = true;
  updatePasswordButtonText.style.display = "none";
  updatePasswordButtonLottie.style.display = "block";
  setStatus("Updating password...");

  try {
    const { error } = await recoveryClient.auth.updateUser({ password: newPassword });
    if (error) throw error;

    const { error: clearAttemptsError } = await recoveryClient.rpc("clear_failed_login");
    if (clearAttemptsError) {
      console.warn("Could not clear failed login attempts:", clearAttemptsError.message);
    }

    setStatus("Password updated successfully. Redirecting to sign in...", "success");
    try {
      await recoveryClient.auth.signOut({ scope: "local" });
    } catch (signOutError) {
      console.warn("Could not clear the recovery session:", signOutError);
    }
    window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);

    window.setTimeout(() => {
      window.location.replace(new URL("./index.html", window.location.href).href);
    }, 1800);
  } catch (error) {
    console.error("Password update failed:", error);
    setStatus(error.message || "Could not update the password. Please try again.", "error");
    updatePasswordButtonText.style.display = "";
    updatePasswordButtonLottie.style.display = "none";
    updatePasswordButton.disabled = false;
  }
});

const initializeRecovery = async () => {
  if (!recoveryClient) return;

  try {
    if (recoveryCode) {
      const { error } = await recoveryClient.auth.exchangeCodeForSession(recoveryCode);
      if (error) throw error;
      window.history.replaceState(null, "", window.location.pathname);
    } else if (recoveryTokenHash && recoveryType === "recovery") {
      const { error } = await recoveryClient.auth.verifyOtp({
        token_hash: recoveryTokenHash,
        type: "recovery",
      });
      if (error) throw error;
      window.history.replaceState(null, "", window.location.pathname);
    } else if (recoveryAccessToken && recoveryRefreshToken) {
      const { error } = await recoveryClient.auth.setSession({
        access_token: recoveryAccessToken,
        refresh_token: recoveryRefreshToken,
      });
      if (error) throw error;
      window.history.replaceState(null, "", window.location.pathname);
    } else if (recoveryHash) {
      throw new Error("This reset link is missing its recovery session. Please request a new link.");
    }

    const { data, error } = await recoveryClient.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      throw new Error("This reset link is invalid or expired. Please request a new one.");
    }

    const { data: userData, error: userError } = await recoveryClient.auth.getUser();
    if (userError) throw userError;
    recoveryUser = userData.user;
    updatePasswordButton.disabled = false;
  } catch (error) {
    console.warn("No valid password recovery session:", error);
    setStatus(error.message || "This reset link is invalid or expired. Please request a new one.", "error");
    updatePasswordButton.disabled = true;
  }
};

void initializeRecovery();
