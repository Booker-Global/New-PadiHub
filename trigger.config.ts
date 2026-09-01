import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  // Trigger.dev project: "New PadiHub Deployment".
  project: 'proj_aonbiqmjcptiawtoabde',
  runtime: 'node-24',
  maxDuration: 3600,
  dirs: ['./src/trigger'],
});
