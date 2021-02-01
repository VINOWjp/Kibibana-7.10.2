/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Capabilities } from 'src/core/public';

export function canViewInApp(uiCapabilities: Capabilities, type: string): boolean {
  switch (type) {
    case 'search':
    case 'searches':
      return uiCapabilities.discover.show as boolean;
    case 'visualization':
    case 'visualizations':
      return uiCapabilities.visualize.show as boolean;
    case 'index-pattern':
    case 'index-patterns':
    case 'indexPatterns':
      return uiCapabilities.management.kibana.indexPatterns as boolean;
    case 'dashboard':
    case 'dashboards':
      return uiCapabilities.dashboard.show as boolean;
    default:
      return uiCapabilities[type].show as boolean;
  }
}
