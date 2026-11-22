import zxcvbn from "zxcvbn";

export const MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_SCORE = 3;

const normalizeForComparison = (value) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const validatePasswordStrength = (password, email = "") => {
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
      message: "Password is too predictable. Avoid using parts of your email.",
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
  if (weakPatterns.some((pattern) => normalizedPassword.includes(pattern))) {
    return {
      valid: false,
      message: "Password is too common. Use a less predictable passphrase.",
    };
  }

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

  return { valid: true, message: "" };
};
