#!/usr/bin/env node

/**
 * Simple script to apply the PDF instance migration using Supabase client
 * Usage: node apply-migration-simple.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('[Migration] Creating Supabase client...');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log('[Migration] Reading migration SQL...');
const migrationSQL = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '003_enable_pdf_instances.sql'),
  'utf-8'
);

console.log('[Migration] SQL to execute:');
console.log(migrationSQL);
console.log();

// Split the SQL into individual statements
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log('[Migration] Executing', statements.length, 'SQL statement(s)...');

try {
  // Execute each statement separately
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`[Migration] Executing statement ${i + 1}/${statements.length}:`);
    console.log(statement);
    
    const { data, error } = await supabase.rpc('exec', { sql: statement + ';' });
    
    if (error) {
      console.error(`[Migration] ❌ Error on statement ${i + 1}:`, error.message);
      console.error('[Migration] Full error:', JSON.stringify(error, null, 2));
      console.log();
      console.log('⚠️  Automated migration failed.');
      console.log('   Please see APPLY_MIGRATION_INSTRUCTIONS.md for manual steps.');
      process.exit(1);
    }
    
    console.log(`[Migration] ✓ Statement ${i + 1} executed successfully`);
  }
  
  console.log();
  console.log('✅ Migration applied successfully!');
  console.log('   You can now create PDF instances.');
  
} catch (error) {
  console.error('[Migration] ❌ Unexpected error:', error.message);
  console.log();
  console.log('⚠️  Automated migration failed.');
  console.log('   Please see APPLY_MIGRATION_INSTRUCTIONS.md for manual steps.');
  process.exit(1);
}

