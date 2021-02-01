/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { MetricsUIAggregation } from '../../../types';

export const rdsLatency: MetricsUIAggregation = {
  rdsLatency: {
    avg: {
      field: 'aws.rds.latency.dml',
    },
  },
};