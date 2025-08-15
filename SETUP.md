# yurucode setup instructions

## fixing the "invalid api key" error

the claude code sdk in yurucode needs an api key to work. here's how to fix it:

### option 1: use your anthropic api key (recommended)

1. get your api key from https://console.anthropic.com/account/keys
2. edit the `.env` file in the yurucode folder
3. uncomment and add your key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
   ```
4. restart the app (`npm run start`)

### option 2: use environment variable

set the api key before starting the app:

```bash
# windows cmd
set ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
npm run start

# windows powershell  
$env:ANTHROPIC_API_KEY="sk-ant-api03-xxxxx..."
npm run start

# linux/mac/wsl
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
npm run start
```

### testing the setup

after adding your api key, test it works:

```bash
node test-claude-sdk.js
```

you should see "✅ test completed successfully!"

### troubleshooting

- make sure your api key starts with `sk-ant-`
- check the server console for error messages
- the app runs on ports 3001 (server) and 5173 (ui)
- if ports are in use, run `npm run prestart` to kill them

### notes

- the claude code sdk package (`@anthropic-ai/claude-code`) requires an api key
- this is separate from your claude.ai subscription
- api usage will be billed to your anthropic account
- check usage at https://console.anthropic.com/settings/usage