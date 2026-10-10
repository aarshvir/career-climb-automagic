# System Requirements & Pre-Flight Checks

## 🖥️ **Required System Software**

### **Node.js & Package Manager**
- **Node.js**: Version 18.x or higher
- **Package Manager**: npm (comes with Node.js)
- **Check Version**: `node --version` and `npm --version`

### **Database Requirements**
- **Supabase Account**: Required for backend services
- **Database**: PostgreSQL (hosted on Supabase)
- **Storage**: Supabase Storage for file uploads

### **Development Tools**
- **Git**: For version control
- **Code Editor**: VS Code recommended (with TypeScript support)
- **Browser**: Modern browser with JavaScript enabled

## 🔧 **Environment Setup**

### **Required Environment Variables**
Create a `.env` file in the project root with these variables:

```bash
# Supabase Configuration (REQUIRED)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Application Configuration (OPTIONAL)
VITE_APP_ENV=development
VITE_APP_VERSION=1.0.0
VITE_APP_NAME=JobVance
VITE_APP_DESCRIPTION=AI-Powered Job Application Platform
```

### **Supabase Setup Required**
1. **Create Supabase Project**: Go to https://supabase.com and create a new project
2. **Get API Keys**: Copy your project URL and anon key from Supabase dashboard
3. **Run Database Migrations**: Execute the SQL files in `supabase/migrations/` folder
4. **Enable Storage**: Set up storage buckets for file uploads

## 🚨 **Pre-Flight Checklist**

Before running the application, verify:

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Supabase account created
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Storage buckets configured

## ⚠️ **Critical Dependencies**

### **External Services (Cannot Run Without)**
- **Supabase**: Backend database and authentication
- **Google OAuth**: For social login (requires Google Cloud Console setup)
- **File Storage**: Supabase Storage for resume uploads

### **Optional but Recommended**
- **VS Code**: For better development experience
- **GitHub Account**: For CI/CD and version control
- **Domain Name**: For production deployment

## 🔍 **Troubleshooting Common Issues**

### **"Cannot read package.json" Error**
- **Cause**: Running commands from wrong directory
- **Fix**: Navigate to project root directory
- **Command**: `cd "C:\Users\aarsh\Downloads\AI platform for job applications\career-climb-automagic\career-climb-automagic"`

### **"Missing environment variables" Error**
- **Cause**: No `.env` file or missing Supabase keys
- **Fix**: Create `.env` file with required variables
- **Template**: Copy from `.env.example`

### **"Database connection failed" Error**
- **Cause**: Invalid Supabase URL or key
- **Fix**: Verify Supabase project settings
- **Check**: Supabase dashboard → Settings → API

### **"Build failed" Error**
- **Cause**: TypeScript errors or missing dependencies
- **Fix**: Run `npm install` and check for errors
- **Command**: `npm run build`

## 📋 **Installation Steps**

1. **Navigate to Project Directory**:
   ```bash
   cd "C:\Users\aarsh\Downloads\AI platform for job applications\career-climb-automagic\career-climb-automagic"
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   ```bash
   copy .env.example .env
   # Then edit .env with your Supabase credentials
   ```

4. **Run Database Migrations**:
   - Go to Supabase dashboard
   - Navigate to SQL Editor
   - Run the SQL files from `supabase/migrations/` folder

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

## ✅ **Verification Commands**

Run these commands to verify everything is working:

```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Install dependencies
npm install

# Run tests
npm run test:run

# Run linter
npm run lint

# Build project
npm run build

# Start development server
npm run dev
```

---

**Generated**: 2025-01-29  
**Status**: System requirements documented, ready for setup
