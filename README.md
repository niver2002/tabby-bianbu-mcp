# tabby-bianbu-mcp

A Tabby plugin that adds a dedicated settings tab for storing a Bianbu Cloud MCP endpoint configuration.

What it provides:
- a `Bianbu MCP` settings tab inside Tabby
- fields for MCP URL and `X-API-KEY`
- pacing / retry settings for unstable gateways
- a generated copy-paste JSON snippet for MCP client configs

## Status

The plugin source is complete enough to build and publish.

Important publishing note:
- Tabby plugin discovery normally depends on an npm package with the `tabby-plugin` keyword
- this machine is authenticated to GitHub, but not authenticated to npm
- therefore I can prepare the plugin and publish the source repo now, but direct appearance in Tabby's plugin manager still requires npm publication

## Planned Tabby UI

The plugin adds a settings tab called `Bianbu MCP` with these fields:
- Enable integration
- Profile name
- MCP URL
- X-API-KEY
- Request interval (ms)
- Max retries
- Retry base delay (ms)
- Notes

It also renders a generated JSON block users can copy into other MCP-capable tools.

## Package name

```text
tabby-bianbu-mcp
```

## Build

```bash
npm install
npm run build
```

## Publish

When npm auth is available:

```bash
npm publish --access public
```

## Why it may not show up in Tabby yet

Tabby's in-app plugin manager discovers published plugin packages, typically from npm, via the `tabby-plugin` keyword.
Without npm publication, the plugin can exist on GitHub but will not be discoverable in the plugin search UI.

## Files

- `src/index.ts`
- `src/configProvider.ts`
- `src/settingsTabProvider.ts`
- `src/settingsTab.component.ts`
- `src/settingsTab.component.pug`
- `webpack.config.js`
- `tsconfig.json`
- `package.json`

## License

MIT
