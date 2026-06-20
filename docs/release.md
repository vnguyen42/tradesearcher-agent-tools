# Release Checklist

Run this before publishing:

```bash
npm run release:check
```

Publish order:

```bash
npm publish -w packages/core
npm publish -w packages/cli
npm publish -w packages/mcp-server
```

Checks covered:

- syntax check for each package
- unit tests
- package build scripts
- dry-run npm package contents

Do not publish until the backend `/api/agent/*` endpoints are deployed and the final README/install flow has been reviewed.

