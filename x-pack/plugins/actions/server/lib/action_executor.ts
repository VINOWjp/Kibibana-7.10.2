/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { Logger, KibanaRequest } from 'src/core/server';
import { validateParams, validateConfig, validateSecrets } from './validate_with_schema';
import {
  ActionTypeExecutorResult,
  ActionTypeRegistryContract,
  GetServicesFunction,
  RawAction,
  PreConfiguredAction,
  ProxySettings,
} from '../types';
import { EncryptedSavedObjectsClient } from '../../../encrypted_saved_objects/server';
import { SpacesServiceSetup } from '../../../spaces/server';
import { EVENT_LOG_ACTIONS } from '../plugin';
import { IEvent, IEventLogger, SAVED_OBJECT_REL_PRIMARY } from '../../../event_log/server';
import { ActionsClient } from '../actions_client';
import { ActionExecutionSource } from './action_execution_source';

export interface ActionExecutorContext {
  logger: Logger;
  spaces?: SpacesServiceSetup;
  getServices: GetServicesFunction;
  getActionsClientWithRequest: (
    request: KibanaRequest,
    authorizationContext?: ActionExecutionSource<unknown>
  ) => Promise<PublicMethodsOf<ActionsClient>>;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  actionTypeRegistry: ActionTypeRegistryContract;
  eventLogger: IEventLogger;
  preconfiguredActions: PreConfiguredAction[];
  proxySettings?: ProxySettings;
}

export interface ExecuteOptions<Source = unknown> {
  actionId: string;
  request: KibanaRequest;
  params: Record<string, unknown>;
  source?: ActionExecutionSource<Source>;
}

export type ActionExecutorContract = PublicMethodsOf<ActionExecutor>;

export class ActionExecutor {
  private isInitialized = false;
  private actionExecutorContext?: ActionExecutorContext;
  private readonly isESOUsingEphemeralEncryptionKey: boolean;

  constructor({ isESOUsingEphemeralEncryptionKey }: { isESOUsingEphemeralEncryptionKey: boolean }) {
    this.isESOUsingEphemeralEncryptionKey = isESOUsingEphemeralEncryptionKey;
  }

  public initialize(actionExecutorContext: ActionExecutorContext) {
    if (this.isInitialized) {
      throw new Error('ActionExecutor already initialized');
    }
    this.isInitialized = true;
    this.actionExecutorContext = actionExecutorContext;
  }

