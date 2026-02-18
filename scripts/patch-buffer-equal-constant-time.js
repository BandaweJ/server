/**
 * Patches buffer-equal-constant-time for Node.js 25+ where SlowBuffer was removed.
 * Runs after every npm install so the app works on current and future Node versions.
 */
const path = require('path');
const fs = require('fs');

const targetPath = path.join(__dirname, '..', 'node_modules', 'buffer-equal-constant-time', 'index.js');

if (!fs.existsSync(targetPath)) {
  process.exit(0);
}

const content = fs.readFileSync(targetPath, 'utf8');

// Already patched (idempotent)
if (content.includes('SlowBuffer : null')) {
  process.exit(0);
}

const patched = content
  .replace(
    "var SlowBuffer = require('buffer').SlowBuffer;",
    "var SlowBuffer = typeof require('buffer').SlowBuffer !== 'undefined' ? require('buffer').SlowBuffer : null;",
  )
  .replace(
    `bufferEq.install = function() {
  Buffer.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
};`,
    `bufferEq.install = function() {
  Buffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
  if (SlowBuffer && SlowBuffer.prototype) {
    SlowBuffer.prototype.equal = Buffer.prototype.equal;
  }
};`,
  )
  .replace(
    'var origSlowBufEqual = SlowBuffer.prototype.equal;',
    'var origSlowBufEqual = SlowBuffer && SlowBuffer.prototype ? SlowBuffer.prototype.equal : undefined;',
  )
  .replace(
    `bufferEq.restore = function() {
  Buffer.prototype.equal = origBufEqual;
  SlowBuffer.prototype.equal = origSlowBufEqual;
};`,
    `bufferEq.restore = function() {
  Buffer.prototype.equal = origBufEqual;
  if (SlowBuffer && SlowBuffer.prototype && typeof origSlowBufEqual !== 'undefined') {
    SlowBuffer.prototype.equal = origSlowBufEqual;
  }
};`,
  );

fs.writeFileSync(targetPath, patched);
