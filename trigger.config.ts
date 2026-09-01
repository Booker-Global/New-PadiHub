import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  // TODO: replace with your Trigger.dev project ref from the dashboard.
  project: '<your-project-ref>',
  runtime: 'node-24',
  maxDuration: 3600,
  dirs: ['./src/trigger'],
});