  public async execute({
    actionId,
    params,
    request,
    source,
  }: ExecuteOptions): Promise<ActionTypeExecutorResult<unknown>> {
    if (!this.isInitialized) {
      throw new Error('ActionExecutor not initialized');
    }

    if (this.isESOUsingEphemeralEncryptionKey === true) {
      throw new Error(
        `Unable to execute action due to the Encrypted Saved Objects plugin using an ephemeral encryption key. Please set xpack.encryptedSavedObjects.encryptionKey in kibana.yml`
      );
    }

    const {
      logger,
      spaces,
      getServices,
      encryptedSavedObjectsClient,
      actionTypeRegistry,
      eventLogger,
      preconfiguredActions,
      getActionsClientWithRequest,
      proxySettings,
    } = this.actionExecutorContext!;

    const services = getServices(request);
    const spaceId = spaces && spaces.getSpaceId(request);
    const namespace = spaceId && spaceId !== 'default' ? { namespace: spaceId } : {};

    const { actionTypeId, name, config, secrets } = await getActionInfo(
      await getActionsClientWithRequest(request, source),
      encryptedSavedObjectsClient,
      preconfiguredActions,
      actionId,
      namespace.namespace
    );

    if (!actionTypeRegistry.isActionExecutable(actionId, actionTypeId)) {
      actionTypeRegistry.ensureActionTypeEnabled(actionTypeId);
    }
    const actionType = actionTypeRegistry.get(actionTypeId);

    let validatedParams: Record<string, unknown>;
    let validatedConfig: Record<string, unknown>;
    let validatedSecrets: Record<string, unknown>;

    try {
      validatedParams = validateParams(actionType, params);
      validatedConfig = validateConfig(actionType, config);
      validatedSecrets = validateSecrets(actionType, secrets);
    } catch (err) {
      return { status: 'error', actionId, message: err.message, retry: false };
    }

    const actionLabel = `${actionTypeId}:${actionId}: ${name}`;
    const event: IEvent = {
      event: { action: EVENT_LOG_ACTIONS.execute },
      kibana: {
        saved_objects: [
          {
            rel: SAVED_OBJECT_REL_PRIMARY,
            type: 'action',
            id: actionId,
            ...namespace,
          },
        ],
      },
    };

    eventLogger.startTiming(event);
    let rawResult: ActionTypeExecutorResult<unknown>;
    try {
      rawResult = await actionType.executor({
        actionId,
        services,
        params: validatedParams,
        config: validatedConfig,
        secrets: validatedSecrets,
        proxySettings,
      });
    } catch (err) {
      rawResult = {
        actionId,
        status: 'error',
        message: 'an error occurred while running the action executor',
        serviceMessage: err.message,
        retry: false,
      };
    }
    eventLogger.stopTiming(event);

    // allow null-ish return to indicate success
    const result = rawResult || {
      actionId,
      status: 'ok',
    };

    event.event = event.event || {};

    if (result.status === 'ok') {
      event.event.outcome = 'success';
      event.message = `action executed: ${actionLabel}`;
    } else if (result.status === 'error') {
      event.event.outcome = 'failure';
      event.message = `action execution failure: ${actionLabel}`;
      event.error = event.error || {};
      event.error.message = actionErrorToMessage(result);
      logger.warn(`action execution failure: ${actionLabel}: ${event.error.message}`);
    } else {
      event.event.outcome = 'failure';
      event.message = `action execution returned unexpected result: ${actionLabel}: "${result.status}"`;
      event.error = event.error || {};
      event.error.message = 'action execution returned unexpected result';
      logger.warn(
        `action execution failure: ${actionLabel}: returned unexpected result "${result.status}"`
      );
    }

    eventLogger.logEvent(event);
    return result;
  }
}

function actionErrorToMessage(result: ActionTypeExecutorResult<unknown>): string {
  let message = result.message || 'unknown error running action';

  if (result.serviceMessage) {
    message = `${message}: ${result.serviceMessage}`;
  }

  if (result.retry instanceof Date) {
    message = `${message}; retry at ${result.retry.toISOString()}`;
  } else if (result.retry) {
    message = `${message}; retry: ${JSON.stringify(result.retry)}`;
  }

  return message;
}

interface ActionInfo {
  actionTypeId: string;
  name: string;
  config: unknown;
  secrets: unknown;
}

async function getActionInfo(
  actionsClient: PublicMethodsOf<ActionsClient>,
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient,
  preconfiguredActions: PreConfiguredAction[],
  actionId: string,
  namespace: string | undefined
): Promise<ActionInfo> {
  // check to see if it's a pre-configured action first
  const pcAction = preconfiguredActions.find(
    (preconfiguredAction) => preconfiguredAction.id === actionId
  );
  if (pcAction) {
    return {
      actionTypeId: pcAction.actionTypeId,
      name: pcAction.name,
      config: pcAction.config,
      secrets: pcAction.secrets,
    };
  }

  // if not pre-configured action, should be a saved object
  // ensure user can read the action before processing
  const { actionTypeId, config, name } = await actionsClient.get({ id: actionId });

  const {
    attributes: { secrets },
  } = await encryptedSavedObjectsClient.getDecryptedAsInternalUser<RawAction>('action', actionId, {
    namespace: namespace === 'default' ? undefined : namespace,
  });

  return {
    actionTypeId,
    name,
    config,
    secrets,
  };
}
