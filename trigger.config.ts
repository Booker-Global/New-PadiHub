import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  // Trigger.dev project: "New PadiHub Deployment".
  // TODO: replace with the project ref (starts with "proj_") shown on the
  // "New PadiHub Deployment" project's settings page in the Trigger.dev dashboard.
  project: '<your-project-ref>',
  runtime: 'node-24',
  maxDuration: 3600,
  dirs: ['./src/trigger'],
});
