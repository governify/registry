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
const Promise = require('bluebird');
const JSONStream = require('JSONStream');

const governify = require('governify-commons');
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('guarantees');
const ErrorModel = require('../../../../errors').errorModel;

const stateManager = require('../../../../stateManager/v6/state-manager');
const db = require('../../../../database');

const gUtils = require('./gUtils.js');
const utils = require('../../../../utils');

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
function _getGuarantees(agreementId, guaranteeId, query, forceUpdate) {
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
function _guaranteesGET(req, res) {
  const { agreementId } = req.params;
  const from = req.query.from;
  const to = req.query.to;
  const lastPeriod = req.query.lastPeriod ? (req.query.lastPeriod === 'true') : true;
  const newPeriodsFromGuarantees = req.query.newPeriodsFromGuarantees ? (req.query.newPeriodsFromGuarantees === 'true') : true;
  logger.info('New request to GET guarantees - With new periods from guarantees: ' + newPeriodsFromGuarantees);

  let result;
  if (config.streaming) {
    logger.info('### Streaming mode ###');

    res.setHeader('content-type', 'application/json; charset=utf-8');
    result = utils.stream.createReadable();
    result.pipe(JSONStream.stringify()).pipe(res);
  } else {
    logger.info('### NO Streaming mode ###');
    result = [];
  }

  stateManager({
    id: agreementId
  }).then(function (manager) {
    logger.info('Getting state of guarantees...');
    const validationErrors = [];
    if (config.parallelProcess.guarantees) {
      logger.info('### Process mode = PARALLEL ###');

      const guaranteesPromises = [];
      manager.agreement.terms.guarantees.forEach(function (guarantee) {
        const query = new Query(req.query);

        const validation = utils.validators.guaranteeQuery(query, guarantee.id, guarantee);
        if (!validation.valid) {
          validation.guarantee = guarantee.id;
          validationErrors.push(validation);
        } else {
          if (req.query.forceUpdate == 'true') {
            guaranteesPromises.push(manager.get('guarantees', query, true));
          } else {
            guaranteesPromises.push(manager.get('guarantees', query, false));
          }
        }
      });

      if (validationErrors.length === 0) {
        utils.promise.processParallelPromises(manager, guaranteesPromises, result, res, config.streaming);
      } else {
        res.status(400).json(new ErrorModel(400, validationErrors));
      }
    } else {
      logger.info('### Process mode = SEQUENTIAL ###');
      const guaranteesQueries = manager.agreement.terms.guarantees.reduce(function (acc, guarantee) {
        /* Process each guarantee individually, to create queries for every one */
        const guaranteeDefinition = manager.agreement.terms.guarantees.find((e) => {
          return guarantee.id === e.id;
        });
        const requestWindow = guaranteeDefinition.of[0].window; // Get the window of the current guarantee
        let periods;
        /* Create all the queries corresponding for the specified period and the current guarantee */
        let allQueries = [];
        if (from && to) {
          requestWindow.from = from;
          requestWindow.end = to;
          // if (newPeriodsFromGuarantees) {
          if (true) {
            periods = utils.time.getPeriods(manager.agreement, requestWindow);
          } else {
            periods = [{ from: new Date(from).toISOString(), to: new Date(to).toISOString() }];
          }

          // Create query for every period
          allQueries = periods.map(function (period) {
            return gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to);
          });
        } else {
          if (lastPeriod) {
            const period = utils.time.getLastPeriod(manager.agreement, requestWindow);
            allQueries.push(gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to));
          } else {
            allQueries.push(guarantee.id);
          }
        }
        /* Validate queries and add to the list */
        const queries = [...acc];
        for (const query of allQueries) {
          const validation = utils.validators.guaranteeQuery(query, guarantee.id);
          if (!validation.valid) {
            validation.guarantee = guarantee.id;
            validationErrors.push(validation);
          } else {
            queries.push(query);
          }
        }
        return queries;
      }, []);
      if (validationErrors.length === 0) {
        if (req.query.forceUpdate == 'true') {
          utils.promise.processSequentialPromises('guarantees', manager, guaranteesQueries, result, res, config.streaming, true);
        } else {
          utils.promise.processSequentialPromises('guarantees', manager, guaranteesQueries, result, res, config.streaming, false);
        }
      } else {
        res.status(400).json(new ErrorModel(400, validationErrors));
      }
    }
  }, function (err) {
    logger.error('(guarantee controller) ' + JSON.stringify(err.message));
    res.status(err.code || 500).json({ message: err.message});
  });
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
  const query = new Query(req.query);
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
