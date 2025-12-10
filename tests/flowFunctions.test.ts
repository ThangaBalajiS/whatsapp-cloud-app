import assert from 'assert';
import Flow from '../models/Flow';
import { executeFunctionNode } from '../lib/flowEngine';
import { runUserFunction } from '../lib/functionRunner';

async function testFunctionRunnerReturnsOutput() {
  const result = await runUserFunction({
    code: 'module.exports = ({ input }) => ({ doubled: input * 2 });',
    input: 3,
  });

  const output = result.output as Record<string, unknown>;
  assert.strictEqual((output as any).doubled, 6);
  assert.ok(result.durationMs >= 0);
}

async function testFunctionRunnerTimeout() {
  let threw = false;
  try {
    await runUserFunction({
      code: 'module.exports = async () => { while (true) {} };',
      input: null,
      timeoutMs: 100,
    });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof Error);
  }

  assert.ok(threw, 'Expected timeout error for long-running function');
}

async function testExecuteFunctionNodeUsesFlow() {
  const mockFlow = {
    functions: [
      {
        name: 'formatName',
        description: '',
        code: "module.exports = ({ input, context }) => ({ upper: String(input).toUpperCase(), user: context.userId });",
        inputKey: 'input',
        timeoutMs: 500,
        nextTemplate: 'next-template',
      },
    ],
  };

  const originalFindOne = (Flow as any).findOne;
  (Flow as any).findOne = async () => mockFlow;

  try {
    const result = await executeFunctionNode({
      userId: 'user-123',
      functionName: 'formatName',
      input: 'hello',
      context: { preview: true },
    });

    const output = result.output as Record<string, any>;
    assert.strictEqual(output.upper, 'HELLO');
    assert.strictEqual(output.user, 'user-123');
    assert.strictEqual(result.nextTemplate, 'next-template');
  } finally {
    (Flow as any).findOne = originalFindOne;
  }
}

async function run() {
  await testFunctionRunnerReturnsOutput();
  await testFunctionRunnerTimeout();
  await testExecuteFunctionNodeUsesFlow();
  console.log('Flow function tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
