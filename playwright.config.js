module.exports = {
  testDir: './tests',
  webServer: {
    command: 'npx http-server -p 4173 -c-1 -s',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
};
