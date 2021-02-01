/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiFlexItem } from '@elastic/eui';
import darkTheme from '@elastic/eui/dist/eui_theme_dark.json';
import lightTheme from '@elastic/eui/dist/eui_theme_light.json';
import React from 'react';

import { DEFAULT_DARK_MODE } from '../../../../common/constants';
import { DescriptionList } from '../../../../common/utility_types';
import { useUiSetting$ } from '../../../common/lib/kibana';
import { FlowTarget, NetworkDetailsStrategyResponse } from '../../../../common/search_strategy';
import { networkModel } from '../../store';
import { getEmptyTagValue } from '../../../common/components/empty_value';

import {
  autonomousSystemRenderer,
  dateRenderer,
  hostIdRenderer,
  hostNameRenderer,
  locationRenderer,
  reputationRenderer,
  whoisRenderer,
} from '../../../timelines/components/field_renderers/field_renderers';
import * as i18n from './translations';
import { DescriptionListStyled, OverviewWrapper } from '../../../common/components/page';
import { Loader } from '../../../common/components/loader';
import { Anomalies, NarrowDateRange } from '../../../common/components/ml/types';
import { AnomalyScores } from '../../../common/components/ml/score/anomaly_scores';
import { useMlCapabilities } from '../../../common/components/ml/hooks/use_ml_capabilities';
import { hasMlUserPermissions } from '../../../../common/machine_learning/has_ml_user_permissions';
import { InspectButton, InspectButtonContainer } from '../../../common/components/inspect';

export interface IpOverviewProps {
  data: NetworkDetailsStrategyResponse['networkDetails'];
  flowTarget: FlowTarget;
  id: string;
  ip: string;
  loading: boolean;
  isLoadingAnomaliesData: boolean;
  anomaliesData: Anomalies | null;
  startDate: string;
  endDate: string;
  type: networkModel.NetworkType;
  narrowDateRange: NarrowDateRange;
}

const getDescriptionList = (descriptionList: DescriptionList[], key: number) => (
  <EuiFlexItem key={key}>
    <DescriptionListStyled listItems={descriptionList} />
  </EuiFlexItem>
);

export const IpOverview = React.memo<IpOverviewProps>(
  ({
    id,
    ip,
    data,
    loading,
    flowTarget,
    startDate,
    endDate,
    isLoadingAnomaliesData,
    anomaliesData,
    narrowDateRange,
  }) => {
    const capabilities = useMlCapabilities();
    const userPermissions = hasMlUserPermissions(capabilities);
    const [darkMode] = useUiSetting$<boolean>(DEFAULT_DARK_MODE);
    const typeData = data[flowTarget]!;
    const column: DescriptionList[] = [
      {
        title: i18n.LOCATION,
        description: locationRenderer(
          [`${flowTarget}.geo.city_name`, `${flowTarget}.geo.region_name`],
          data
        ),
      },
      {
        title: i18n.AUTONOMOUS_SYSTEM,
        description: typeData
          ? autonomousSystemRenderer(typeData.autonomousSystem, flowTarget)
          : getEmptyTagValue(),
      },
    ];

    const firstColumn: DescriptionList[] = userPermissions
      ? [
          ...column,
          {
            title: i18n.MAX_ANOMALY_SCORE_BY_JOB,
            description: (
              <AnomalyScores
                anomalies={anomaliesData}
                startDate={startDate}
                endDate={endDate}
                isLoading={isLoadingAnomaliesData}
                narrowDateRange={narrowDateRange}
              />
            ),
          },
        ]
      : column;

    const descriptionLists: Readonly<DescriptionList[][]> = [
      firstColumn,
      [
        {
          title: i18n.FIRST_SEEN,
          description: typeData ? dateRenderer(typeData.firstSeen) : getEmptyTagValue(),
        },
        {
          title: i18n.LAST_SEEN,
          description: typeData ? dateRenderer(typeData.lastSeen) : getEmptyTagValue(),
        },
      ],
      [
        {
          title: i18n.HOST_ID,
          description:
            typeData && data.host
              ? hostIdRenderer({ host: data.host, ipFilter: ip })
              : getEmptyTagValue(),
        },
        {
          title: i18n.HOST_NAME,
          description: typeData && data.host ? hostNameRenderer(data.host, ip) : getEmptyTagValue(),
        },
      ],
      [
        { title: i18n.WHOIS, description: whoisRenderer(ip) },
        { title: i18n.REPUTATION, description: reputationRenderer(ip) },
      ],
    ];

    return (
      <InspectButtonContainer>
        <OverviewWrapper>
          <InspectButton queryId={id} title={i18n.INSPECT_TITLE} inspectIndex={0} />

          {descriptionLists.map((descriptionList, index) =>
            getDescriptionList(descriptionList, index)
          )}

          {loading && (
            <Loader
              overlay
              overlayBackground={
                darkMode ? darkTheme.euiPageBackgroundColor : lightTheme.euiPageBackgroundColor
              }
              size="xl"
            />
          )}
        </OverviewWrapper>
      </InspectButtonContainer>
    );
  }
);

IpOverview.displayName = 'IpOverview';
