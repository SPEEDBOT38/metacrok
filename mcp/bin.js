#!/usr/bin/env node
// Stdio entry: `node mcp/bin.js` (or the `metacrok-mcp` command). stdout carries the protocol, so log to stderr only.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const url = process.env.METACROK_URL || 'http://localhost:3000';
const server = createServer();
await server.connect(new StdioServerTransport());
console.error(`metacrok MCP server ready (talking to ${url})`);
