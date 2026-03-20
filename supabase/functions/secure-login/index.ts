// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_RETRY_SECONDS = 60;

type LoginRequestBody = {
  email?: string;
  password?: string;
  captchaToken?: string;
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

const parseRetrySeconds = (value: unknown, fallback = DEFAULT_RETRY_SECONDS) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.ceil(numeric);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ authenticated: false, code: "method_not_allowed" }, 405);
  }

  let requestBody: LoginRequestBody;
  try {
    requestBody = (await req.json()) as LoginRequestBody;
  } catch {
    return jsonResponse({ authenticated: false, code: "invalid_payload" }, 400);
  }

  const email = normalizeEmail(requestBody?.email || "");
  const password = String(requestBody?.password || "");
  const captchaToken = String(requestBody?.captchaToken || "").trim();

  if (!email || !isValidEmail(email) || !password) {
    return jsonResponse({ authenticated: false, code: "invalid_credentials" }, 400);
  }

  if (!captchaToken) {
    return jsonResponse({ authenticated: false, code: "captcha_required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("Missing required env config for secure-login function");
    return jsonResponse({ authenticated: false, code: "service_unavailable" }, 503);
  }

  const clientIp = getClientIp(req);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: {
        "x-forwarded-for": clientIp,
        "x-real-ip": clientIp,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let lockoutStatus: any = null;
  try {
    const { data, error } = await supabaseAdmin.rpc("check_login_lockout", {
      user_email: email,
    });

    if (error) {
      throw error;
    }

    lockoutStatus = data;
  } catch (error) {
    console.error("check_login_lockout rpc failed:", error);
    return jsonResponse({ authenticated: false, code: "service_unavailable" }, 503);
  }

  if (lockoutStatus?.locked === true) {
    return jsonResponse({
      authenticated: false,
      code: "locked",
      seconds_remaining: parseRetrySeconds(lockoutStatus?.seconds_remaining),
    }, 429);
  }

  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
    options: {
      captchaToken,
    },
  });

  if (signInError || !signInData?.session || !signInData?.user) {
    const errorText = String(signInError?.message || "").toLowerCase();
    if (errorText.includes("captcha")) {
      return jsonResponse({ authenticated: false, code: "captcha_failed" }, 400);
    }

    let attemptResult: any = null;
    try {
      const { data, error } = await supabaseAdmin.rpc("record_failed_login", {
        user_email: email,
      });

      if (error) {
        throw error;
      }

      attemptResult = data;
    } catch (error) {
      console.error("record_failed_login rpc failed:", error);
      return jsonResponse({ authenticated: false, code: "invalid_credentials" }, 401);
    }

    if (attemptResult?.locked === true) {
      return jsonResponse({
        authenticated: false,
        code: "locked",
        seconds_remaining: parseRetrySeconds(attemptResult?.seconds_remaining),
      }, 429);
    }

    if (attemptResult?.ip_limited === true) {
      return jsonResponse({
        authenticated: false,
        code: "ip_limited",
        seconds_remaining: parseRetrySeconds(attemptResult?.seconds_remaining),
      }, 429);
    }

    const attemptsRemaining = Number(attemptResult?.attempts_remaining);
    return jsonResponse({
      authenticated: false,
      code: "invalid_credentials",
      attempts_remaining: Number.isFinite(attemptsRemaining) ? attemptsRemaining : null,
    }, 401);
  }

  try {
    const { error } = await supabaseAdmin.rpc("clear_failed_login_for_email", {
      user_email: email,
    });

    if (error) {
      console.error("clear_failed_login_for_email rpc failed:", error);
    }
  } catch (error) {
    console.error("clear_failed_login_for_email request failed:", error);
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: signInData.user.id,
      email: signInData.user.email,
    },
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      token_type: signInData.session.token_type,
      expires_in: signInData.session.expires_in,
      expires_at: signInData.session.expires_at,
    },
  });
});
