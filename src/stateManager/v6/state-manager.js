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
const logger = governify.getLogger().tag('state-manager');

const db = require('../../database');
const ErrorModel = require('../../errors/index.js').errorModel;
const calculators = require('./calculators.js');

// const request = require('requestretry');
// const iso8601 = require('iso8601');

/**
 * State manager module.
 * @module stateManager
 * @requires config
 * @requires database
 * @requires errors
 * @requires calculators
 * @requires bluebird
 * @requires requestretry
 * */
module.exports = initialize;

/**
 * Initialize the StateManager for an agreement.
 * 
 * Building stateManager object with agreement definitions and stateManager method
 * get ==> gets one or more states, put ==> save an scoped state,
 * update ==> calculates one or more states and save them,
 * current ==> do a map over state an returns the current record for this state.
 * 
 * @param {String} _agreement agreement ID
 * @return {Promise} Promise that will return a StateManager object
 * @alias module:stateManager.initialize
 * */
async function initialize(_agreement) {
  logger.debug('(initialize) Initializing state with agreement ID = ' + _agreement.id);
  
  try {
    const AgreementModel = db.models.AgreementModel;
    logger.debug('Searching agreement with agreementID = ' + _agreement.id);
    const ag = await AgreementModel.findOne({ id: _agreement.id });
    
    if (!ag) {
      throw new ErrorModel(404, 'There is no agreement with id: ' + _agreement.id);
    }
    logger.debug('StateManager for agreementID = ' + _agreement.id + ' initialized');

    // Building stateManager object
    const stateManager = {
      agreement: ag,
      get: _get,
      put: _put,
      update: _update,
      current: _current,
    };

    return stateManager;
  } catch (err) {
    logger.error(JSON.stringify(err));
    throw new ErrorModel(err.code || 500, err.message || err.toString());
  }
}


/**
 * Gets one or more states by an specific query.
 * @function _get
 * @param {String} stateType enum: {guarantees, pricing, agreement, metrics}
 * @param {StateManagerQuery} query query will be matched with an state.
 * @return {Promise} Promise that will return an array of state objects
 * */
async function _get(stateType, query = {}, forceUpdate) {
  const stateManager = this;
  logger.debug(`(_get) Retrieving state of ${stateType} - ForceUpdate: ${forceUpdate}`);

  try {
    logger.debug(`Getting ${stateType} state for query = ${JSON.stringify(query)}`);

    const StateModel = db.models.StateModel;
    const refinedQuery = projectionBuilder(
      stateType,
      refineQuery(stateManager.agreement.id, stateType, query)
    );

    const result = await StateModel.find(refinedQuery);

    if (result.length > 0) {
      logger.debug(`Found ${stateType} state for query = ${JSON.stringify(query)} in DB`);
      logger.debug(`Refreshing states of ${stateType}`);

      const states = await stateManager.update(stateType, query, forceUpdate);
      return states;
    } else {
      logger.debug(`No ${stateType} state found for query = ${JSON.stringify(query)} in DB`);
      logger.debug(`Adding states of ${stateType}`);

      const states = await stateManager.update(stateType, query, forceUpdate);
      return states;
    }
  } catch (err) {
    logger.error(`Error while retrieving ${stateType} states: ${err}`);
    throw new ErrorModel(500, `Error while retrieving ${stateType} states: ${err.message}`);
  }
}

/**
 * Add states with a specific query.
 * @function _put
 * @param {String} stateType - Enum: {guarantees, pricing, agreement, metrics}.
 * @param {Object} query - Query to match with a state.
 * @param {Object} value - Value to be added.
 * @param {Object} metadata - Additional metadata (e.g., logsState, evidences, parameters).
 * @returns {Promise<Array>} - Resolves with an array of state objects.
 */
