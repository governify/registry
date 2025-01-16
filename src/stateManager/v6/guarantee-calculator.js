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
const logger = governify.getLogger().tag('guarantee-calculator');
const utils = require('../../utils');

const promiseErrorHandler = utils.errors.promiseErrorHandler;

const vm = require('vm');

/**
 * Guarantee calculator module.
 * @module guaranteeCalculator
 * @requires config
 * @requires utils
 * @requires bluebird
 * @requires vm
 * @see module:calculators
 * */
module.exports = {
  processAll: processGuarantees,
  process: processGuarantee
};

/**
 * Process all guarantees.
 * @param {Object} agreement agreement
 * @alias module:guaranteeCalculator.processAll
 * */
function processGuarantees (agreement) {
  return new Promise(function (resolve, reject) {
    const processGuarantees = [];

    // processGuarantee is called for each guarantee of the agreement guarantees definition
    agreement.terms.guarantees.forEach(function (guarantee) {
      processGuarantees.push(processGuarantee(agreement, guarantee.id, true));
    });

    utils.promise.processParallelPromises(null, processGuarantees, null, null, null)
      .then(resolve)
      .catch(function (err) {
        const errorString = 'Error processing guarantees';
        return promiseErrorHandler(reject, 'guarantees', 'processGuarantees', 500, errorString, err);
      });
  });
}

/**
 * Process a single guarantee.
 * @param {Object} agreement agreement
 * @param {Object} guaranteeId guarantee ID
 * @param {Object} manager manager
 * @alias module:guaranteeCalculator.process
 */
async function processGuarantee(manager, query, forceUpdate) {
  const agreement = manager.agreement;
  const guaranteeId = query.guarantee;

  try {
    // Retrieve the guarantee definition from the agreement that matches the provided ID
    const guarantee = agreement.terms.guarantees.find(g => g.id === guaranteeId);

    if (!guarantee) {
      const errorString = `Guarantee ${guaranteeId} not found.`;
      return promiseErrorHandler(Promise.reject, 'guarantees', 'processGuarantees', 404, errorString);
    }

    logger.debug('Processing guarantee: ' + guaranteeId);

    // Prepare parameters for processScopedGuarantee
    const processScopedGuarantees = guarantee.of.map((ofElement, index) => {
      if (query.period) {
        logger.debug(`${index} - (processScopedGuarantee) with query ${JSON.stringify(query, null, 2)}`);
        return {
          manager,
          query,
          guarantee,
          ofElement,
          forceUpdate,
        };
      }
    }).filter(Boolean);

    const guaranteesValues = [];

    for (const guaranteeParam of processScopedGuarantees) {
      const value = await processScopedGuarantee(
        guaranteeParam.manager,
        guaranteeParam.query,
        guaranteeParam.guarantee,
        guaranteeParam.ofElement,
        guaranteeParam.forceUpdate
      );
      logger.debug('Scoped guarantee has been processed');
      guaranteesValues.push(...value);
    }

    logger.debug('All scoped guarantees have been processed');
    return {
      guaranteeId,
      guaranteeValues: guaranteesValues,
    };

  } catch (err) {
    const errorString = `Error processing scoped guarantee for: ${guaranteeId}`;
    return promiseErrorHandler(Promise.reject, 'guarantees', 'processGuarantee', 500, errorString, err);
  }
}

/**
 * Process a scoped guarantee.
 * @function processScopedGuarantee
 * @param {Object} agreement agreement
 * @param {Object} guarantee guarantee
 * @param {Object} ofElement of element
 * @param {Object} manager manager
 */
