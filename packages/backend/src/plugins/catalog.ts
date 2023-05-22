import { ScaffolderEntitiesProcessor } from '@backstage/plugin-scaffolder-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';

import { CatalogBuilder, EntityProvider } from '@backstage/plugin-catalog-backend';
import { ScmIntegrations, DefaultGithubCredentialsProvider } from '@backstage/integration';
import { GitHubOrgEntityProvider } from '@backstage/plugin-catalog-backend-module-github';



export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  builder.addProcessor(new ScaffolderEntitiesProcessor());

  const integrations = ScmIntegrations.fromConfig(env.config);
 
  const githubCredentialsProvider = DefaultGithubCredentialsProvider.fromIntegrations(integrations);
 
  const gitProvider = GitHubOrgEntityProvider.fromConfig(env.config, {
    id: "github-org-entity-provider",
    orgUrl: "https://github.com/Maharsh17",
    logger: env.logger,
    githubCredentialsProvider
  });

  builder.addEntityProvider(gitProvider as EntityProvider);

  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  //await gitProvider.read();

  router.post("/github/webhook", async (req, _res) => {
    const event = req.headers["x-github-event"];
     if (event == "membership" || event == "organization") {
       await gitProvider.read();
     }
   })
  return router;
}
