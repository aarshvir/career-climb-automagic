#!/usr/bin/env node

/**
 * Simple migration script that applies SQL directly to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://gvftdfriujrkpptdueyb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZnRkZnJpdWpya3BwdGR1ZXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDkzOTIsImV4cCI6MjA3MzAyNTM5Mn0.NrjUlE8YB-M7pspX0We2kikfYDTvngqezR6hPhFna0k';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function applyMigration() {
  try {
    console.log('🚀 Applying database migration...');
    
    const migrationFile = path.join(process.cwd(), 'supabase', 'migrations', '0000_init_schema.sql');
    
    if (!fs.existsSync(migrationFile)) {
      console.error('❌ Migration file not found:', migrationFile);
      return;
    }

    const sql = fs.readFileSync(migrationFile, 'utf8');
    console.log('📄 Running migration: 0000_init_schema.sql');
    
    // Split the SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`🔨 Executing: ${statement.substring(0, 50)}...`);
        
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error(`❌ Error executing statement:`, error);
          // Continue with other statements even if one fails
        } else {
          console.log(`✅ Statement executed successfully`);
        }
      }
    }
    
    console.log('✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

applyMigration();
