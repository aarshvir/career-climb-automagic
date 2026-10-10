@echo off
echo 🚀 Supabase Database Setup Script
echo =================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found. Creating template...
    
    (
        echo # Supabase Configuration
        echo SUPABASE_URL=https://gvftdfriujrkpptdueyb.supabase.co
        echo SUPABASE_ANON_KEY=your_supabase_anon_key_here
        echo SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
        echo.
        echo # Get these from: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api
    ) > .env
    
    echo 📝 Created .env template file
    echo 🔑 Please add your Supabase API keys to the .env file
    echo    You can find them at: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api
    echo.
    pause
)

REM Create scripts directory if it doesn't exist
if not exist "scripts" mkdir scripts

echo.
echo 🔨 Setting up database tables...
echo.

REM Run the database setup
node scripts/supabase-manager.js

if %errorlevel% equ 0 (
    echo.
    echo 🎉 Database setup completed successfully!
    echo.
    echo 📊 Your database now includes:
    echo    • job_applications - Track job applications
    echo    • user_preferences - Store user job preferences
    echo    • job_listings - Store job postings
    echo    • application_analytics - Track application metrics
    echo.
    echo 🌐 You can now use your application with the new database schema!
) else (
    echo ❌ Database setup failed
    pause
    exit /b 1
)

echo.
echo ✨ Setup complete! Your Supabase database is ready to use.
pause