async function _put(stateType, query, value, metadata) {
  const stateManager = this;
  const StateModel = db.models.StateModel;

  logger.debug(`(_put) Saving state of ${stateType}`);
  logger.debug(`AGREEMENT: ${stateManager.agreement.id}`);

  const dbQuery = projectionBuilder(stateType, refineQuery(stateManager.agreement.id, stateType, query));
  logger.debug(`Updating ${stateType} state with refinedQuery: ${JSON.stringify(dbQuery, null, 2)}`);

  try {
    const result = await StateModel.updateOne(dbQuery, {
      $push: {
        records: new Record(value, metadata)
      }
    });

    logger.debug(`NMODIFIED record: ${JSON.stringify(result)}`);

    let stateSignature = `StateSignature (${result.nModified}) [`;
    stateSignature += Object.values(dbQuery).join(', ');
    stateSignature += ']';
    logger.debug(stateSignature);

    if (result.nModified === 0) {
      logger.debug(`Creating new ${stateType} state with the record...`);

      const newState = new State(value, refineQuery(stateManager.agreement.id, stateType, query), metadata);
      const stateModel = new StateModel(newState);

      await stateModel.save();
      logger.debug(`Inserted new Record in the new ${stateType} state.`);

      const newResult = await StateModel.find(
        projectionBuilder(stateType, refineQuery(stateManager.agreement.id, stateType, query))
      );

      if (query.scope.servicio === 'INT_PRV_CITASEVO_V1.0.0') {
        console.log(newResult);
      }

      return newResult;
    } else {
      logger.debug(`Inserted new Record of ${stateType} state.`);

      const existingResult = await StateModel.find(
        projectionBuilder(stateType, refineQuery(stateManager.agreement.id, stateType, query))
      );

      return existingResult;
    }
  } catch (err) {
    logger.error(`Error updating ${stateType} state: ${err}`);
    throw new ErrorModel(500, err);
  }
}



/**
 * Modify states with a specific query.
 * @function _update
 * @param {String} stateType - Enum: {guarantees, pricing, agreement, metrics, quotas}
 * @param {Object} query - Query to match with a state.
 * @param {Object} logsState - Logs state.
 * @param {Boolean} forceUpdate - Force update flag.
 * @returns {Promise<Array>} - Resolves with an array of state objects.
 */
async function _update(stateType, query, logsState, forceUpdate) {
  const stateManager = this;
  logger.debug(`(_update) Updating state of ${stateType}`);

  try {
    switch (stateType) {
    case 'agreement': {
      const states = await calculators.agreementCalculator.process(stateManager);
      return states;
    }
    case 'guarantees': {
      const guaranteeDefinition = stateManager.agreement.terms.guarantees.find(
        (e) => query.guarantee === e.id
      );

      if (!guaranteeDefinition) {
        throw new ErrorModel(400, 'Guarantee not found');
      }

      const guaranteeStates = await calculators.guaranteeCalculator.process(stateManager, query, forceUpdate);
      logger.debug(`Guarantee states for ${guaranteeStates.guaranteeId} calculated (${guaranteeStates.guaranteeValues.length})`);

      const processGuarantees = guaranteeStates.guaranteeValues.map((guaranteeState) =>
        stateManager.put(stateType, {
          guarantee: query.guarantee,
          period: guaranteeState.period,
          scope: guaranteeState.scope
        }, guaranteeState.value, {
          metrics: guaranteeState.metrics,
          evidences: guaranteeState.evidences
        })
      );

      logger.debug(`Persisting ${processGuarantees.length} guarantee states...`);
      const guarantees = await Promise.all(processGuarantees);
      return guarantees.map((g) => g[0]);
    }
    case 'metrics': {
      const metricStates = await calculators.metricCalculator.process(stateManager.agreement, query.metric, query);
      logger.debug(`Metric states for ${metricStates.metricId} calculated (${metricStates.metricValues.length})`);

      const processMetrics = metricStates.metricValues.map((metricValue) =>
        stateManager.put(stateType, {
          metric: query.metric,
          scope: metricValue.scope,
          period: metricValue.period,
          window: query.window
        }, metricValue.value, {
          evidences: metricValue.evidences,
          parameters: metricValue.parameters
        })
      );

      logger.debug(`Persisting ${processMetrics.length} metric states...`);
      const metrics = await Promise.all(processMetrics);
      return metrics.map((m) => m[0]);
    }
    case 'pricing': {
      const pricingStates = await calculators.pricingCalculator.process(stateManager.agreement, query, stateManager);
      logger.debug(`All pricing states (${pricingStates.length}) calculated`);
      return pricingStates;
    }
    case 'quotas': {
      const quotasStates = await calculators.quotasCalculator.process(stateManager, query);
      logger.debug(`All quotas states (${quotasStates.length}) calculated`);
      return quotasStates;
    }
    default: {
      throw new ErrorModel(500, `No method implemented to calculate ${stateType} state`);
    }
    }
  } catch (err) {
    logger.error(`Error updating ${stateType} state: ${err}`);
    throw new ErrorModel(500, `Error updating ${stateType} state: ${err.message}`);
  }
}

