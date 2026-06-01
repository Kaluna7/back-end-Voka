const https = require('https');
const nodemailer = require('nodemailer');
const { getEnv } = require('../config/env');

const escapeHtml = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildTransport = () => {
  const host = getEnv('BREVO_SMTP_HOST', 'smtp-relay.brevo.com');
  const port = Number(getEnv('BREVO_SMTP_PORT', '587'));
  const user = getEnv('BREVO_SMTP_USER');
  const pass = getEnv('BREVO_SMTP_PASS');

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

/**
 * Brevo Transactional Email API (kunci `xkeysib-...` dari dashboard).
 * @see https://developers.brevo.com/reference/sendtransacemail
 */
const sendViaBrevoTransactionalApi = async ({ apiKey, fromName, fromAddress, toEmail, subject, html, text }) => {
  const payload = JSON.stringify({
    sender: { name: fromName, email: fromAddress },
    to: [{ email: toEmail }],
    subject,
    htmlContent: html,
    textContent: text,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 20000,
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
            return;
          }
          const err = new Error(`Brevo API HTTP ${res.statusCode}`);
          err.code = 'BREVO_API_ERROR';
          err.statusCode = res.statusCode;
          err.body = body;
          reject(err);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      const err = new Error('Brevo API timeout');
      err.code = 'BREVO_API_ERROR';
      reject(err);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

const DEFAULT_FROM_NAME = 'Voka.AI';
const DEFAULT_FROM_EMAIL = 'kaluna12345678910@gmail.com';

const resolveFromAddress = () => {
  const from = getEnv('EMAIL_FROM_ADDRESS') || getEnv('BREVO_SMTP_USER') || DEFAULT_FROM_EMAIL;
  return typeof from === 'string' ? from.trim() : DEFAULT_FROM_EMAIL;
};

const sendGoogleVerificationCode = async ({ toEmail, code, displayName }) => {
  const fromName = getEnv('EMAIL_FROM_NAME', DEFAULT_FROM_NAME);
  const fromAddress = resolveFromAddress();
  const subject = 'Kode verifikasi Voka';
  const text = `Halo${displayName ? ` ${displayName}` : ''},\n\nKode verifikasi akun Voka-mu: ${code}\n\nKode berlaku 15 menit. Jangan bagikan ke siapa pun.\n`;
  const html = `<p>Halo${displayName ? ` ${escapeHtml(displayName)}` : ''},</p><p>Kode verifikasi akun Voka-mu:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${escapeHtml(code)}</p><p>Kode berlaku 15 menit. Jangan bagikan ke siapa pun.</p>`;

  const apiKey = getEnv('BREVO_API_KEY') || getEnv('BREVO_TRANSACTIONAL_API_KEY');
  if (apiKey) {
    if (!fromAddress) {
      console.error(
        '[email] BREVO_API_KEY diatur tetapi EMAIL_FROM_ADDRESS kosong. Isi alamat pengirim yang sudah diverifikasi di Brevo.',
      );
      const err = new Error('EMAIL_FROM_ADDRESS_REQUIRED');
      err.code = 'EMAIL_FROM_ADDRESS_REQUIRED';
      throw err;
    }
    try {
      await sendViaBrevoTransactionalApi({
        apiKey: apiKey.trim(),
        fromName: fromName.replace(/"/g, ''),
        fromAddress,
        toEmail,
        subject,
        html,
        text,
      });
      return;
    } catch (e) {
      if (e.body) {
        console.error('[email] Brevo API response:', e.body);
      }
      throw e;
    }
  }

  const transport = buildTransport();
  if (!transport) {
    console.warn(
      '[email] Atur BREVO_API_KEY (disarankan) atau BREVO_SMTP_USER + BREVO_SMTP_PASS. Lihat back-end/.env.example.',
    );
    const err = new Error('EMAIL_NOT_CONFIGURED');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  await transport.sendMail({
    from: `"${fromName.replace(/"/g, '')}" <${fromAddress || getEnv('BREVO_SMTP_USER')}>`,
    to: toEmail,
    subject,
    text,
    html,
  });
};

module.exports = {
  sendGoogleVerificationCode,
  buildTransport,
};
