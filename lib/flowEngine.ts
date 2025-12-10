import { HydratedDocument } from 'mongoose';
import Flow, {
  FlowConnection,
  FlowDocument,
  FlowFunctionDefinition,
} from '../models/Flow';
import { runUserFunction, RunFunctionResult } from './functionRunner';

export type FlowState = {
  flow?: HydratedDocument<FlowDocument> | null;
};

export type SaveFlowPayload = {
  name?: string;
  connections: FlowConnection[];
  functions: FlowFunctionDefinition[];
};

export type ExecuteFunctionArgs = {
  userId: string;
  functionName: string;
  input: unknown;
  context?: Record<string, unknown>;
};

export type ExecuteFunctionResult = RunFunctionResult & {
  nextTemplate?: string | null;
};

export async function getUserFlow(userId: string) {
  const flow = await Flow.findOne({ userId });
  return flow;
}

export async function saveUserFlow(userId: string, payload: SaveFlowPayload) {
  const { name = 'Default Flow', connections, functions } = payload;

  const sanitizedConnections = (connections || []).map((conn) => ({
    sourceTemplate: conn.sourceTemplate,
    button: conn.button,
    targetType: conn.targetType,
    target: conn.target,
  }));

  const sanitizedFunctions = (functions || []).map((fn) => ({
    name: fn.name,
    description: fn.description || '',
    code: fn.code,
    inputKey: fn.inputKey || 'input',
    timeoutMs: clampTimeout(fn.timeoutMs),
    nextTemplate: fn.nextTemplate || '',
  }));

  const flow = await Flow.findOneAndUpdate(
    { userId },
    {
      name,
      connections: sanitizedConnections,
      functions: sanitizedFunctions,
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
  functionName,
  input,
  context = {},
}: ExecuteFunctionArgs): Promise<ExecuteFunctionResult> {
  const flow = await Flow.findOne({ userId });
  if (!flow) {
    throw new Error('Flow is not configured for this user');
  }

  const fn = flow.functions.find((f) => f.name === functionName);
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

function clampTimeout(value?: number) {
  if (!value || Number.isNaN(value)) return 5000;
  return Math.min(Math.max(value, 100), 20000);
}
