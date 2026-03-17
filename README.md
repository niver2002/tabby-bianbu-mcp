# tabby-bianbu-mcp

A Tabby plugin that adds polished Bianbu Cloud remote tabs backed by your MCP endpoint.

What it provides:
- a dedicated `Bianbu MCP` settings page inside Tabby
- `Bianbu Cloud Shell` and `Bianbu Cloud Files` entries integrated into Tabby's tab/profile flow
- a terminal-based shell experience backed by MCP `run_command`
- an explorer-like file manager backed by MCP file tools
- connection fields for MCP URL, `X-API-KEY`, pacing, retries, and notes
- quick actions and copyable config snippets

Important:
- this plugin does **not** implement native SSH or native SFTP transport
- instead, it uses your Bianbu Cloud MCP endpoint at `https://<domain>/mcp`
- `Bianbu Cloud Shell` is backed by MCP `run_command`
- `Bianbu Cloud Files` is backed by MCP file tools such as `list_directory`, `read_text_file`, `write_text_file`, `upload_binary_file`, and `download_binary_file`

## UI overview

Inside Tabby, the plugin adds:

### 1. Bianbu MCP settings page
Fields:
- enable integration
- profile name
- MCP URL
- X-API-KEY
- request interval (ms)
- max retries
- retry base delay (ms)
- notes

### 2. Bianbu Cloud Shell tab
Features:
- command input
- working directory input
- timeout input
- `as_root` toggle
- output history with stdout/stderr blocks

### 3. Bianbu Cloud Files tab
Features:
- directory browser
- open text files
- edit and save text files
- create directories and files
- upload files
- download files
- delete files/directories
- `as_root` toggle

## Package

- npm: `tabby-bianbu-mcp`
- keyword: `tabby-plugin`

## Build

```bash
npm install
npm run build
```

## Publish

```bash
npm publish --access public
```

## Installability in Tabby

This package is intended to be discoverable by Tabby's plugin manager through npm publication.
Because Tabby's plugin discovery behavior can lag behind npm indexing, it may take a bit of time before search results update.

## Source repository

https://github.com/niver2002/tabby-bianbu-mcp

## License

MIT
