const nodemailer = require('nodemailer');
const { getEnv } = require('../config/env');

const escapeHtml = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const DEFAULT_SENDER_NAME = 'Moocha';

let cachedTransport = null;

const buildTransport = () => {
  if (cachedTransport) {
    return cachedTransport;
  }
  const host = getEnv('SMTP_HOST', 'smtp.hostinger.com');
  const port = Number(getEnv('SMTP_PORT', '465'));
  const secureFlag = getEnv('SMTP_SECURE');
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');

  if (!user || !pass) {
    return null;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: secureFlag ? secureFlag.toLowerCase() === 'true' : port === 465,
    auth: { user, pass },
  });
  return cachedTransport;
};

/** "Moocha" <sender@…> — SMTP_SENDER_* first, older EMAIL_FROM_* names still honoured. */
const resolveSender = () => {
  const address = (getEnv('SMTP_SENDER_EMAIL') || getEnv('EMAIL_FROM_ADDRESS') || getEnv('SMTP_USER') || '').trim();
  const name = (getEnv('SMTP_SENDER_NAME') || getEnv('EMAIL_FROM_NAME') || DEFAULT_SENDER_NAME).replace(/"/g, '');
  return address ? `"${name}" <${address}>` : '';
};

const notConfigured = () => {
  console.warn('[email] Set SMTP_USER, SMTP_PASS and SMTP_SENDER_EMAIL. See back-end/.env.example.');
  const err = new Error('EMAIL_NOT_CONFIGURED');
  err.code = 'EMAIL_NOT_CONFIGURED';
  return err;
};

const COPY = {
  id: {
    signup: {
      subject: 'Kode verifikasi akun Moocha',
      heading: 'Verifikasi email kamu',
      body: 'Masukkan kode ini di aplikasi Moocha untuk menyelesaikan pendaftaran akun.',
    },
    reset_password: {
      subject: 'Kode reset password Moocha',
      heading: 'Atur ulang password',
      body: 'Kami menerima permintaan untuk mengatur ulang password akun Moocha kamu. Masukkan kode ini di aplikasi.',
    },
    greeting: name => (name ? `Halo ${name},` : 'Halo,'),
    expires: minutes => `Kode berlaku ${minutes} menit. Jangan bagikan kode ini ke siapa pun.`,
    ignore: 'Kalau kamu tidak meminta kode ini, abaikan saja email ini.',
  },
  en: {
    signup: {
      subject: 'Your Moocha verification code',
      heading: 'Verify your email',
      body: 'Enter this code in the Moocha app to finish creating your account.',
    },
    reset_password: {
      subject: 'Your Moocha password reset code',
      heading: 'Reset your password',
      body: 'We received a request to reset the password of your Moocha account. Enter this code in the app.',
    },
    greeting: name => (name ? `Hi ${name},` : 'Hi,'),
    expires: minutes => `This code expires in ${minutes} minutes. Never share it with anyone.`,
    ignore: "If you didn't request this code, you can safely ignore this email.",
  },
};

const pickCopy = language => (String(language || '').toLowerCase().startsWith('id') ? COPY.id : COPY.en);

/**
 * Sends a 6-digit verification code.
 * @param {{ toEmail: string, code: string, purpose: 'signup'|'reset_password', displayName?: string, language?: string, expiresInMinutes: number }} params
 */
const sendVerificationCodeEmail = async ({
  toEmail,
  code,
  purpose,
  displayName = '',
  language = 'id',
  expiresInMinutes,
}) => {
  const transport = buildTransport();
  const from = resolveSender();
  if (!transport || !from) {
    throw notConfigured();
  }

  const copy = pickCopy(language);
  const variant = copy[purpose] || copy.signup;
  const greeting = copy.greeting(displayName);
  const expires = copy.expires(expiresInMinutes);

  const text = `${greeting}\n\n${variant.body}\n\n${code}\n\n${expires}\n${copy.ignore}\n\n— Moocha`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F4F2FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FB;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#7C5CFF;padding:22px 28px;color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:-0.3px;">Moocha</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 6px;color:#0F172A;font-size:20px;font-weight:800;">${escapeHtml(variant.heading)}</p>
          <p style="margin:0 0 4px;color:#334155;font-size:15px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:22px;">${escapeHtml(variant.body)}</p>
          <div style="background:#F1EDFF;border-radius:14px;padding:18px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#4C1D95;">${escapeHtml(code)}</div>
          <p style="margin:22px 0 6px;color:#64748B;font-size:13px;line-height:19px;">${escapeHtml(expires)}</p>
          <p style="margin:0;color:#94A3B8;font-size:13px;line-height:19px;">${escapeHtml(copy.ignore)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await transport.sendMail({ from, to: toEmail, subject: variant.subject, text, html });
};

module.exports = {
  buildTransport,
  sendVerificationCodeEmail,
};