/**
 * State.
 * @function State
 * @param {Object} value value
 * @param {String} query query will be matched with an state.
 * @param {Object} metadata {logsState, evidences, parameters}
 * */
function State (value, query, metadata) {
  for (const v in query) {
    this[v] = query[v];
  }
  this.records = [];
  this.records.push(new Record(value, metadata));
}

/**
 * Record.
 * @function Record
 * @param {Object} value value
 * @param {Object} metadata {logsState, evidences, parameters}
 * */
function Record (value, metadata) {
  this.value = value;
  this.time = new Date().toISOString();
  if (metadata) {
    for (const v in metadata) {
      this[v] = metadata[v];
    }
  }
}

/**
 * Get current state.
 * @function getCurrent
 * @param {Object} state state
 * */
function getCurrent (state) {
  return state.records[state.records.length - 1];
}

/**
 * _current.
 * @function _current
 * @param {Object} state state
 * @return {object} state
 * */
function _current (state) {
  const newState = {
    stateType: state.stateType,
    agreementId: state.agreementId,
    id: state.id,
    scope: state.scope,
    period: state.period,
    window: state.window ? state.window : undefined
  };
  const currentRecord = getCurrent(state);
  for (const v in currentRecord) {
    if (v !== 'time' && v !== 'logsState') {
      newState[v] = currentRecord[v];
    }
  }
  return newState;
}

/**
 * Refine the query for a search in database.
 * @function refineQuery
 * @param {String} agreementId agreementId
 * @param {String} stateType enum: {guarantees, pricing, agreement, metrics}
 * @param {String} query query will be matched with an state.
 * @return {object} refined query
 * */
function refineQuery (agreementId, stateType, query) {
  const refinedQuery = {};
  refinedQuery.stateType = stateType;
  refinedQuery.agreementId = agreementId;

  if (query.scope) {
    refinedQuery.scope = query.scope;
  }

  if (query.period) {
    refinedQuery.period = query.period;
  }

  if (query.window) {
    refinedQuery.window = query.window;
  }

  switch (stateType) {
  case 'metrics':
    refinedQuery.id = query.metric;
    break;
  case 'guarantees':
    refinedQuery.id = query.guarantee;
    break;
  }
  return refinedQuery;
}

/**
 * Refine the query for a search in database.
 * @function projectionBuilder
 * @param {String} stateType enum: {guarantees, pricing, agreement, metrics}
 * @param {String} query query will be matched with an state.
 * @return {String} mongo projection
 * */
function projectionBuilder (stateType, query) {
  const singular = {
    guarantees: 'guarantee',
    metrics: 'metric',
    quotas: 'quota',
    rates: 'rate',
    pricing: 'pricing',
    agreement: 'agreement'
  };
  const projection = {};
  const singularStateType = singular[stateType];
  if (!singularStateType) {
    return logger.error("projectionBuilder error: stateType '%s' is not expected", stateType);
  }

  let propValue = null;
  let propName = null;
  // iterate over element in the query (scope, period...)
  for (const v in query) {
    if (query[v] instanceof Object) {
      const queryComponent = query[v];
      // if it is an object we iterate over it (e.g. period.*)
      for (const qC in queryComponent) {
        propValue = null;
        propName = v + '.' + qC;
        propValue = queryComponent[qC];
        if (propValue !== '*') {
          projection[propName] = propValue;
        }
      }
    } else {
      // if it is not an object we add it directly (e.g. guarantee.guarantee = "K01")
      propValue = null;
      propName = v;
      propValue = query[v];
      if (propValue !== '*') {
        projection[propName] = propValue;
      }
    }
  }
  logger.debug('Mongo projection: ' + JSON.stringify(projection, null, 2));
  return projection;
}
