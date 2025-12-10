#!/usr/bin/env node

/**
 * Validate and fix .env file format
 * 
 * Checks for common issues:
 * - Missing required variables
 * - Incorrect format (quotes, spaces, etc.)
 * - Invalid values
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

const REQUIRED_VARS = [
  'SESSION_SECRET',
  'ENCRYPTION_KEY'
];

const ROUTER_VARS = [
  'ROUTER_IP',
  'ROUTER_PORT',
  'ROUTER_USER',
  'ROUTER_PASSWORD_ENCRYPTED'
];

function validateEnvFile() {
  console.log('='.repeat(60));
  console.log('🔍 Validating .env file...');
  console.log('='.repeat(60));
  console.log('');

  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file does not exist!');
    console.log('');
    console.log('💡 Create .env file with:');
    console.log('   cp .env.example .env');
    console.log('   # Then edit .env and fill in the values');
    return false;
  }

  const fileContent = fs.readFileSync(envPath, 'utf8');
  const lines = fileContent.split('\n');

  // Show first 10 lines for analysis (masked)
  console.log('📄 First 10 lines of .env file (masked for security):');
  console.log('-'.repeat(60));
  lines.slice(0, 10).forEach((line, index) => {
    if (line.trim() && !line.trim().startsWith('#')) {
      const masked = line.replace(/=([^=]+)$/, (match, value) => {
        if (value.trim().length > 0) {
          return '=' + (value.trim().length > 8 ? value.trim().substring(0, 4) + '***' : '***');
        }
        return match;
      });
      console.log(`${(index + 1).toString().padStart(2, ' ')}: ${masked}`);
    } else {
      console.log(`${(index + 1).toString().padStart(2, ' ')}: ${line}`);
    }
  });
  console.log('-'.repeat(60));
  console.log('');

  const issues = [];
  const envVars = {};
  let hasRouterConfig = false;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    // Check format: should be KEY=VALUE (no spaces around =)
    if (!trimmed.includes('=')) {
      issues.push({
        line: lineNum,
        issue: 'Missing = sign',
        content: trimmed
      });
      return;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('='); // Handle values with = in them
    const keyTrimmed = key.trim();
    const valueTrimmed = value.trim();

    // Check for spaces around =
    if (key !== keyTrimmed || (valueParts.length > 0 && value !== valueTrimmed && !value.startsWith('"') && !value.startsWith("'"))) {
      issues.push({
        line: lineNum,
        issue: 'Spaces around = sign (should be KEY=VALUE)',
        content: trimmed
      });
    }

    // Check for quotes (should not have quotes unless value contains spaces)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      // Quotes are OK if value contains spaces, but dotenv handles them
      // We'll just warn if it's simple value
      if (!value.includes(' ') && value.length > 2) {
        issues.push({
          line: lineNum,
          issue: 'Unnecessary quotes (dotenv handles quotes automatically)',
          content: trimmed,
          suggestion: `${keyTrimmed}=${valueTrimmed.replace(/^["']|["']$/g, '')}`
        });
      }
    }

    envVars[keyTrimmed] = valueTrimmed.replace(/^["']|["']$/g, ''); // Remove quotes for checking

    // Check router config (new format)
    if (ROUTER_VARS.includes(keyTrimmed)) {
      hasRouterConfig = true;
    }

    // Check legacy router config
    if (['MIKROTIK_HOST', 'MIKROTIK_PORT', 'MIKROTIK_USER', 'MIKROTIK_PASSWORD'].includes(keyTrimmed)) {
      hasRouterConfig = true;
    }
  });

  // Check required variables
  REQUIRED_VARS.forEach(varName => {
    if (!envVars[varName]) {
      issues.push({
        line: 'N/A',
        issue: `Missing required variable: ${varName}`,
        content: ''
      });
    }
  });

  // Check for legacy format (MIKROTIK_*)
  const legacyVars = ['MIKROTIK_HOST', 'MIKROTIK_PORT', 'MIKROTIK_USER', 'MIKROTIK_PASSWORD'];
  const legacyVarsSet = legacyVars.filter(v => envVars[v]);
  if (legacyVarsSet.length > 0) {
    issues.push({
      line: 'N/A',
      issue: `Using legacy environment variable names (MIKROTIK_*). Please migrate to new format (ROUTER_*)`,
      content: `Found: ${legacyVarsSet.join(', ')}`,
      suggestion: `Migrate to: ROUTER_IP, ROUTER_PORT, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED`
    });
  }

  // Check router config completeness
  const routerVarsSet = ROUTER_VARS.filter(v => envVars[v]);
  if (hasRouterConfig && routerVarsSet.length > 0 && routerVarsSet.length < ROUTER_VARS.length) {
    const missing = ROUTER_VARS.filter(v => !envVars[v]);
    issues.push({
      line: 'N/A',
      issue: `Incomplete router config: missing ${missing.join(', ')}`,
      content: `Found: ${routerVarsSet.join(', ')}`
    });
  }

  // Validate values
  if (envVars.ROUTER_PORT) {
    const port = parseInt(envVars.ROUTER_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      issues.push({
        line: 'N/A',
        issue: 'ROUTER_PORT must be a number between 1 and 65535',
        content: `Current value: ${envVars.ROUTER_PORT}`
      });
    }
  }

  if (envVars.ENCRYPTION_KEY) {
    if (envVars.ENCRYPTION_KEY.length !== 64) {
      issues.push({
        line: 'N/A',
        issue: 'ENCRYPTION_KEY must be 64 characters (32 bytes hex)',
        content: `Current length: ${envVars.ENCRYPTION_KEY.length}`
      });
    }
  }

  // Check if ROUTER_PASSWORD_ENCRYPTED looks like plain text (not encrypted)
  if (envVars.ROUTER_PASSWORD_ENCRYPTED) {
    const encryptedPattern = /^[0-9a-f]{64,}$/i; // Encrypted should be long hex string
    if (!encryptedPattern.test(envVars.ROUTER_PASSWORD_ENCRYPTED) && envVars.ROUTER_PASSWORD_ENCRYPTED.length < 64) {
      issues.push({
        line: 'N/A',
        issue: 'ROUTER_PASSWORD_ENCRYPTED appears to be plain text. Please encrypt it.',
        content: `Current value looks like plain password (length: ${envVars.ROUTER_PASSWORD_ENCRYPTED.length})`,
        suggestion: `Run: node scripts/setup-router-env.js your_password`
      });
    }
  }

  // Report results
  if (issues.length === 0) {
    console.log('✅ .env file format is valid!');
    console.log('');
    
    if (hasRouterConfig && routerVarsSet.length === ROUTER_VARS.length) {
      console.log('✅ Router configuration found in environment variables');
      console.log('   This is the PRIMARY storage method (most reliable)');
    } else if (hasRouterConfig) {
      console.log('⚠️  Router configuration is incomplete');
      console.log('   Missing:', ROUTER_VARS.filter(v => !envVars[v]).join(', '));
    } else {
      console.log('ℹ️  Router configuration not found in .env');
      console.log('   System will use JSON file or database as fallback');
    }
    
    console.log('');
    return true;
  } else {
    console.log(`❌ Found ${issues.length} issue(s):`);
    console.log('');
    
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. Line ${issue.line}: ${issue.issue}`);
      if (issue.content) {
        console.log(`   Content: ${issue.content}`);
      }
      if (issue.suggestion) {
        console.log(`   Suggested fix: ${issue.suggestion}`);
      }
      console.log('');
    });
    
    return false;
  }
}

function fixEnvFile() {
  console.log('='.repeat(60));
  console.log('🔧 Attempting to fix .env file...');
  console.log('='.repeat(60));
  console.log('');

  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file does not exist!');
    return false;
  }

  const fileContent = fs.readFileSync(envPath, 'utf8');
  const lines = fileContent.split('\n');
  const fixedLines = [];
  let changed = false;

  // Legacy to new format mapping
  const legacyMapping = {
    'MIKROTIK_HOST': 'ROUTER_IP',
    'MIKROTIK_PORT': 'ROUTER_PORT',
    'MIKROTIK_USER': 'ROUTER_USER',
    'MIKROTIK_PASSWORD': 'ROUTER_PASSWORD_ENCRYPTED'
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Keep comments and empty lines as-is
    if (!trimmed || trimmed.startsWith('#')) {
      fixedLines.push(line);
      return;
    }

    // Fix format issues
    if (trimmed.includes('=')) {
      let [key, ...valueParts] = trimmed.split('=');
      let value = valueParts.join('=');
      
      // Remove spaces around =
      key = key.trim();
      value = value.trim();

      // Migrate legacy format to new format
      if (legacyMapping[key]) {
        const newKey = legacyMapping[key];
        console.log(`Line ${index + 1}: Migrating legacy format`);
        console.log(`  Before: ${key}=${value.substring(0, 8)}***`);
        console.log(`  After:  ${newKey}=${value.substring(0, 8)}***`);
        console.log('');
        key = newKey;
        changed = true;
      }

      // Remove unnecessary quotes (dotenv handles them)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        if (!value.includes(' ') || value.length <= 2) {
          value = value.replace(/^["']|["']$/g, '');
          changed = true;
        }
      }

      const fixedLine = `${key}=${value}`;
      if (fixedLine !== trimmed && !legacyMapping[trimmed.split('=')[0].trim()]) {
        console.log(`Line ${index + 1}: Fixed format`);
        console.log(`  Before: ${trimmed}`);
        console.log(`  After:  ${fixedLine}`);
        console.log('');
        changed = true;
      }
      fixedLines.push(fixedLine);
    } else {
      // Invalid line, keep as-is but warn
      console.warn(`Line ${index + 1}: Invalid format (keeping as-is)`);
      console.warn(`  Content: ${trimmed}`);
      fixedLines.push(line);
    }
  });

  if (changed) {
    const fixedContent = fixedLines.join('\n');
    const backupPath = envPath + '.backup';
    
    // Create backup
    fs.copyFileSync(envPath, backupPath);
    console.log(`✓ Backup created: ${backupPath}`);
    
    // Write fixed content
    fs.writeFileSync(envPath, fixedContent, 'utf8');
    console.log('✓ .env file fixed!');
    console.log('');
    return true;
  } else {
    console.log('ℹ️  No fixes needed');
    console.log('');
    return false;
  }
}

// Main
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

if (shouldFix) {
  const isValid = validateEnvFile();
  if (!isValid) {
    console.log('');
    fixEnvFile();
    console.log('');
    console.log('🔍 Re-validating after fix...');
    console.log('');
    validateEnvFile();
  }
} else {
  const isValid = validateEnvFile();
  if (!isValid) {
    console.log('');
    console.log('💡 To automatically fix issues, run:');
    console.log('   node scripts/validate-env.js --fix');
    console.log('');
    process.exit(1);
  }
}

