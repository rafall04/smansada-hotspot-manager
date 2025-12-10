#!/usr/bin/env node

/**
 * Helper script to generate encrypted password for environment variables
 * 
 * Usage:
 *   node scripts/setup-router-env.js <plain_password>
 * 
 * Output:
 *   Encrypted password that can be used in .env file or environment variables
 */

const cryptoHelper = require('../utils/cryptoHelper');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function generateEncryptedPassword(plainPassword) {
  try {
    if (!plainPassword || plainPassword.trim() === '') {
      throw new Error('Password cannot be empty');
    }

    const encrypted = cryptoHelper.encrypt(plainPassword);
    
    console.log('\n✅ Encrypted password generated:');
    console.log('='.repeat(60));
    console.log(encrypted);
    console.log('='.repeat(60));
    console.log('\n📝 Add this to your .env file:');
    console.log(`ROUTER_PASSWORD_ENCRYPTED=${encrypted}`);
    console.log('\nOr set as environment variable:');
    console.log(`export ROUTER_PASSWORD_ENCRYPTED="${encrypted}"`);
    console.log('\n');
    
    return encrypted;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const passwordArg = process.argv[2];

if (passwordArg) {
  generateEncryptedPassword(passwordArg);
  rl.close();
} else {
  rl.question('Enter router password: ', (password) => {
    rl.close();
    generateEncryptedPassword(password);
  });
}

