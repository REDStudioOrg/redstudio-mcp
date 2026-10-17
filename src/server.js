#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RedStudioClient } from './client.js';
import { buildTools } from './tools.js';

const apiKey = process.env.REDSTUDIO_API_KEY;
const baseUrl = process.env.REDSTUDIO_API_URL || undefined;

if (!apiKey) {
  console.error('REDSTUDIO_API_KEY is not set. Create a key with "Site builder access" in the RedStudio dashboard (Dashboard > API Keys).');
  process.exit(1);
}

const client = new RedStudioClient({ apiKey, baseUrl });
const server = new McpServer({ name: 'redstudio-cms', version: '0.1.0' });

for (const tool of buildTools(client)) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler);
}

const transport = new StdioServerTransport();
await server.connect(transport);
