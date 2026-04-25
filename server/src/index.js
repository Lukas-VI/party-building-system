const { env } = require('./env');
const { ensureSeedData } = require('./seed');
const { createApp } = require('./app');

/**
 * Process entrypoint.
 *
 * Keep this file boring: initialize required data, build the HTTP app, and bind
 * the port. Route groups and business rules live in dedicated modules.
 */
async function bootstrap() {
  await ensureSeedData();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`party-building server listening at http://0.0.0.0:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
