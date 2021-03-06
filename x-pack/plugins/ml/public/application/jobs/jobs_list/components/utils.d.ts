/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

export function getSelectedIdFromUrl(str: string): { groupIds?: string[]; jobId?: string };
export function getGroupQueryText(arr: string[]): string;
export function getJobQueryText(arr: string | string[]): string;
export function clearSelectedJobIdFromUrl(str: string): void;
