#!/usr/bin/env node

/**
 * Script to apply the PDF instance migration
 * This updates the database constraint to allow 'pdf' instance type
 * 
 * Usage: node apply-pdf-migration.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from frontend/.env.local or .env
const envLocalPath = path.join(__dirname, 'frontend', '.env.local');
const envPath = path.join(__dirname, 'frontend', '.env');

if (fs.existsSync(envLocalPath)) {
  console.log('[Migration] Loading environment from:', envLocalPath);
  const envContent = fs.readFileSync(envLocalPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} else if (fs.existsSync(envPath)) {
  console.log('[Migration] Loading environment from:', envPath);
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
} else {
  console.warn('[Migration] No .env or .env.local file found in frontend/');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Please set them in frontend/.env.local');
  process.exit(1);
}

console.log('[Migration] Supabase URL:', SUPABASE_URL);
console.log('[Migration] Service role key configured:', SERVICE_ROLE_KEY ? '✓' : '✗');

// Read the migration SQL
const migrationPath = path.join(__dirname, 'supabase', 'migrations', '003_enable_pdf_instances.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('[Migration] Migration SQL:');
console.log(migrationSQL);
console.log();

// Parse the Supabase URL to get the project reference
const url = new URL(SUPABASE_URL);
const projectRef = url.hostname.split('.')[0];

console.log('[Migration] Project reference:', projectRef);
console.log('[Migration] Applying migration via Supabase Management API...');
console.log();

// Supabase Management API endpoint for executing SQL
const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const postData = JSON.stringify({
  query: migrationSQL
});

const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'apikey': SERVICE_ROLE_KEY
  }
};

console.log('[Migration] Making API request...');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('[Migration] Response status:', res.statusCode);
    console.log('[Migration] Response:', data);
    console.log();

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ Migration applied successfully!');
      console.log('   You can now create PDF instances.');
    } else if (res.statusCode === 404) {
      console.log('⚠️  Management API endpoint not available.');
      console.log('   Please apply the migration manually via Supabase SQL Editor:');
      console.log('   1. Go to https://supabase.com/dashboard/project/' + projectRef + '/editor');
      console.log('   2. Open the SQL Editor');
      console.log('   3. Run the following SQL:');
      console.log();
      console.log(migrationSQL);
    } else {
      console.error('❌ Failed to apply migration');
      console.error('   Please apply manually via Supabase SQL Editor (see above)');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log();
  console.log('Please apply the migration manually via Supabase SQL Editor:');
  console.log('1. Go to https://supabase.com/dashboard');
  console.log('2. Select your project');
  console.log('3. Go to SQL Editor');
  console.log('4. Run the following SQL:');
  console.log();
  console.log(migrationSQL);
});

req.write(postData);
req.end();

