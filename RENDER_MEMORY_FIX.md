# Fixing Memory Issues on Render

## Problem
Node.js is running out of memory during build/startup with error:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

The error shows it's still using the default ~258MB limit, meaning NODE_OPTIONS isn't being applied during the build phase.

## Solution: Set Environment Variable in Render Dashboard (REQUIRED)

**This is the ONLY reliable way to fix this on Render:**

1. Go to your Render dashboard: https://dashboard.render.com
2. Click on your **Web Service** (the backend service)
3. Go to the **"Environment"** tab (in the left sidebar)
4. Click **"Add Environment Variable"**
5. Add:
   - **Key**: `NODE_OPTIONS`
   - **Value**: `--max-old-space-size=1024`
6. Click **"Save Changes"**
7. Render will automatically trigger a new deployment

**Why this is necessary:**
- Render runs `npm install` and `npm run build` BEFORE the Procfile
- Environment variables set in the dashboard apply to ALL processes (build + runtime)
- The Procfile only affects the final `start:prod` command

### Option 2: Procfile (Already Updated)
The Procfile now includes:
```
web: NODE_OPTIONS=--max-old-space-size=1024 npm run start:prod
```

### Option 3: package.json Scripts (Already Updated)
The build and start scripts now include memory flags.

## What This Does
- Increases Node.js heap size from default ~256MB to 1024MB (1GB)
- Allows the build process and runtime to use more memory
- Should prevent "heap out of memory" errors

## If Still Having Issues
1. **Check Render instance size**: Free tier has 512MB RAM total. Consider upgrading.
2. **Optimize build**: Remove unused dependencies, enable tree-shaking
3. **Check for memory leaks**: Monitor memory usage in logs
4. **Reduce bundle size**: Split code, lazy load modules

## Verify It's Working
After deployment, check logs for:
- No "heap out of memory" errors
- Successful build completion
- App starts without crashes

