# 🚀 Automated Supabase Database Setup

This guide shows you how to create and manage your Supabase database tables **without ever opening the Supabase dashboard**. Everything is automated!

## 🎯 What This Does

✅ **Creates complete database schema** - Tables, indexes, relationships  
✅ **Sets up Row Level Security (RLS)** - Secure data access  
✅ **Configures proper indexes** - Optimized database performance  
✅ **No manual Supabase dashboard access required** - Fully automated  

## 📋 Prerequisites

- Node.js installed on your system
- Your Supabase project API keys

## 🔑 Step 1: Get Your Supabase API Keys

1. Go to: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api
2. Copy your **anon/public** key and **service_role** key

## ⚙️ Step 2: Setup (Choose One Method)

### Method A: PowerShell Script (Recommended)
```powershell
.\setup-database.ps1
```

### Method B: Batch File (Windows CMD)
```cmd
setup-database.bat
```

### Method C: NPM Script
```bash
npm run setup-db:ps1
# or
npm run setup-db:bat
```

### Method D: Direct Node.js
```bash
npm run setup-db
```

## 📊 Database Schema Created

The automated setup creates these tables:

### 🎯 `job_applications`
Tracks all job applications with status updates
- **Fields**: id, user_id, job_title, company_name, status, notes, salary_range, location
- **Features**: Automatic timestamps, status tracking, user association

### 👤 `user_preferences` 
Stores user job search preferences
- **Fields**: preferred_locations, salary_range, job_types, remote_preference, skills
- **Features**: Array fields for multiple values, validation constraints

### 📋 `job_listings`
Stores job postings from various sources
- **Fields**: title, company, location, salary, description, requirements, benefits
- **Features**: Expiration dates, source tracking, active status

### 📈 `application_analytics`
Daily application metrics and progress tracking
- **Fields**: applications_sent, interviews_scheduled, offers_received, rejections
- **Features**: Daily aggregation, user-specific metrics

## 🔒 Security Features

- **Row Level Security (RLS)** enabled on all tables
- **User isolation** - Users can only access their own data
- **Proper indexing** for optimal performance
- **Data validation** with constraints

## 🛠️ Customization

### Adding New Tables

Edit `scripts/supabase-manager.js` and add to the `predefinedTables` object:

```javascript
const predefinedTables = {
  // ... existing tables ...
  
  yourNewTable: `
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    field1 TEXT NOT NULL,
    field2 INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  `
};
```

### Running Custom SQL

Create a new migration file in `supabase/migrations/` and run:

```bash
node scripts/supabase-manager.js your-migration-file.sql
```

## 🚨 Troubleshooting

### "SUPABASE_ANON_KEY not set"
- Make sure your `.env` file contains your API keys
- Get keys from: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api

### "Table already exists"
- This is normal! The script uses `CREATE TABLE IF NOT EXISTS`
- Existing tables won't be modified

### "Permission denied"
- Ensure you're using the correct API key
- Service role key may be needed for some operations

## 🎉 Success!

Once complete, you'll see:
```
🎉 Database setup completed successfully!

📊 Your database now includes:
   • job_applications - Track job applications
   • user_preferences - Store user job preferences  
   • job_listings - Store job postings
   • application_analytics - Track application metrics

🌐 You can now use your application with the new database schema!
```

## 🔄 Re-running Setup

The setup is **idempotent** - you can run it multiple times safely:
- Existing tables won't be duplicated
- New tables will be created
- Indexes and RLS will be updated if needed

## 📞 Need Help?

- Check the console output for detailed error messages
- Verify your API keys are correct
- Ensure your Supabase project is active
- Check your internet connection

---

**🎯 Result**: Complete database setup without ever touching the Supabase dashboard!
