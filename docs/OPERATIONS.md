# 📚 Operations Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 9+
- Supabase account
- Git

### Local Development

1. **Clone and Install**
```bash
git clone https://github.com/aarshvir/career-climb-automagic.git
cd career-climb-automagic
npm install
```

2. **Environment Setup**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_PUBLISHABLE_KEY
# - SUPABASE_SERVICE_ROLE_KEY (server only)
```

3. **Database Setup**
```bash
# Run migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

4. **Start Development Server**
```bash
npm run dev
# Opens at http://localhost:8080
```

## 🔧 Common Scripts

```bash
# Development
npm run dev           # Start dev server
npm run build        # Production build
npm run preview      # Preview production build

# Testing
npm run test         # Run unit tests
npm run test:e2e     # Run E2E tests
npm run test:watch   # Watch mode

# Code Quality
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix issues
npm run type-check   # TypeScript check
npm run format       # Prettier format

# Database
npm run db:migrate   # Run migrations
npm run db:seed      # Seed data
npm run db:reset     # Reset database
```

## 🔐 Environment Variables

### Required
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Public anon key

### Optional
- `VITE_DEBUG` - Enable debug logging (true/false)
- `VITE_API_TIMEOUT` - API timeout in ms (default: 30000)
- `VITE_ENABLE_ANALYTICS` - Enable analytics (default: true)

### Server-only (DO NOT prefix with VITE_)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `MAKE_WEBHOOK_URL` - Make.com webhook URL

## 🚨 Troubleshooting

### Auth Issues
1. **"Invalid API key"**
   - Check `.env` file has correct keys
   - Ensure keys match Supabase project

2. **"Session expired"**
   - Clear localStorage: `localStorage.clear()`
   - Sign in again

3. **"Popup blocked"**
   - Allow popups for localhost:8080
   - Try different browser

### Database Issues
1. **"Table not found"**
   - Run migrations: `npm run db:migrate`
   - Check Supabase dashboard

2. **"Permission denied"**
   - Check RLS policies in Supabase
   - Verify user authentication

### Build Issues
1. **"Module not found"**
   - Delete node_modules: `rm -rf node_modules`
   - Reinstall: `npm install`

2. **"Build failed"**
   - Check for TypeScript errors: `npm run type-check`
   - Fix linting: `npm run lint:fix`

## 📊 Monitoring

### Health Checks
- Frontend: `http://localhost:8080/health`
- API: Check Supabase dashboard

### Logs
- Browser console for frontend errors
- Supabase logs for backend
- Check `logger.ts` output in dev mode

### Performance
- Bundle size: `npm run build -- --analyze`
- Lighthouse: Chrome DevTools > Lighthouse
- Network: Chrome DevTools > Network tab

## 🔄 Deployment

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] No console.log statements
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Security headers configured
- [ ] Error tracking enabled

### Deployment Steps
1. Build production bundle: `npm run build`
2. Test locally: `npm run preview`
3. Deploy to hosting (Vercel/Netlify)
4. Run migrations on production DB
5. Verify all features working

## 🔒 Security

### API Keys
- Rotate keys quarterly
- Never commit `.env` file
- Use different keys for dev/staging/prod

### Authentication
- Session timeout: 7 days
- Refresh token: Auto-refresh enabled
- OAuth: Google provider configured

### Rate Limiting
- Auth attempts: 5 per minute
- API calls: 100 per minute
- Configurable in `security.ts`

## 📞 Support

### Common Issues & Solutions
See troubleshooting section above

### Contact
- GitHub Issues: [Report bugs](https://github.com/aarshvir/career-climb-automagic/issues)
- Email: support@jobvance.io

### Logs & Debugging
Enable debug mode in `.env`:
```
VITE_DEBUG=true
```

Check browser console for detailed logs.
