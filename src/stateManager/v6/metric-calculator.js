/*!
governify-registry 3.0.1, built on: 2018-04-18
Copyright (C) 2018 ISA group
http://www.isa.us.es/
https://github.com/isa-group/governify-registry

governify-registry is an Open-source software available under the
GNU General Public License (GPL) version 2 (GPL v2) for non-profit
applications; for commercial licensing terms, please see README.md
for any inquiry.

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';
const governify = require('governify-commons');
const logger = governify.getLogger().tag('metric-calculator');
const Promise = require('bluebird');
const JSONStream = require('JSONStream');

const utils = require('../../utils');

const Query = utils.Query;
const promiseErrorHandler = utils.errors.promiseErrorHandler;

/**
 * Metric calculator module.
 * @module metricCalculator
 * @requires config
 * @requires bluebird
 * @requires js-yaml
 * @requires request
 * @requires JSONStream
 * @see module:calculators
 * */
module.exports = {
  process: processMetric
};

/**
 * Process all metrics.
 * @param {Object} agreement Agreement object
 * @param {Object} metricId Metric ID
 * @param {Object} metricQuery Metric query object
 */
async function processMetric(agreement, metricId, metricQuery) {
  try {
    const metric = agreement.terms.metrics[metricId];
    if (!metric) {
      throw new Error(`Metric ${metricId} not found.`);
    }

    const { collector } = metric;
    const collectorQuery = {
      parameters: metricQuery.parameters,
      window: metricQuery.window,
      evidences: metricQuery.evidences || undefined,
    };

    const scope = metricQuery.scope;

    if (collector.type === 'GET-V1') {
      logger.error('Collector type GET-V1 is not supported in this version.');
      return {};
    }

    if (collector.type === 'POST-GET-V1') {
      return await processPostGetV1Metric(metric, agreement, scope, collectorQuery, collector, metricId);
    }

    if (collector.type === 'PPINOT-V1') {
      return await processPpinotV1Metric(metric, agreement, collectorQuery, collector, metricId);
    }

    logger.error(`Unsupported collector type: ${collector.type}`);
    return {};
  } catch (err) {
    logger.error(`Error processing metric ${metricId}: ${err.message}`, { error: err });
    throw err;
  }
}

async function processPostGetV1Metric(metric, agreement, scope, collectorQuery, collector, metricId) {
  try {
    metric.measure.scope = Object.keys(scope).length > 0 ? scope : collectorQuery.scope;
    metric.measure.window = collectorQuery.window;

    const service = governify.infrastructure.getService(collector.infrastructurePath);
    const requestMetric = await service.request({
      url: collector.endpoint,
      method: 'POST',
      data: { config: collector.config, metric: metric.measure },
    });

    const collectorResponse = requestMetric.data;
    const monthMetrics = await getComputationV2(
      collector.infrastructurePath,
      `/${collectorResponse.computation.replace(/^\//, '')}`,
      60000
    );

    return processMetricStates(monthMetrics, metric, agreement.context.definitions.logs, metricId);
  } catch (err) {
    logger.error(`Error in POST-GET-V1 processing for metric ${metricId}: ${err.message}`);
    logger.error(JSON.stringify(err.response.data));
    throw err;
  }
}

async function processPpinotV1Metric(metric, agreement, collectorQuery, collector, metricId) {
  try {
    const logDefinition = getLogDefinition(metric, agreement);
    collectorQuery.logs = {
      [logDefinition.logId]: new LogField(
        logDefinition.uri,
        logDefinition.stateUri,
        logDefinition.terminator,
        logDefinition.structure
      ),
    };

    collectorQuery.scope = metricQuery.scope;
    const service = governify.infrastructure.getService(collector.infrastructurePath);
    const requestMetric = await service.request({
      url: `${collector.endpoint}/${collector.name}?${Query.parseToQueryParams(collectorQuery)}`,
      method: 'GET',
      responseType: 'stream',
    });

    return handleStreamResponse(requestMetric.data, metric, agreement.context.definitions.logs, metricId);
  } catch (err) {
    logger.error(`Error in PPINOT-V1 processing for metric ${metricId}: ${err.message}`, { error: err });
    throw err;
  }
}

async function getComputationV2(infrastructurePath, computationURL, ttl) {
  if (ttl < 0) throw new Error('Retries time exceeded TTL.');

  logger.debug(`Requesting computation to ${computationURL} in ${infrastructurePath}`);
  const service = governify.infrastructure.getService(infrastructurePath);
  try {
    const response = await service.get(computationURL);

    if (response.status === 202) {
      logger.debug(`Computation not ready, retrying in 200ms.`);
      return new Promise(resolve =>
        setTimeout(() => resolve(getComputationV2(infrastructurePath, computationURL, ttl - 200)), 200)
      );
    }

    if (response.status === 200) {
      return response.data.computations;
    }

    throw new Error(`Unexpected response status ${response.status}`);
  } catch (err) {
    logger.error(`Error retrieving computation: ${err.message}`, { error: err });
    throw err;
  }
}

function getLogDefinition(metric, agreement) {
  let logDefinition, logId;

  if (metric.log) {
    logId = Object.keys(metric.log)[0];
    if (!logId) throw new Error('Log field in metric is not well defined.');
    logDefinition = metric.log[logId];
  } else {
    const defaultLog = Object.entries(agreement.context.definitions.logs).find(([_, log]) => log.default);
    if (!defaultLog) throw new Error('No default log defined in agreement.');
    [logId, logDefinition] = defaultLog;
  }

  return { ...logDefinition, logId };
}

function processMetricStates(monthMetrics, metric, logs, metricId) {
  if (!Array.isArray(monthMetrics)) {
    throw new Error(`Computer response for metric ${metricId} is not an array: ${JSON.stringify(monthMetrics)}`);
  }
  const compositeResponse = monthMetrics.map(metricState => {
    if (metricState.log && metric.scope) {
      const logId = Object.keys(metricState.log)[0];
      const log = logs[logId];
      metricState.scope = utils.scopes.computerToRegistryParser(metricState.scope, log.scopes);
    }
    return metricState;
  });

  logger.debug(`Processed metric ${metricId}: \n ${JSON.stringify(compositeResponse, null, 2)}`);

  return {metricId: metricId, metricValues: compositeResponse};
}

function handleStreamResponse(requestStream, metric, logs, metricId) {
  return new Promise((resolve, reject) => {
    const compositeResponse = [];
    requestStream.pipe(JSONStream.parse()).on('data', monthMetrics => {
      try {
        const processedMetrics = processMetricStates(monthMetrics, metric, logs, metricId);
        compositeResponse.push(...processedMetrics);
      } catch (err) {
        logger.error(`Error processing stream data for metric ${metricId}: ${err.message}`, { error: err });
        reject(err);
      }
    }).on('end', () => resolve({ metricId, metricValues: compositeResponse }))
      .on('error', err => reject(err));
  });
}

class Config {
  constructor(ptkey, schedules, holidays, overrides, measures) {
    this.ptkey = ptkey;
    this.schedules = schedules;
    this.holidays = holidays;
    this.overrides = overrides;
    this.measures = measures;
  }
}

class LogField {
  constructor(uri, stateUri, terminator, structure) {
    if (!uri || !stateUri || !terminator || !structure) {
      throw new Error('Invalid LogField. All fields are required.');
    }
    this.uri = uri;
    this.stateUri = stateUri;
    this.terminator = terminator;
    this.structure = structure;
  }
}
