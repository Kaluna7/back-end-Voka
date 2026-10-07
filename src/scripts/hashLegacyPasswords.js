/**
 * One-time migration: hash every password still stored as plain text.
 * Safe to run more than once (already-hashed passwords are skipped) and logins keep
 * working, because verifyPassword() understands the scrypt format.
 *
 *   node src/scripts/hashLegacyPasswords.js          (dry run: only counts)
 *   node src/scripts/hashLegacyPasswords.js --apply  (writes the hashes)
 */
require('dotenv').config({ override: true });
const mongoose = require('mongoose');
const { User } = require('../models/User');
const { hashPassword, isPasswordHash } = require('../security/passwords');

const apply = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const cursor = User.find({ password: { $type: 'string', $nin: ['', null] } })
    .select('+password email')
    .lean()
    .cursor();

  let plain = 0;
  let hashed = 0;
  for await (const user of cursor) {
    if (isPasswordHash(user.password)) {
      hashed += 1;
      continue;
    }
    plain += 1;
    if (apply) {
      // Only replace the exact value we read, in case the user logged in meanwhile.
      await User.updateOne(
        { _id: user._id, password: user.password },
        { $set: { password: await hashPassword(user.password) } },
      );
    }
  }
  console.log(
    apply
      ? `Hashed ${plain} plain-text password(s). ${hashed} were already hashed.`
      : `Dry run: ${plain} plain-text password(s) to hash, ${hashed} already hashed. Re-run with --apply.`,
  );
  await mongoose.disconnect();
})().catch(error => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
