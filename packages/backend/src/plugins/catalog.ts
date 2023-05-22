// eslint-disable-next-line notice/notice
import {
  CatalogBuilder,
  EntityProvider,
} from '@backstage/plugin-catalog-backend';
import { ScaffolderEntitiesProcessor } from '@backstage/plugin-scaffolder-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import {
  AWSLambdaFunctionProvider,
  AWSS3BucketProvider,
  AWSIAMUserProvider,
  AWSDynamoDbTableProvider,
  AWSDynamoDbTableDataProvider,
  AWSIAMRoleProvider,
  AWSIAMRoleProcessor,
  AWSEKSClusterProvider,
} from '@roadiehq/catalog-backend-module-aws';
import { OktaOrgEntityProvider } from '@roadiehq/catalog-backend-module-okta';
import { Duration } from 'luxon';


import { ScmIntegrations, DefaultGithubCredentialsProvider } from '@backstage/integration';
import { GitHubOrgEntityProvider } from '@backstage/plugin-catalog-backend-module-github';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  type RunnableProvider = EntityProvider & {
    run: () => Promise<void>;
  };
  const builder = await CatalogBuilder.create(env);
  const providers: RunnableProvider[] = [];
  builder.addProcessor(AWSIAMRoleProcessor.fromConfig(env.config, env));

  const orgProvider = OktaOrgEntityProvider.fromConfig(env.config, {
    ...env,
    groupNamingStrategy: 'kebab-case-name',
    userNamingStrategy: 'strip-domain-email',
  });
  builder.addEntityProvider(orgProvider);
  providers.push(orgProvider);

  for (const config of env.config.getOptionalConfigArray('integrations.aws') ||
    []) {
    const s3Provider = AWSS3BucketProvider.fromConfig(config, env);
    const lambdaProvider = AWSLambdaFunctionProvider.fromConfig(config, env);
    const iamUserProvider = AWSIAMUserProvider.fromConfig(config, env);
    const iamRoleProvider = AWSIAMRoleProvider.fromConfig(config, env);
    const ddbTableProvider = AWSDynamoDbTableProvider.fromConfig(config, env);
    const eksClusterProvider = AWSEKSClusterProvider.fromConfig(config, env);

    builder.addEntityProvider(s3Provider);
    builder.addEntityProvider(lambdaProvider);
    builder.addEntityProvider(iamUserProvider);
    builder.addEntityProvider(iamRoleProvider);
    builder.addEntityProvider(ddbTableProvider);
    builder.addEntityProvider(eksClusterProvider);
    providers.push(s3Provider);
    providers.push(lambdaProvider);
    providers.push(iamUserProvider);
    providers.push(iamRoleProvider);
    providers.push(ddbTableProvider);
    providers.push(eksClusterProvider);

    const useDdbData = config.has('dynamodbTableData');
    if (useDdbData) {
      const ddbTableDataProvider = AWSDynamoDbTableDataProvider.fromConfig(
        config,
        env,
      );
      builder.addEntityProvider(ddbTableDataProvider);
      providers.push(ddbTableDataProvider);
    }
  }

  builder.addProcessor(new ScaffolderEntitiesProcessor());

  const integrations = ScmIntegrations.fromConfig(env.config);

  const githubCredentialsProvider = DefaultGithubCredentialsProvider.fromIntegrations(integrations);

  const gitProvider = GitHubOrgEntityProvider.fromConfig(env.config, {
    id: "github-org-entity-provider",
    orgUrl: "https://github.com/Maharsh17", // 🚨 REPLACE
    logger: env.logger,
    githubCredentialsProvider
  });

  builder.addEntityProvider(gitProvider as EntityProvider);

  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  router.post("/github/webhook", async (req, _res) => {
    const event = req.headers["x-github-event"];
    if (event == "membership" || event == "organization") {
      await gitProvider.read();
    }
  })

  for (const [i, provider] of providers.entries()) {
    env.logger.info(`configuring ${provider.getProviderName()} schedule`);
    await env.scheduler.scheduleTask({
      id: `run_${provider.getProviderName()}_${i}`,
      fn: async () => {
        await provider.run();
      },
      frequency: Duration.fromObject({ minutes: 5 }),
      timeout: Duration.fromObject({ minutes: 10 }),
    });
  }
  return router;
}
