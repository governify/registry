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
const JSONStream = require('JSONStream');

const governify = require('governify-commons');
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('guarantees');
const ErrorModel = require('../../../../errors').errorModel;

const stateManager = require('../../../../stateManager/v6/state-manager');
const db = require('../../../../database');

const gUtils = require('./gUtils.js');
const utils = require('../../../../utils');
const { runWithToken } = require('../../../../utils/').context;

const Query = utils.Query;
const controllerErrorHandler = utils.errors.controllerErrorHandler;

/**
 * Guarantees module
 * @module guarantees
 * @see module:states
 * @requires config
 * @requires bluebird
 * @requires JSONStream
 * @requires stream
 * @requires errors
 * @requires stateManager
 * @requires gUtils
 * */
module.exports = {
  guaranteesGET: _guaranteesGET,
  guaranteeIdGET: _guaranteeIdGET,
  getGuarantees: _getGuarantees
};

// Method used internally
function _getGuarantees(agreementId, guaranteeId, query) {
  return new Promise(function (resolve, reject) {
    stateManager({
      id: agreementId
    }).then(function (manager) {
      const guaranteesQueries = [];
      const validationErrors = [];
      manager.agreement.terms.guarantees.forEach(function (guarantee) {
        const queryM = gUtils.buildGuaranteeQuery(guarantee.id, query.from, query.to);

        const validation = utils.validators.guaranteeQuery(queryM, guarantee.id, guarantee);
        if (!validation.valid) {
          validation.guarantee = guarantee.id;
          validationErrors.push(validation);
        } else {
          guaranteesQueries.push(queryM);
        }
      });
      if (validationErrors.length === 0) {
        utils.promise.processSequentialPromises('guarantees', manager, guaranteesQueries, null, null, false, true).then(function (result) {
          resolve(result);
        }, function (err) {
          reject(new ErrorModel(500, err));
        });
      } else {
        reject(new ErrorModel(400, validationErrors));
      }
    }, function (err) {
      const errorString = 'Error while initializing state manager for agreement: ' + agreementId;
      reject(new ErrorModel(500, errorString + ' - ' + err));
    });
  });
}

/**
 * Get all guarantees.
 * @param {Object} args {agreement: String, from: String, to: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:guarantees.guaranteesGET
 * */

async function _guaranteesGET(req, res) {
  const { agreementId } = req.params;
  const { from, to, lastPeriod = 'true', newPeriodsFromGuarantees = 'true', forceUpdate } = req.query;
  const lastPeriodFlag = lastPeriod === 'true';
  const newPeriodsFlag = newPeriodsFromGuarantees === 'true';
  const token = req.cookies?.accessToken ?? req.headers['x-access-token'];

  logger.debug(`Access token: ${token}`);

  logger.info(`New request to GET guarantees - With new periods from guarantees: ${newPeriodsFlag}`);

  const result = config.streaming
    ? utils.stream.createReadable()
    : [];

  if (config.streaming) {
    logger.info('### Streaming mode ###');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    result.pipe(JSONStream.stringify()).pipe(res);
  } else {
    logger.info('### NO Streaming mode ###');
  }

  runWithToken(token, async () => {
    try {
      const manager = await stateManager({ id: agreementId });
      logger.info('Getting state of guarantees...');

      if (config.parallelProcess.guarantees) {
        await processGuaranteesInParallel(manager, req, res, result, forceUpdate === 'true');
      } else {
        await processGuaranteesSequentially(manager, res, result, lastPeriodFlag, newPeriodsFlag, forceUpdate === 'true', from, to);
      }
    } catch (err) {
      logger.error(`(guarantee controller) ${JSON.stringify(err.message)}`);
      res.status(err.code || 500).json({ message: err.message });
    }
  });
}

async function processGuaranteesInParallel(manager, req, res, result, forceUpdate) {
  logger.info('### Process mode = PARALLEL ###');

  const guaranteesPromises = [];
  const validationErrors = [];

  for (const guarantee of manager.agreement.terms.guarantees) {
    const query = new Query(req.query);
    const validation = utils.validators.guaranteeQuery(query, guarantee.id, guarantee);

    if (!validation.valid) {
      validation.guarantee = guarantee.id;
      validationErrors.push(validation);
    } else {
      guaranteesPromises.push(manager.get('guarantees', query, forceUpdate));
    }
  }

  if (validationErrors.length > 0) {
    res.status(400).json(new ErrorModel(400, validationErrors));
    return;
  }

  utils.promise.processParallelPromises(manager, guaranteesPromises, result, res, config.streaming);
}

async function processGuaranteesSequentially(manager, res, result, lastPeriodFlag, newPeriodsFlag, forceUpdate, from, to) {
  logger.info('### Process mode = SEQUENTIAL ###');
  
  
  const guaranteesQueries = [];
  const validationErrors = [];

  for (const guarantee of manager.agreement.terms.guarantees) {
    const queries = await buildGuaranteeQueries(manager, guarantee, lastPeriodFlag, newPeriodsFlag, from, to);
    for (const query of queries) {
      const validation = utils.validators.guaranteeQuery(query, guarantee.id, guarantee);
      if (!validation.valid) {
        validation.guarantee = guarantee.id;
        validationErrors.push(validation);
      } else {
        guaranteesQueries.push(query);
      }
    }
  }

  if (validationErrors.length > 0) {
    res.status(400).json(new ErrorModel(400, validationErrors));
    return;
  }

  try {
    await utils.promise.processSequentialPromisesSafely(
      'guarantees',
      manager,
      guaranteesQueries,
      result,
      res,
      config.streaming,
      forceUpdate
    );
  } catch (err) {
    logger.error(`Error in processSequentialPromises: ${err.message}`);
    res.status(500).json(new ErrorModel(500, 'Error processing guarantees sequentially', err));
  }
}

