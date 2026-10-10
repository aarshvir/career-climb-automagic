# Console Log Replacement Guide

## Overview
Replace all ~150 console statements with secure logger to prevent PII/credential leaks in production.

## Logger Usage Reference

```typescript
import { logger } from '@/lib/logger';

// Debug (only in development)
logger.debug('Message', { context: data });

// Info (general information)
logger.info('Message', context);

// Warn (warnings)
logger.warn('Message', context);

// Error (errors)
logger.error('Message', errorObject, context);
```

## Logger Features
- ✅ Automatic redaction of: password, token, key, secret, authorization, cookie
- ✅ Development-only logging for debug level
- ✅ Structured logging with context
- ✅ No console output in production for debug logs

---

## Priority List of Files to Update

### Priority 1: Critical Business Logic (DO FIRST)
These files directly affect core functionality:

#### 1. `src/components/sections/Pricing.tsx`
- **Console Count**: ~10 statements
- **Impact**: Plan selection logic
- **Task**:
  ```typescript
  // Add import at top
  import { logger } from '@/lib/logger';

  // Replace examples:
  - console.log('🔄 Plan click started:', { ... })
    → logger.debug('Plan click started', { ... })
  - console.log('👤 User details:', user)
    → logger.debug('User details', { user })
  - console.log('🔄 Refreshing plan context...')
    → logger.debug('Refreshing plan context')
  ```

#### 2. `src/contexts/AuthContext.tsx`
- **Console Count**: ~8 statements
- **Impact**: Authentication flow
- **Task**: Same pattern - replace console with logger

#### 3. `src/hooks/useSignInFlow.ts`
- **Console Count**: ~5 statements
- **Impact**: Sign-in logic
- **Task**: Replace console statements

### Priority 2: Data Operations (DO SECOND)
#### 4. `src/lib/resume-storage.ts`
- **Console Count**: ~8 statements
- **Impact**: Resume upload/download

#### 5. `src/utils/uploadUtils.ts`
- **Console Count**: ~5 statements
- **Impact**: File uploads

#### 6. `src/contexts/InterestFormContext.tsx`
- **Console Count**: ~6 statements
- **Impact**: Form data handling

### Priority 3: Utilities & Hooks (DO THIRD)
#### 7. `src/hooks/useAuthRetry.ts` - ~4 statements
#### 8. `src/hooks/useDNSConnectivity.ts` - ~3 statements
#### 9. `src/hooks/usePageExitTracking.ts` - ~2 statements

### Priority 4: Components (DO LAST)
All dashboard, onboarding, and utility components with remaining console statements.

---

## Step-by-Step Replacement Process

### Step 1: Add Logger Import
```typescript
// At the top of the file, after other imports
import { logger } from '@/lib/logger';
```

### Step 2: Identify Console Patterns
Common patterns to replace:

```typescript
// DEBUG - Only during development
console.log('Starting process:', data)
→ logger.debug('Starting process', data)

// INFO - General flow
console.log('✅ Success:', result)
→ logger.info('Success', result)

// WARN - Warning situations
console.warn('Warning:', message)
→ logger.warn('Warning', message)

// ERROR - Errors
console.error('Error:', error)
→ logger.error('Error', error)
```

### Step 3: Context Parameters
Always pass context as second parameter:

```typescript
// BAD
console.log('User logged in:', user.id);

// GOOD
logger.debug('User logged in', { userId: user.id });

// BAD
console.error('Failed:', error);

// GOOD
logger.error('Failed to fetch data', error, { userId: user.id });
```

### Step 4: Sanitization Examples
The logger automatically redacts these fields:
- password, passwd, pwd
- token, authorization, auth
- key, secret, apikey, api_key
- cookie, session, sessionid

```typescript
// These are automatically redacted
logger.debug('Login attempt', {
  email: user.email,
  password: 'user_password'  // Will show as [REDACTED]
});
```

---

## Testing Checklist for Each File

After replacing console statements in a file:

- [ ] Import logger added
- [ ] All console.log() replaced
- [ ] All console.error() replaced
- [ ] All console.warn() replaced
- [ ] All console.debug() replaced
- [ ] All console.info() replaced
- [ ] File builds without errors: `npm run build`
- [ ] Syntax is correct (no missing semicolons)

---

## Files Already Updated

✅ Completed:
- `src/contexts/PlanContext.tsx` (14 statements)
- `src/utils/planManager.ts` (13 statements)
- `src/lib/logger.ts` (existing implementation)

⏳ In Progress:
- `src/pages/Dashboard.tsx` (import added, statements pending)

---

## Batch Update Script (Optional)

For quick find-replace in a single file:

```bash
# Step 1: Find all console statements
grep -n "console\." src/path/to/file.tsx

# Step 2: Manual replacement recommended for accuracy
# Using sed can cause issues with formatting and context
```

---

## Common Gotchas

### ❌ DON'T do this:
```typescript
console.log('Data:', obj) → logger.log('Data:', obj)  // logger has no .log()
logger.debug('Data:', obj, context) → Wrong signature
console.log('text'); → logger.debug('text')  // Missing context can be ok but add it
```

### ✅ DO this:
```typescript
logger.debug('Data:', obj)
logger.debug('Data', obj)  // context as object
logger.error('Failed', error)
logger.error('Failed', error, { additionalContext: data })
```

---

## Verification Steps

After completing all replacements:

### 1. Build Check
```bash
npm run build
# Should complete with no errors
# Bundle size should be similar or smaller
```

### 2. Manual Testing
```bash
npm run dev
# Open browser DevTools console
# Navigate through app
# Verify logger output appears (DEV only)
# Check for any console errors
```

### 3. Search for Remaining Statements
```bash
# Search for any remaining console statements
grep -r "console\." src --include="*.tsx" --include="*.ts"
# Should return 0 results in src/ (only in lib/logger.ts is ok)
```

---

## Expected Timeline

- **Files 1-3 (Priority 1)**: ~15 min
- **Files 4-6 (Priority 2)**: ~15 min
- **Files 7-9 (Priority 3)**: ~10 min
- **Remaining files**: ~20 min
- **Testing & Verification**: ~10 min

**Total Estimated Time**: ~70 minutes

---

## Commit Message Template

```
fix: replace console logs with secure logger

- Updated 30+ files to use centralized logger
- Automatically redacts sensitive data (passwords, tokens, keys)
- Prevents PII leakage in production logs
- Development-only debug logging

Files changed:
- src/contexts/PlanContext.tsx
- src/utils/planManager.ts
- [list more files]

Verification:
- ✅ npm run build passes
- ✅ No console statements in src/
- ✅ Logger sanitization tested
```

---

## Questions & Troubleshooting

### Q: Where is the logger defined?
A: `src/lib/logger.ts` - Already implemented with sanitization

### Q: What if I'm not sure about log level?
A:
- `debug` - Development only, detailed info
- `info` - Important flow events
- `warn` - Something unexpected but not broken
- `error` - Something failed

### Q: Should I remove emoji from log messages?
A: Yes, emojis look nice in console but are confusing in structured logs. Replace with clear text.

### Q: What about performance?
A: Logger adds negligible overhead, messages are only processed in dev or for warn/error levels.

---

**Last Updated**: 2025-11-13
**Target Completion**: Today after priority 1 files
