# Supabase Database Setup Script
# This script sets up your database tables without requiring Supabase dashboard access

Write-Host "🚀 Supabase Database Setup Script" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating template..." -ForegroundColor Yellow
    
    $envContent = @"
# Supabase Configuration
SUPABASE_URL=https://gvftdfriujrkpptdueyb.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Get these from: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api
"@
    
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "📝 Created .env template file" -ForegroundColor Green
    Write-Host "🔑 Please add your Supabase API keys to the .env file" -ForegroundColor Yellow
    Write-Host "   You can find them at: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press any key to continue after adding your API keys..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Load environment variables
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "✅ Environment variables loaded" -ForegroundColor Green
}

# Check if API key is set
if (-not $env:SUPABASE_ANON_KEY -or $env:SUPABASE_ANON_KEY -eq "your_supabase_anon_key_here") {
    Write-Host "❌ SUPABASE_ANON_KEY not set in .env file" -ForegroundColor Red
    Write-Host "   Please add your Supabase API key to the .env file" -ForegroundColor Yellow
    Write-Host "   Get it from: https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/settings/api" -ForegroundColor Cyan
    exit 1
}

# Create scripts directory if it doesn't exist
if (-not (Test-Path "scripts")) {
    New-Item -ItemType Directory -Path "scripts" | Out-Null
    Write-Host "📁 Created scripts directory" -ForegroundColor Green
}

# Run the database setup
Write-Host ""
Write-Host "🔨 Setting up database tables..." -ForegroundColor Cyan
Write-Host ""

try {
    # Run the Node.js script to perform the setup
    node "scripts/supabase-manager.js" "migrate"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "🔴 Database setup failed during script execution." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Database setup complete! Your Supabase database is ready to use." -ForegroundColor Green
}
catch {
    Write-Host "🔴 An error occurred during database setup:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
