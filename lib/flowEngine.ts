import { HydratedDocument } from 'mongoose';
import Flow, {
  FlowConnection,
  FlowDocument,
  FlowFunctionDefinition,
  FlowTrigger,
  TriggerMatchType,
} from '../models/Flow';
import { runUserFunction, RunFunctionResult } from './functionRunner';

export type FlowState = {
  flow?: HydratedDocument<FlowDocument> | null;
};

export type SaveFlowPayload = {
  name?: string;
  trigger?: FlowTrigger;
  firstTemplate?: string;
  connections?: FlowConnection[];
  functions?: FlowFunctionDefinition[];
};

export type ExecuteFunctionArgs = {
  userId: string;
  flowId?: string;
  functionName: string;
  input: unknown;
  context?: Record<string, unknown>;
};

export type ExecuteFunctionResult = RunFunctionResult & {
  nextTemplate?: string | null;
};

// Get all flows for a user
export async function getUserFlows(userId: string) {
  const flows = await Flow.find({ userId }).sort({ updatedAt: -1 });
  return flows;
}

// Get a specific flow by ID
export async function getFlowById(userId: string, flowId: string) {
  const flow = await Flow.findOne({ _id: flowId, userId });
  return flow;
}

// Create a new flow
export async function createFlow(userId: string, payload: SaveFlowPayload) {
  const {
    name = 'New Flow',
    trigger = { matchType: 'any' as TriggerMatchType, matchText: '' },
    firstTemplate = '',
    connections = [],
    functions = []
  } = payload;

  const flow = await Flow.create({
    userId,
    name,
    trigger,
    firstTemplate,
    connections: sanitizeConnections(connections),
    functions: sanitizeFunctions(functions),
  });

  return flow;
}

// Update an existing flow
export async function updateFlow(userId: string, flowId: string, payload: SaveFlowPayload) {
  const { name, trigger, firstTemplate, connections, functions } = payload;

  const updateData: Record<string, unknown> = {};

  if (name !== undefined) updateData.name = name;
  if (trigger !== undefined) updateData.trigger = trigger;
  if (firstTemplate !== undefined) updateData.firstTemplate = firstTemplate;
  if (connections !== undefined) updateData.connections = sanitizeConnections(connections);
  if (functions !== undefined) updateData.functions = sanitizeFunctions(functions);

  console.log('[flowEngine] updateFlow - updateData:', JSON.stringify(updateData, null, 2));

  const flow = await Flow.findOneAndUpdate(
    { _id: flowId, userId },
    { $set: updateData },
    { new: true }
  );

  console.log('[flowEngine] updateFlow - result:', flow ? {
    trigger: flow.trigger,
    firstTemplate: flow.firstTemplate
  } : 'null');

  return flow;
}

// Delete a flow
export async function deleteFlow(userId: string, flowId: string) {
  const result = await Flow.findOneAndDelete({ _id: flowId, userId });
  return result;
}

// Find a flow that matches the incoming message
export function matchesFlowTrigger(flow: FlowDocument, messageText: string): boolean {
  const { trigger } = flow;

  if (!trigger || trigger.matchType === 'any') {
    return true;
  }

  const text = messageText.toLowerCase();
  const matchText = (trigger.matchText || '').toLowerCase();

  switch (trigger.matchType) {
    case 'includes':
      return text.includes(matchText);
    case 'starts_with':
      return text.startsWith(matchText);
    case 'exact':
      return text === matchText;
    default:
      return true;
  }
}

// Find the first matching flow for an incoming message
export async function findMatchingFlow(userId: string, messageText: string) {
  const flows = await getUserFlows(userId);

  // First, try to find a flow with specific trigger (not 'any')
  for (const flow of flows) {
    const triggerType = flow.trigger?.matchType;
    if (triggerType && triggerType !== 'any' && matchesFlowTrigger(flow, messageText)) {
      return flow;
    }
  }

  // Fall back to 'any' trigger flows or flows without trigger defined
  for (const flow of flows) {
    const triggerType = flow.trigger?.matchType;
    if (!triggerType || triggerType === 'any') {
      return flow;
    }
  }

  return null;
}

// Legacy: get single flow for backwards compatibility
export async function getUserFlow(userId: string) {
  const flow = await Flow.findOne({ userId });
  return flow;
}

// Legacy: save with upsert behavior for backwards compatibility
export async function saveUserFlow(userId: string, payload: SaveFlowPayload) {
  const {
    name = 'Default Flow',
    trigger,
    firstTemplate,
    connections = [],
    functions = []
  } = payload;

  const flow = await Flow.findOneAndUpdate(
    { userId },
    {
      name,
      trigger: trigger || { matchType: 'any', matchText: '' },
      firstTemplate: firstTemplate || '',
      connections: sanitizeConnections(connections),
      functions: sanitizeFunctions(functions),
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return flow;
}

export async function executeFunctionNode({
  userId,
  flowId,
  functionName,
  input,
  context = {},
}: ExecuteFunctionArgs): Promise<ExecuteFunctionResult> {
  const flow = flowId
    ? await Flow.findOne({ _id: flowId, userId })
    : await Flow.findOne({ userId });

  if (!flow) {
    throw new Error('Flow is not configured for this user');
  }

  const fn = flow.functions.find((f: FlowFunctionDefinition) => f.name === functionName);
  if (!fn) {
    throw new Error(`Function "${functionName}" not found`);
  }

  const mergedContext = {
    userId,
    ...context,
  } as Record<string, unknown>;

  if (fn.inputKey) {
    mergedContext[fn.inputKey] = input;
  }

  const result = await runUserFunction({
    code: fn.code,
    input,
    context: mergedContext,
    timeoutMs: clampTimeout(fn.timeoutMs),
  });

  return {
    ...result,
    nextTemplate: fn.nextTemplate || null,
  };
}

export function resolveConnection(
  flow: HydratedDocument<FlowDocument> | FlowDocument | null,
  sourceTemplate: string,
  button: string
): FlowConnection | null {
  if (!flow) return null;
  return (
    flow.connections.find(
      (conn) => conn.sourceTemplate === sourceTemplate && conn.button === button
    ) || null
  );
}

function sanitizeConnections(connections: FlowConnection[]) {
  return (connections || []).map((conn) => ({
    sourceTemplate: conn.sourceTemplate,
    button: conn.button || '',
    targetType: conn.targetType,
    target: conn.target,
    nextTemplate: conn.nextTemplate || '',
  }));
}

function sanitizeFunctions(functions: FlowFunctionDefinition[]) {
  return (functions || []).map((fn) => ({
    name: fn.name,
    description: fn.description || '',
    code: fn.code,
    inputKey: fn.inputKey || 'input',
    timeoutMs: clampTimeout(fn.timeoutMs),
    nextTemplate: fn.nextTemplate || '',
  }));
}

function clampTimeout(value?: number) {
  if (!value || Number.isNaN(value)) return 5000;
  return Math.min(Math.max(value, 100), 20000);
}