async function processScopedGuarantee(manager, query, guarantee, ofElement, forceUpdate) {
  const agreement = manager.agreement;

  try {
    // Validate and prepare input data
    const slo = ofElement.objective || {};
    const penalties = ofElement.penalties || [];
    const scopeWithDefault = {};
    const definedScopes = Object.keys(ofElement.scope || {});
    const evidences = [];

    for (const guaranteeScope in guarantee.scope) {
      if (definedScopes.includes(guaranteeScope)) {
        scopeWithDefault[guaranteeScope] = ofElement.scope[guaranteeScope];
      } else if (guarantee.scope[guaranteeScope]?.default) {
        scopeWithDefault[guaranteeScope] = guarantee.scope[guaranteeScope].default;
      }
    }

    if (ofElement.evidences) {
      for (const evidence of ofElement.evidences) {
        const evidenceId = Object.keys(evidence)[0];
        const evidenceComputer = evidence[evidenceId]?.computer;
        if (evidenceComputer) {
          evidences.push({
            id: evidenceId,
            computer: `${evidenceComputer.url.replace(/\/$/, '')}/api/v${evidenceComputer.apiVersion}/${evidenceComputer.name.replace(/^\//, '')}`,
          });
        }
      }
    }

    const processMetrics = [];
    if (ofElement.with) {
      const window = {
        ...ofElement.window,
        initial: query.period?.from || '*',
        end: query.period?.to || '*',
        timeZone: agreement.context?.validity?.timeZone || 'UTC',
      };

      for (const metricId in ofElement.with) {
        processMetrics.push({
          metric: metricId,
          scope: scopeWithDefault,
          parameters: ofElement.with[metricId],
          evidences,
          window,
          period: query.period || { from: '*', to: '*' },
          forceUpdate,
        });
      }
    }

    const timedScopes = [];
    const metricValues = [];

    for (const metricParam of processMetrics) {
      const scopedMetricValues = await manager.get('metrics', metricParam, metricParam.forceUpdate);
      if (scopedMetricValues.length > 0) {
        for (const metricValue of scopedMetricValues) {
          const ts = { scope: metricValue.scope, period: metricValue.period };
          let tsIndex = utils.containsObject(ts, timedScopes);

          if (tsIndex === -1) {
            tsIndex = timedScopes.push(ts) - 1;
          }

          if (!metricValues[tsIndex]) {
            metricValues[tsIndex] = {};
          }

          metricValues[tsIndex][metricValue.id] = manager.current(metricValue);
        }
      }
    }
    const guaranteesValues = [];
    for (let i = 0; i < timedScopes.length; i++) {
      const guaranteeValue = calculatePenalty(agreement, guarantee, ofElement, timedScopes[i], metricValues[i], slo, penalties);
      if (guaranteeValue) guaranteesValues.push(guaranteeValue);
    }

    return guaranteesValues;

  } catch (err) {
    const errorString = `Error processing timedScopes metrics for guarantee: ${guarantee.id}`;
    return promiseErrorHandler(Promise.reject, 'guarantees', 'processScopedGuarantee', 500, errorString, err);
  }
}


/**
 * Calculate a penalty.
 * @function calculatePenalty
 * @param {Object} agreement agreement
 * @param {Object} guarantee guarantee
 * @param {Object} ofElement of element
 * @param {Object} timedScope timed scope
 * @param {Object} metricsValues metric values
 * @param {Object} slo SLO
 * @param {Object} penalties penalties
 * */
function calculatePenalty (agreement, guarantee, ofElement, timedScope, metricsValues, slo, penalties) {
  const guaranteeValue = {};
  guaranteeValue.scope = timedScope.scope;
  guaranteeValue.period = timedScope.period;
  guaranteeValue.guarantee = guarantee.id;
  guaranteeValue.evidences = [];
  guaranteeValue.metrics = {};
  const values = [];
  penalties = {};// Temporal fix

  for (const metricId in ofElement.with) {
    let value = 0;
    if (metricsValues[metricId]) {
      value = metricsValues[metricId].value;
    }
    if (value === 'NaN' || value === '') {
      logger.warn('Unexpected value (' + value + ') for metric ' + metricId + ' ');
      return;
    }
    vm.runInThisContext(metricId + ' = ' + value);
    guaranteeValue.metrics[metricId] = value;
    if (metricsValues[metricId] && metricsValues[metricId].evidences) {
      guaranteeValue.evidences = guaranteeValue.evidences.concat(metricsValues[metricId].evidences);
    } else {
      logger.warn('Metric without evidences: ' + JSON.stringify(metricsValues[metricId], null, 2));
    }

    const val = {};
    val[metricId] = value;
    values.push(val);
  }

  const fulfilled = Boolean(vm.runInThisContext(slo));
  guaranteeValue.value = fulfilled;

  if (!fulfilled && penalties.length > 0) {
    guaranteeValue.penalties = {};
    penalties.forEach(function (penalty) {
      const penaltyVar = Object.keys(penalty.over)[0];
      const penaltyFulfilled = penalty.of.filter(function (compensationOf) {
        return vm.runInThisContext(compensationOf.condition);
      });
      if (penaltyFulfilled.length > 0) {
        guaranteeValue.penalties[penaltyVar] = parseFloat(vm.runInThisContext(penaltyFulfilled[0].value));
      } else {
        guaranteeValue.penalties[penaltyVar] = 0;
        logger.error('SLO not fulfilled and no penalty found: ');
        logger.error('\t- penalty: ', penalty.of);
        logger.error('\t- metric value: ', values);
      }
    });
  }
  return guaranteeValue;
}
