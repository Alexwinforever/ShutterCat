import { createRuntime } from './runtime.mjs';
const port = Number(process.env.E2E_PORT ?? 8787);
const { runtime } = await createRuntime({ port, testControls: true });
console.log('Isolated test server ready at', String(await runtime.ready));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await runtime.dispose(); process.exit(0); });
