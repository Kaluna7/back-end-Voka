require('dotenv').config();
const { getEnv } = require('../src/config/env');
const { buildTransport } = require('../src/services/emailService');

const to = process.argv[2] || 'kaluna12345678910@gmail.com';
const body = process.argv[3] || 'halo';

async function main() {
  const transport = buildTransport();
  if (!transport) {
    console.error('SMTP not configured (SMTP_USER / SMTP_PASS)');
    process.exit(1);
  }

  const fromName = getEnv('EMAIL_FROM_NAME', 'Moocha.AI');
  const fromAddress = getEnv('EMAIL_FROM_ADDRESS') || getEnv('SMTP_USER');

  const info = await transport.sendMail({
    from: `"${fromName.replace(/"/g, '')}" <${fromAddress}>`,
    to,
    subject: 'Test Moocha SMTP',
    text: body,
    html: `<p>${body}</p>`,
  });

  console.log('Sent OK');
  console.log('messageId:', info.messageId);
  console.log('to:', to);
  console.log('from:', fromAddress);
}

main().catch(err => {
  console.error('Send failed:', err.message);
  if (err.response) {
    console.error(err.response);
  }
  process.exit(1);
});
