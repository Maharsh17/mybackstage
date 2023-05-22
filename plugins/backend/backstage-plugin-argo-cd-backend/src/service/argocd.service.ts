import { Config } from '@backstage/config';
import fetch from 'cross-fetch';
import { Logger } from 'winston';
import { timer } from './timer.services';

import {
  ArgoServiceApi,
  CreateArgoApplicationProps,
  CreateArgoProjectProps,
  CreateArgoResourcesProps,
  DeleteApplicationProps,
  DeleteProjectProps,
  InstanceConfig,
  ResyncProps,
  SyncArgoApplicationProps,
  SyncResponse,
  findArgoAppResp,
  DeleteApplicationAndProjectProps,
  DeleteApplicationAndProjectResponse,
  ResponseSchema,
  getRevisionDataResp,
} from './types';

export class ArgoService implements ArgoServiceApi {
  instanceConfigs: InstanceConfig[];

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.instanceConfigs = this.config
      .getConfigArray('argocd.appLocatorMethods')
      .filter(element => element.getString('type') === 'config')
      .reduce(
        (acc: Config[], argoApp: Config) =>
          acc.concat(argoApp.getConfigArray('instances')),
        [],
      )
      .map(instance => ({
        name: instance.getString('name'),
        url: instance.getString('url'),
        token: instance.getOptionalString('token'),
        username: instance.getOptionalString('username'),
        password: instance.getOptionalString('password'),
      }));
  }

  getArgoInstanceArray(): InstanceConfig[] {
    return this.getAppArray().map(instance => ({
      name: instance.getString('name'),
      url: instance.getString('url'),
      token: instance.getOptionalString('token'),
      username: instance.getOptionalString('username'),
      password: instance.getOptionalString('password'),
    }));
  }

  getAppArray(): Config[] {
    const argoApps = this.config
      .getConfigArray('argocd.appLocatorMethods')
      .filter(element => element.getString('type') === 'config');

    return argoApps.reduce(
      (acc: Config[], argoApp: Config) =>
        acc.concat(argoApp.getConfigArray('instances')),
      [],
    );
  }

  async getRevisionData(
    baseUrl: string,
    options: {
      name?: string;
      selector?: string;
    },
    argoToken: string,
    revisionID: string,
  ): Promise<getRevisionDataResp> {
    const urlSuffix = options.name
      ? `/${options.name}`
      : `?selector=${options.selector}`;
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${argoToken}`,
      },
    };

    const resp = await fetch(
      `${baseUrl}/api/v1/applications${urlSuffix}/revisions/${revisionID}/metadata`,
      requestOptions,
    );

    if (!resp.ok) {
      throw new Error(`Request failed with ${resp.status} Error`);
    }

    const data: getRevisionDataResp = await resp?.json();
    return data;
  }

  async findArgoApp(options: {
    name?: string;
    selector?: string;
  }): Promise<findArgoAppResp[]> {
    if (!options.name && !options.selector) {
      throw new Error('name or selector is required');
    }
    const resp = await Promise.all(
      this.instanceConfigs.map(async (argoInstance: any) => {
        const token =
          argoInstance.token || (await this.getArgoToken(argoInstance));
        let getArgoAppDataResp: any;
        try {
          getArgoAppDataResp = await this.getArgoAppData(
            argoInstance.url,
            argoInstance.name,
            options,
            token,
          );
        } catch (error: any) {
          return null;
        }

        if (options.selector && !getArgoAppDataResp.items) {
          return null;
        }

        return {
          name: argoInstance.name as string,
          url: argoInstance.url as string,
          appName: options.selector
            ? getArgoAppDataResp.items.map((x: any) => x.metadata.name)
            : [options.name],
        };
      }),
    ).catch();
    return resp.flatMap(f => (f ? [f] : []));
  }

  async getArgoToken(appConfig: {
    url: string;
    username?: string;
    password?: string;
  }): Promise<string> {
    const { url, username, password } = appConfig;

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username || this.username,
        password: password || this.password,
      }),
    };
    const resp = await fetch(`${url}/api/v1/session`, options);
    if (!resp.ok) {
      this.logger.error(`failed to get argo token: ${url}`);
    }
    if (resp.status === 401) {
      throw new Error(`Getting unauthorized for Argo CD instance ${url}`);
    }
    const data = await resp.json();
    return data.token;
  }

  async getArgoAppData(
    baseUrl: string,
    argoInstanceName: string,
    options: {
      name?: string;
      selector?: string;
    },
    argoToken: string,
  ): Promise<any> {
    const urlSuffix = options.name
      ? `/${options.name}`
      : `?selector=${options.selector}`;
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${argoToken}`,
      },
    };

    const resp = await fetch(
      `${baseUrl}/api/v1/applications${urlSuffix}`,
      requestOptions,
    );

    if (!resp.ok) {
      throw new Error(`Request failed with ${resp.status} Error`);
    }

    const data = await resp?.json();
    if (data.items) {
      (data.items as any[]).forEach(item => {
        item.metadata.instance = { name: argoInstanceName };
      });
    } else if (data && options.name) {
      data.instance = argoInstanceName;
    }
    return data;
  }

  async createArgoProject({
    baseUrl,
    argoToken,
    projectName,
    namespace,
    sourceRepo,
    destinationServer,
  }: CreateArgoProjectProps): Promise<object> {
    const data = {
      project: {
        metadata: {
          name: projectName,
        },
        spec: {
          destinations: [
            {
              name: 'local',
              namespace: namespace,
              server: destinationServer
                ? destinationServer
                : 'https://kubernetes.default.svc',
            },
          ],
          sourceRepos: [sourceRepo],
        },
      },
    };

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${argoToken}`,
      },
      body: JSON.stringify(data),
    };
    const resp = await fetch(`${baseUrl}/api/v1/projects`, options);
    const responseData = await resp.json();
    if (resp.status === 403) {
      throw new Error(responseData.message);
    } else if (resp.status === 404) {
      return resp.json();
    } else if (
      JSON.stringify(responseData).includes(
        'existing project spec is different',
      )
    ) {
      throw new Error('Duplicate project detected. Cannot overwrite existing.');
    }
    return responseData;
  }

  async createArgoApplication({
    baseUrl,
    argoToken,
    appName,
    projectName,
    namespace,
    sourceRepo,
    sourcePath,
    labelValue,
    destinationServer,
  }: CreateArgoApplicationProps): Promise<object> {
    const data = {
      metadata: {
        name: appName,
        labels: { 'backstage-name': labelValue },
        finalizers: ['resources-finalizer.argocd.argoproj.io'],
      },
      spec: {
        destination: {
          namespace: namespace,
          server: destinationServer
            ? destinationServer
            : 'https://kubernetes.default.svc',
        },
        project: projectName,
        revisionHistoryLimit: 10,
        source: {
          path: sourcePath,
          repoURL: sourceRepo,
        },
        syncPolicy: {
          automated: {
            allowEmpty: true,
            prune: true,
            selfHeal: true,
          },
          retry: {
            backoff: {
              duration: '5s',
              factor: 2,
              maxDuration: '5m',
            },
            limit: 10,
          },
          syncOptions: ['CreateNamespace=false'],
        },
      },
    };

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${argoToken}`,
      },
      body: JSON.stringify(data),
    };

    const resp = await fetch(`${baseUrl}/api/v1/applications`, options);
    if (!resp.ok) {
      throw new Error('Could not create ArgoCD application.');
    }
    return resp.json();
  }

  async resyncAppOnAllArgos({
    appSelector,
  }: ResyncProps): Promise<SyncResponse[][]> {
    const argoAppResp: findArgoAppResp[] = await this.findArgoApp({
      selector: appSelector,
    });

    const parallelSyncCalls = argoAppResp.map(
      async (argoInstance: any): Promise<SyncResponse[]> => {
        try {
          const token = await this.getArgoToken(argoInstance);
          try {
            const resp = argoInstance.appName.map(
              (argoApp: any): Promise<SyncResponse> => {
                return this.syncArgoApp({
                  argoInstance,
                  argoToken: token,
                  appName: argoApp,
                });
              },
            );
            return await Promise.all(resp);
          } catch (e: any) {
            return [{ status: 'Failure', message: e.message }];
          }
        } catch (e: any) {
          return [{ status: 'Failure', message: e.message }];
        }
      },
    );

    return await Promise.all(parallelSyncCalls);
  }

  async syncArgoApp({
    argoInstance,
    argoToken,
    appName,
  }: SyncArgoApplicationProps): Promise<SyncResponse> {
    const data = {
      prune: false,
      dryRun: false,
      strategy: {
        hook: {
          force: true,
        },
      },
      resources: null,
    };

    const options: RequestInit = {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${argoToken}`,
      },
    };
    const resp = await fetch(
      `${argoInstance.url}/api/v1/applications/${appName}/sync`,
      options,
    );
    if (resp.ok) {
      return {
        status: 'Success',
        message: `Re-synced ${appName} on ${argoInstance.name}`,
      };
    }
    return {
      message: `Failed to resync ${appName} on ${argoInstance.name}`,
      status: 'Failure',
    };
  }

  async deleteApp({
    baseUrl,
    argoApplicationName,
    argoToken,
  }: DeleteApplicationProps): Promise<boolean> {
    const options: RequestInit = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${argoToken}`,
      },
    };

    const resp = await fetch(
      `${baseUrl}/api/v1/applications/${argoApplicationName}?${new URLSearchParams(
        {
          cascade: 'true',
        },
      )}`,
      options,
    );
    const data = await resp?.json();
    if (resp.ok) {
      return true;
    }

    if (resp.status === 403 || resp.status === 404) {
      throw new Error(data.message);
    }
    return false;
  }

  async deleteProject({
    baseUrl,
    argoProjectName,
    argoToken,
  }: DeleteProjectProps): Promise<boolean> {
    const options: RequestInit = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${argoToken}`,
      },
    };

    const resp = await fetch(
      `${baseUrl}/api/v1/projects/${argoProjectName}?${new URLSearchParams({
        cascade: 'true',
      })}`,
      options,
    );

    const data = await resp?.json();
    if (resp.ok) {
      return true;
    }

    if (resp.status === 403 || resp.status === 404) {
      throw new Error(data.message);
    } else if (data.error && data.message) {
      throw new Error(`Cannot Delete Project: ${data.message}`);
    }
    return false;
  }

  async deleteAppandProject({
    argoAppName,
    argoInstanceName,
  }: DeleteApplicationAndProjectProps): Promise<DeleteApplicationAndProjectResponse> {
    const argoDeleteAppResp: ResponseSchema = {
      status: '',
      message: '',
    };
    const argoDeleteProjectResp: ResponseSchema = {
      status: '',
      message: '',
    };

    const matchedArgoInstance = this.instanceConfigs.find(
      argoInstance => argoInstance.name === argoInstanceName,
    );
    if (matchedArgoInstance === undefined) {
      argoDeleteAppResp.status = 'failed';
      argoDeleteAppResp.message =
        'cannot find an argo instance to match this cluster';
      throw new Error('cannot find an argo instance to match this cluster');
    }

    let token: string;
    if (!matchedArgoInstance.token) {
      token = await this.getArgoToken(matchedArgoInstance);
    } else {
      token = matchedArgoInstance.token;
    }

    let countinueToDeleteProject: boolean = true;
    let isAppExist: boolean = true;
    try {
      const deleteAppResp = await this.deleteApp({
        baseUrl: matchedArgoInstance.url,
        argoApplicationName: argoAppName,
        argoToken: token,
      });
      if (deleteAppResp === false) {
        countinueToDeleteProject = false;
        argoDeleteAppResp.status = 'failed';
        argoDeleteAppResp.message = 'error with deleteing argo app';
      }
    } catch (e: any) {
      if (typeof e.message === 'string') {
        isAppExist = false;
        countinueToDeleteProject = true;
        argoDeleteAppResp.status = 'failed';
        argoDeleteAppResp.message = e.message;
      }
      const message =
        e.message || `Failed to delete your app:, ${argoAppName}.`;
      this.logger.info(message);
    }

    let isAppPendingDelete: boolean = false;
    if (isAppExist) {
      for (
        let attempts = 0;
        attempts < (this.config.getOptionalNumber('argocd.waitCycles') || 5);
        attempts++
      ) {
        try {
          const argoApp = await this.getArgoAppData(
            matchedArgoInstance.url,
            matchedArgoInstance.name,
            { name: argoAppName },
            token,
          );

          isAppPendingDelete = 'metadata' in argoApp;
          if (!isAppPendingDelete) {
            argoDeleteAppResp.status = 'success';
            argoDeleteAppResp.message = 'application is deleted successfully';
            break;
          }

          await timer(5000);
        } catch (e: any) {
          const message =
            e.message || `Failed to get argo app data for:, ${argoAppName}.`;
          this.logger.info(message);
          if (
            attempts ===
            (this.config.getOptionalNumber('argocd.waitCycles') || 5) - 1
          ) {
            argoDeleteAppResp.status = 'failed';
            argoDeleteAppResp.message = 'error getting argo app data';
          }
          continue;
        }
      }
    }

    try {
      if (isAppPendingDelete && isAppExist) {
        argoDeleteAppResp.status = 'failed';
        argoDeleteAppResp.message = 'application pending delete';
        argoDeleteProjectResp.status = 'failed';
        argoDeleteProjectResp.message =
          'skipping project deletion due to app deletion pending';
      } else if (countinueToDeleteProject) {
        await this.deleteProject({
          baseUrl: matchedArgoInstance.url,
          argoProjectName: argoAppName,
          argoToken: token,
        });
        argoDeleteProjectResp.status = 'success';
        argoDeleteProjectResp.message = 'project is deleted successfully';
      } else {
        argoDeleteProjectResp.status = 'failed';
        argoDeleteProjectResp.message =
          'skipping project deletion due to error deleting argo app';
      }
    } catch (e: any) {
      const message =
        e.message || `Failed to delete the project:, ${argoAppName}.`;
      this.logger.info(message);
      if (typeof e.message === 'string') {
        argoDeleteProjectResp.status = 'failed';
        argoDeleteProjectResp.message = e.message;
      } else {
        argoDeleteProjectResp.status = 'failed';
        argoDeleteProjectResp.message = 'error with deleteing argo project';
      }
    }
    return {
      argoDeleteAppResp: argoDeleteAppResp,
      argoDeleteProjectResp: argoDeleteProjectResp,
    };
  }

  async createArgoResources({
    argoInstance,
    appName,
    projectName,
    namespace,
    sourceRepo,
    sourcePath,
    labelValue,
    logger,
  }: CreateArgoResourcesProps): Promise<boolean> {
    logger.info(`Getting app ${appName} on ${argoInstance}`);
    const matchedArgoInstance = this.instanceConfigs.find(
      argoHost => argoHost.name === argoInstance,
    );

    if (!matchedArgoInstance) {
      throw new Error(`Unable to find Argo instance named "${argoInstance}"`);
    }

    const token =
      matchedArgoInstance.token ||
      (await this.getArgoToken(matchedArgoInstance));

    await this.createArgoProject({
      baseUrl: matchedArgoInstance.url,
      argoToken: token,
      projectName: projectName ? projectName : appName,
      namespace,
      sourceRepo,
    });

    await this.createArgoApplication({
      baseUrl: matchedArgoInstance.url,
      argoToken: token,
      appName,
      projectName: projectName ? projectName : appName,
      namespace,
      sourceRepo,
      sourcePath,
      labelValue: labelValue ? labelValue : appName,
    });

    return true;
  }
}
