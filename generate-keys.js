const crypto = require('crypto');

console.log('\n🔐 Generating Encryption Keys for .env file\n');
console.log('Copy these to your .env file:\n');
console.log('='.repeat(60));

const encryptionKey = crypto.randomBytes(32).toString('hex');
const iv = crypto.randomBytes(16).toString('hex');

console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`IV=${iv}`);

console.log('\n' + '='.repeat(60));
console.log('\n✅ Keys generated successfully!');
console.log('📝 Add these to your .env file\n');