async function buildGuaranteeQueries(manager, guarantee, lastPeriodFlag, newPeriodsFlag, from, to) {
  const guaranteeDefinition = manager.agreement.terms.guarantees.find(e => guarantee.id === e.id);
  const requestWindow = guaranteeDefinition.of[0].window;
  logger.info(`Building queries for guarantee: ${guarantee.id}`);
  logger.info(`Request window: ${JSON.stringify(requestWindow)}`);

  if (from && to) {
    requestWindow.from = from;
    requestWindow.end = to;
    
    logger.info(`From: ${from}, To: ${to}`);
    logger.info(`New periods flag: ${newPeriodsFlag}`);
    
    const periods = newPeriodsFlag
      ? utils.time.getPeriods(manager.agreement, requestWindow)
      : [{ from: new Date(from).toISOString(), to: new Date(to).toISOString() }];
    
    logger.info(`Periods: ${JSON.stringify(periods)}`);
    return periods.map(period => 
      gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to)
    );
  }

  if (lastPeriodFlag) {
    const period = utils.time.getLastPeriod(manager.agreement, requestWindow);
    logger.info(`Last period: ${JSON.stringify(period)}`);
    return [gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to)];
  }
  logger.info(`Returning guarantee ID: ${guarantee.id}`);
  return [guarantee.id];
}

/**
 * Get guarantees by ID.
 * @param {Object} args {agreement: String, guarantee: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:guarantees.guaranteeIdGET
 * */
async function _guaranteeIdGET(req, res) {
  logger.info('New request to GET guarantee');
  const  { agreementId, guaranteeId } = req.params;
  const forceUpdate = req.query.forceupdate ? req.query.forceupdate : 'false';
  const from = req.query.from;
  const to = req.query.to;
  const withNoEvidences = req.query.withNoEvidences;
  let lasts = req.query.lasts;
  let evidences = req.query.evidences;

  let ret;
  if (config.streaming) {
    logger.info('### Streaming mode ###');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    ret = utils.stream.createReadable();
    ret.pipe(JSONStream.stringify()).pipe(res);
  } else {
    logger.info('### NO Streaming mode ###');
  }

  if (lasts || withNoEvidences) {
    const StateModel = db.models.StateModel;
    try {
      let aggregateArray = [{ $match: { agreementId: agreementId, id: guaranteeId } },
        { $addFields: { record: { $last: '$records' } } },
        { $addFields: { record_size: { $size: '$record.evidences' } } },
        { $project: { records: 0 } }
      ];
      withNoEvidences === 'false' && aggregateArray.push({ $match: { record_size: { $gte: 1 } } })
      evidences === 'false' && aggregateArray.push({ $project: { record: { evidences: 0 } } })
      lasts && aggregateArray.push({ $limit: parseInt(lasts) })
      await StateModel.aggregate(aggregateArray).allowDiskUse(true)
        .exec((err, states) => {
          if (err) {
            res.status(500).json(new ErrorModel(500, err));
          } else {
            res.send(states);
          }
        });
    } catch (error) {
      console.log(error)
    }
  } else {
    stateManager({
      id: agreementId
    }).then(function (manager) {
      const guaranteeDefinition = manager.agreement.terms.guarantees.find((e) => {
        return guaranteeId === e.id;
      });
      const requestWindow = guaranteeDefinition.of[0].window; // Create the window for the current request
      logger.info('Iniciating guarantee (' + guaranteeId + ') calculation with window' + JSON.stringify(requestWindow));
      let periods;
      let allQueries = [];
      if (from && to) {
        requestWindow.initial = from;
        requestWindow.end = to;
        periods = utils.time.getPeriods(manager.agreement, requestWindow);
        // Create query for every period
        allQueries = periods.map(function (period) {
          return gUtils.buildGuaranteeQuery(guaranteeId, period.from, period.to);
        });
      } else {
        allQueries.push(gUtils.buildGuaranteeQuery(guaranteeId));
      }
      const results = [];
      logger.info('Processing ' + allQueries.length + ' queries for the request');
      Promise.each(allQueries, function (queryInd) {
        const validation = utils.validators.guaranteeQuery(queryInd, guaranteeId, guaranteeDefinition);
        if (!validation.valid) {
          const errorString = 'Query validation error';
          return controllerErrorHandler(res, 'guarantees-controller', '_guaranteeIdGET', 400, errorString);
        } else {
          return manager.get('guarantees', queryInd, JSON.parse(forceUpdate)).then(function (success) {
            if (config.streaming) {
              success.forEach(function (element) {
                ret.push(manager.current(element));
              });
            } else {
              const result = success.map(function (element) {
                return manager.current(element);
              });

              results.push(result);
            }
          }, function (err) {
            const errorString = 'Error retrieving guarantee ' + guaranteeId;
            return controllerErrorHandler(res, 'guarantees-controller', '_guaranteeIdGET', err.code || 500, errorString, err);
          });
        }
      }).then(function () {
        if (config.streaming) {
          ret.push(null);
        } else {
          res.json(results);
        }
      });
    }, function (err) {
      const errorString = 'Error while initializing state manager for agreement: ' + agreementId;
      return controllerErrorHandler(res, 'guarantees-controller', '_guaranteeIdGET', err.code || 500, errorString, err);
    });
  }
}