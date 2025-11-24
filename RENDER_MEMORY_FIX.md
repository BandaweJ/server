# Fixing Memory Issues on Render

## Problem
Node.js is running out of memory during build/startup with error:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

## Solution

### Option 1: Environment Variable (Recommended for Render)
Set this in your Render dashboard:
1. Go to your Web Service → Environment
2. Add new environment variable:
   - **Key**: `NODE_OPTIONS`
   - **Value**: `--max-old-space-size=1024`
3. Save and redeploy

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

