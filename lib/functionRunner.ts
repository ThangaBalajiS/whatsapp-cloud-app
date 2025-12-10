import vm from 'vm';

type RunFunctionOptions = {
  code: string;
  input: unknown;
  context?: Record<string, unknown>;
  timeoutMs?: number;
};

export type RunFunctionResult = {
  output: unknown;
  logs: string[];
  durationMs: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Executes user-provided function code in a constrained VM context.
 * Code must set `module.exports` to a function that accepts
 * `{ input, context }` and returns a value or promise.
 */
export async function runUserFunction({
  code,
  input,
  context = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: RunFunctionOptions): Promise<RunFunctionResult> {
  const logs: string[] = [];

  const sandbox = {
    input,
    context,
    module: { exports: {} },
    exports: {},
    console: {
      log: (...args: unknown[]) => logs.push(args.map(stringify).join(' ')),
      error: (...args: unknown[]) => logs.push(args.map(stringify).join(' ')),
    },
    require: undefined,
    process: undefined,
    Buffer: undefined,
  };

  const script = new vm.Script(code, {
    displayErrors: true,
    filename: 'user-function.js',
  });

  const vmContext = vm.createContext(sandbox, {
    name: 'flow-function-context',
    codeGeneration: { strings: false, wasm: false },
  });

  const start = Date.now();
  script.runInContext(vmContext, { timeout: timeoutMs });

  const exported = (vmContext.module as any)?.exports ?? (vmContext as any).exports;
  if (typeof exported !== 'function') {
    throw new Error('Function code must export a function via module.exports = async ({ input, context }) => { ... }');
  }

  const output = await exported({ input, context });
  const durationMs = Date.now() - start;

  return { output, logs, durationMs };
}

function stringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
