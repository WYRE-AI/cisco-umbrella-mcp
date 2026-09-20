import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ADMIN_TOOLS, handleAdminTool } from './admin.js';
import { DEPLOYMENT_TOOLS, handleDeploymentTool } from './deployments.js';
import { INVESTIGATE_TOOLS, handleInvestigateTool } from './investigate.js';
import { POLICY_TOOLS, handlePolicyTool } from './policies.js';
import { REPORT_TOOLS, handleReportTool } from './reports.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [...DEPLOYMENT_TOOLS, ...ADMIN_TOOLS, ...POLICY_TOOLS, ...REPORT_TOOLS, ...INVESTIGATE_TOOLS];

const DEPLOYMENT_NAMES = new Set(DEPLOYMENT_TOOLS.map((t) => t.name));
const ADMIN_NAMES = new Set(ADMIN_TOOLS.map((t) => t.name));
const POLICY_NAMES = new Set(POLICY_TOOLS.map((t) => t.name));
const REPORT_NAMES = new Set(REPORT_TOOLS.map((t) => t.name));
const INVESTIGATE_NAMES = new Set(INVESTIGATE_TOOLS.map((t) => t.name));

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (DEPLOYMENT_NAMES.has(name)) return handleDeploymentTool(name, args);
  if (ADMIN_NAMES.has(name)) return handleAdminTool(name, args);
  if (POLICY_NAMES.has(name)) return handlePolicyTool(name, args);
  if (REPORT_NAMES.has(name)) return handleReportTool(name, args);
  if (INVESTIGATE_NAMES.has(name)) return handleInvestigateTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
