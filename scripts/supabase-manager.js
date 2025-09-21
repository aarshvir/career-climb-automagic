#!/usr/bin/env node

/**
 * Supabase Database Manager
 * Automated script to create tables and manage database schema
 * without requiring manual Supabase dashboard access
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class SupabaseManager {
  constructor() {
    this.projectUrl = process.env.SUPABASE_URL || 'https://gvftdfriujrkpptdueyb.supabase.co';
    this.apiKey = process.env.SUPABASE_ANON_KEY;
    this.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!this.apiKey) {
      console.error('❌ SUPABASE_ANON_KEY environment variable is required');
      console.log('📝 Please set your Supabase API key:');
      console.log('   Windows: set SUPABASE_ANON_KEY=your_api_key');
      console.log('   PowerShell: $env:SUPABASE_ANON_KEY="your_api_key"');
      process.exit(1);
    }
  }

  async executeSQL(sql) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        query: sql
      });

      const options = {
        hostname: this.projectUrl.replace('https://', '').replace('http://', ''),
        port: 443,
        path: '/rest/v1/rpc/execute_sql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'apikey': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`,
          'Prefer': 'return=minimal'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: responseData });
          } else {
            reject({ success: false, status: res.statusCode, data: responseData });
          }
        });
      });

      req.on('error', (error) => {
        reject({ success: false, error: error.message });
      });

      req.write(data);
      req.end();
    });
  }

  async createTable(tableName, columns) {
    const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns});`;
    console.log(`🔨 Creating table: ${tableName}`);
    console.log(`📝 SQL: ${sql}`);
    
    try {
      const result = await this.executeSQL(sql);
      console.log(`✅ Table ${tableName} created successfully!`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating table ${tableName}:`, error);
      throw error;
    }
  }

  async createIndex(tableName, columnName, indexName = null) {
    const idxName = indexName || `idx_${tableName}_${columnName}`;
    const sql = `CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName} (${columnName});`;
    console.log(`🔍 Creating index: ${idxName}`);
    
    try {
      const result = await this.executeSQL(sql);
      console.log(`✅ Index ${idxName} created successfully!`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating index ${idxName}:`, error);
      throw error;
    }
  }

  async enableRLS(tableName) {
    const sql = `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`;
    console.log(`🔒 Enabling RLS for table: ${tableName}`);
    
    try {
      const result = await this.executeSQL(sql);
      console.log(`✅ RLS enabled for ${tableName}!`);
      return result;
    } catch (error) {
      console.error(`❌ Error enabling RLS for ${tableName}:`, error);
      throw error;
    }
  }

  async createRLSPolicy(tableName, policyName, policyDefinition) {
    const sql = `CREATE POLICY ${policyName} ON ${tableName} ${policyDefinition};`;
    console.log(`🛡️ Creating RLS policy: ${policyName}`);
    
    try {
      const result = await this.executeSQL(sql);
      console.log(`✅ Policy ${policyName} created successfully!`);
      return result;
    } catch (error) {
      console.error(`❌ Error creating policy ${policyName}:`, error);
      throw error;
    }
  }

  async runMigrationFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`📄 Running migration: ${path.basename(filePath)}`);
    
    try {
      const result = await this.executeSQL(sql);
      console.log(`✅ Migration completed successfully!`);
      return result;
    } catch (error) {
      console.error(`❌ Error running migration:`, error);
      throw error;
    }
  }
}

// Example usage and predefined table schemas
const predefinedTables = {
  jobApplications: `
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    job_url TEXT,
    application_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'interview', 'rejected', 'offer', 'withdrawn')),
    notes TEXT,
    salary_range TEXT,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `,

  userPreferences: `
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferred_locations TEXT[],
    salary_min INTEGER,
    salary_max INTEGER,
    job_types TEXT[],
    company_sizes TEXT[],
    remote_preference TEXT CHECK (remote_preference IN ('remote', 'hybrid', 'onsite', 'any')),
    skills TEXT[],
    experience_level TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `,

  jobListings: `
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    remote_type TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    description TEXT,
    requirements TEXT[],
    benefits TEXT[],
    application_url TEXT,
    posted_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    source TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `,

  applicationAnalytics: `
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    applications_sent INTEGER DEFAULT 0,
    interviews_scheduled INTEGER DEFAULT 0,
    offers_received INTEGER DEFAULT 0,
    rejections_received INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `
};

async function main() {
  const manager = new SupabaseManager();
  
  console.log('🚀 Starting Supabase Database Setup...\n');
  
  try {
    // Create all predefined tables
    for (const [tableName, schema] of Object.entries(predefinedTables)) {
      await manager.createTable(tableName, schema);
      
      // Enable RLS
      await manager.enableRLS(tableName);
      
      // Create common indexes
      if (tableName === 'jobApplications') {
        await manager.createIndex(tableName, 'user_id');
        await manager.createIndex(tableName, 'status');
        await manager.createIndex(tableName, 'application_date');
      } else if (tableName === 'userPreferences') {
        await manager.createIndex(tableName, 'user_id');
      } else if (tableName === 'jobListings') {
        await manager.createIndex(tableName, 'is_active');
        await manager.createIndex(tableName, 'posted_date');
      } else if (tableName === 'applicationAnalytics') {
        await manager.createIndex(tableName, 'user_id');
        await manager.createIndex(tableName, 'date');
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('🎉 Database setup completed successfully!');
    console.log('\n📊 Created tables:');
    console.log('   • job_applications - Track job applications');
    console.log('   • user_preferences - Store user job preferences');
    console.log('   • job_listings - Store job postings');
    console.log('   • application_analytics - Track application metrics');
    
  } catch (error) {
    console.error('💥 Database setup failed:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { SupabaseManager, predefinedTables };

// Run if called directly
if (require.main === module) {
  main();
}
