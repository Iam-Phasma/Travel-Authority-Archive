// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_COOLDOWN_SECONDS = 60;

type ResetRequestBody = {
  email?: string;
  captchaToken?: string;
  redirectTo?: string;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getClientIp = (req: Request) => {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(",");
    if (firstIp && firstIp.trim()) {
      return firstIp.trim();
    }
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown";
};

const parseCooldownSeconds = (value: unknown, fallback = DEFAULT_COOLDOWN_SECONDS) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.ceil(numeric);
};

const verifyHCaptcha = async (token: string, secret: string, remoteIp: string) => {
  const formBody = new URLSearchParams();
  formBody.set("secret", secret);
  formBody.set("response", token);
  if (remoteIp && remoteIp !== "unknown") {
    formBody.set("remoteip", remoteIp);
  }

  const response = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  if (!response.ok) {
    return false;
  }

  const payload = await response.json();
  return payload?.success === true;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ accepted: false, code: "method_not_allowed" }, 405);
  }

  let requestBody: ResetRequestBody;
  try {
    requestBody = (await req.json()) as ResetRequestBody;
  } catch {
    return jsonResponse({ accepted: false, code: "invalid_payload" });
  }

  const email = normalizeEmail(requestBody?.email || "");
  const captchaToken = (requestBody?.captchaToken || "").trim();

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ accepted: false, code: "invalid_email" });
  }

  if (!captchaToken) {
    return jsonResponse({ accepted: false, code: "captcha_required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hcaptchaSecret = Deno.env.get("HCAPTCHA_SECRET");
  const configuredRedirectUrl = (Deno.env.get("PASSWORD_RESET_REDIRECT_URL") || "").trim();
  const requestRedirectUrl = (requestBody?.redirectTo || "").trim();
  const redirectTo = configuredRedirectUrl || requestRedirectUrl;

  if (!supabaseUrl || !serviceRoleKey || !hcaptchaSecret || !redirectTo) {
    console.error("Missing required env config for request-password-reset function");
    return jsonResponse({
      accepted: true,
      cooldown_seconds: DEFAULT_COOLDOWN_SECONDS,
      limited: true,
    });
  }

  const clientIp = getClientIp(req);

  let captchaVerified = false;
  try {
    captchaVerified = await verifyHCaptcha(captchaToken, hcaptchaSecret, clientIp);
  } catch (error) {
    console.error("hCaptcha verification error:", error);
    captchaVerified = false;
  }

  if (!captchaVerified) {
    return jsonResponse({ accepted: false, code: "captcha_failed" });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let emailCooldownSeconds = 0;
  let ipCooldownSeconds = 0;

  try {
    const { data: ipResult, error: ipError } = await supabaseAdmin.rpc(
      "consume_password_reset_ip_rate_limit",
      { client_ip: clientIp }
    );

    if (ipError) {
      throw ipError;
    }

    if (ipResult?.allowed === false) {
      ipCooldownSeconds = parseCooldownSeconds(ipResult?.seconds_remaining);
    }

    const { data: emailResult, error: emailError } = await supabaseAdmin.rpc(
      "consume_password_reset_rate_limit",
      { user_email: email }
    );

    if (emailError) {
      throw emailError;
    }

    if (emailResult?.allowed === false) {
      emailCooldownSeconds = parseCooldownSeconds(emailResult?.seconds_remaining);
    }
  } catch (error) {
    console.error("Rate-limit consume error:", error);
    return jsonResponse({
      accepted: true,
      cooldown_seconds: DEFAULT_COOLDOWN_SECONDS,
      limited: true,
    });
  }

  const effectiveCooldown = Math.max(
    DEFAULT_COOLDOWN_SECONDS,
    emailCooldownSeconds,
    ipCooldownSeconds
  );

  if (emailCooldownSeconds > 0 || ipCooldownSeconds > 0) {
    return jsonResponse({
      accepted: true,
      cooldown_seconds: effectiveCooldown,
      limited: true,
    });
  }

  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (resetError) {
    console.error("Password reset dispatch error:", resetError);
  }

  return jsonResponse({
    accepted: true,
    cooldown_seconds: effectiveCooldown,
    limited: false,
  });
});
