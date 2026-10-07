/**
 * Input rules shared by the auth and user endpoints.
 * Keep in sync with Moocha/src/utils/validation.ts (same regexes on the client).
 */

/**
 * Practical email check: local part of allowed characters (no leading/trailing/double dots),
 * a domain of labels (letters, digits, hyphens, not starting/ending with a hyphen)
 * and a 2+ letter TLD. Max 254 characters overall.
 */
const EMAIL_REGEX =
  /^(?=.{6,254}$)(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** Names: letters from any language, spaces, apostrophes, dots and hyphens. 2 to 50 characters. */
const NAME_REGEX = /^(?=.{2,50}$)[\p{L}\p{M}][\p{L}\p{M} .'’-]*[\p{L}\p{M}.]$/u;

/**
 * Password: 8 to 64 characters, at least one letter and one number,
 * no spaces at the start or end, no control characters.
 */
const PASSWORD_REGEX = /^(?=.*\p{L})(?=.*\d)(?!\s)(?!.*\s$)[^\p{Cc}]{8,64}$/u;

/** 6-digit email verification code. */
const VERIFICATION_CODE_REGEX = /^\d{6}$/;

/** MongoDB ObjectId. */
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/** Ids used for companions, characters and plans (slug style). */
const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Invitation codes. */
const INVITATION_CODE_REGEX = /^[A-Z0-9]{4,16}$/i;

const PLAN_IDS = new Set(['starter', 'pro', 'premium']);

const normalizeEmail = value => String(value || '').trim().toLowerCase();

const isValidEmail = value => EMAIL_REGEX.test(normalizeEmail(value));
const isValidName = value => NAME_REGEX.test(String(value || '').trim());
const isStrongPassword = value => typeof value === 'string' && PASSWORD_REGEX.test(value);
const isValidCode = value => VERIFICATION_CODE_REGEX.test(String(value || '').trim());
const isObjectId = value => OBJECT_ID_REGEX.test(String(value || ''));
const isSlug = value => SLUG_REGEX.test(String(value || ''));
const isPlanId = value => PLAN_IDS.has(String(value || ''));

/** Upper bound for passwords sent to login (stops huge payloads hitting scrypt). */
const MAX_PASSWORD_LENGTH = 128;

module.exports = {
  EMAIL_REGEX,
  NAME_REGEX,
  PASSWORD_REGEX,
  VERIFICATION_CODE_REGEX,
  OBJECT_ID_REGEX,
  SLUG_REGEX,
  INVITATION_CODE_REGEX,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  isValidEmail,
  isValidName,
  isStrongPassword,
  isValidCode,
  isObjectId,
  isSlug,
  isPlanId,
};
