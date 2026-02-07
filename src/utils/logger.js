export const log = {
  info: (msg, meta = {}) =>
    console.log(`ℹ️  ${msg}`, meta),

  warn: (msg, meta = {}) =>
    console.warn(`⚠️  ${msg}`, meta),

  error: (msg, meta = {}) =>
    console.error(`❌ ${msg}`, meta),
};
