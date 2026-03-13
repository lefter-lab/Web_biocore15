module.exports = {
  // Use Node environment for pure computation unit tests (no DOM required)
  testEnvironment: 'node',
  // Rely on package.json `type: module` for ESM handling; no extensions override
  transform: {}
}
