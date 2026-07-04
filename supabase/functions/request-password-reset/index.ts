// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://iam-phasma.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const DEFAULT_COOLDOWN_SECONDS = 60;

type ResetRequestBody = {
  email?: string;
  captchaToken?: string;
};

const getAllowedOrigins = () => {
  const configured = (Deno.env.get("CORS_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
};

const buildCorsHeaders = (req: Request): Record<string, string> => {
  const requestOrigin = (req.headers.get("origin") || "").trim();
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] || "null";

  return {
    ...baseCorsHeaders,
    "Access-Control-Allow-Origin": allowOrigin,
  };
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isLikelyIp = (value: string) => {
  const candidate = value.trim();
  if (!candidate) return false;
  const isV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)
    && candidate.split(".").every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
  const isV6 = /^[0-9a-f:]+$/i.test(candidate) && candidate.includes(":");
  return isV4 || isV6;
};

const firstForwardedValue = (value: string | null) => {
  if (!value) return "";
  const [firstValue] = value.split(",");
  return (firstValue || "").trim();
};

const getClientIp = (req: Request) => {
  const trustedIpHeaders = [
    "cf-connecting-ip",
    "fly-client-ip",
    "x-vercel-forwarded-for",
    "x-envoy-external-address",
  ];

  for (const headerName of trustedIpHeaders) {
    const candidate = firstForwardedValue(req.headers.get(headerName));
    if (isLikelyIp(candidate)) {
      return candidate;
    }
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
    return new Response("ok", { headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { accepted: false, code: "method_not_allowed" }, 405);
  }

  let requestBody: ResetRequestBody;
  try {
    requestBody = (await req.json()) as ResetRequestBody;
  } catch {
    return jsonResponse(req, { accepted: false, code: "invalid_payload" });
  }

  const email = normalizeEmail(requestBody?.email || "");
  const captchaToken = (requestBody?.captchaToken || "").trim();

  if (!email || !isValidEmail(email)) {
    return jsonResponse(req, { accepted: false, code: "invalid_email" });
  }

  if (!captchaToken) {
    return jsonResponse(req, { accepted: false, code: "captcha_required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hcaptchaSecret = Deno.env.get("HCAPTCHA_SECRET");
  const configuredRedirectUrl = (Deno.env.get("PASSWORD_RESET_REDIRECT_URL") || "").trim();
  const redirectTo = configuredRedirectUrl;

  if (!supabaseUrl || !serviceRoleKey || !hcaptchaSecret || !redirectTo) {
    console.error("Missing required env config for request-password-reset function");
    return jsonResponse(req, {
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
    return jsonResponse(req, { accepted: false, code: "captcha_failed" });
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
    return jsonResponse(req, {
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
    return jsonResponse(req, {
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

  return jsonResponse(req, {
    accepted: true,
    cooldown_seconds: effectiveCooldown,
    limited: false,
  });
});
