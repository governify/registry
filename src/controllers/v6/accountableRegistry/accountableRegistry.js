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
const Promise = require('bluebird');

const governify = require('governify-commons');
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('accountable-registry');

const ErrorModel = require('../../../errors/index.js').errorModel;
const stateManager = require('../../../stateManager/v6/state-manager');

const gUtils = require('../states/guarantees/gUtils.js');
const utils = require('../../../utils');
const Query = utils.Query;
const { resolve } = require('bluebird');

/**
 * Registry agreement module.
 * @module accountableRegistry
 * @see module:accountableRegistry
 * @see module:accountableRegistryService
 * @requires config
 * @requires database
 * @requires errors
 * @requires json-schema-ref-parser
 * */
module.exports = {
  setUpAccountableRegistryGET: _setUpAccountableRegistryGET
};

/**
 * Set up the accountable registry.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @alias module:agreement.setUpAccountableRegistryGET
 * */
function _setUpAccountableRegistryGET (req, res) {
  var metricQueries = []
  logger.info('New request to GET agreement');

  const agreementId = req.agreement.value;
  // const from = req.query.from;
  // const to = req.query.to;
  // const lastPeriod = req.query.lastPeriod ? (req.query.lastPeriod === 'true') : true;
  // const newPeriodsFromGuarantees = req.query.newPeriodsFromGuarantees ? (req.query.newPeriodsFromGuarantees === 'true') : true;
  //logger.info('New request to GET guarantees - With new periods from guarantees: ' + newPeriodsFromGuarantees);

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
        // if (from && to) {
        //     requestWindow.from = from;
        //     requestWindow.end = to;
        //     if (newPeriodsFromGuarantees) {
        //         periods = utils.time.getPeriods(manager.agreement, requestWindow);
        //     } else {

        periods = [{ from: req.from.value, to: req.to.value }];
                    
        //     }

        //     // Create query for every period

        allQueries = periods.map(function (period) {
          return gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to);
        });

        // } else {
        // if(lastPeriod){


        // const period = utils.time.getLastPeriod(manager.agreement, requestWindow);
        // allQueries.push(gUtils.buildGuaranteeQuery(guarantee.id, period.from, period.to));


        // }else{
        //     allQueries.push(guarantee.id);
        // }
        // }
        /* Validate queries and add to the list */
        const queries = [...acc];
        for (const query of allQueries) {
          const validation = utils.validators.guaranteeQuery(query, guarantee.id);
          if (!validation.valid) {
            validation.guarantee = guarantee.id;
            validationErrors.push(validation);
          } else {
            if(guaranteeDefinition.of[0].reliable){
              queries.push(query);
            }
          }
        }
        return queries;
      }, []);
      if (validationErrors.length === 0) {
        //var guaranQueries = []
        Promise.each(guaranteesQueries, function (query) {
          const agreement = manager.agreement;
          const guaranteeId = query.guarantee;
                        
          const guaranteeDef = agreement.terms.guarantees.find(function (guaranteeDef) {
            return guaranteeDef.id === guaranteeId;
          });
                
          logger.debug('Processing guarantee: ' + guaranteeId);
          if (!guaranteeDef) {
            const errorString = 'Guarantee ' + guaranteeId + ' not found.';
          }
          // We prepare the parameters needed by the processScopedGuarantee function
          const processScopedGuarantees = guaranteeDef.of.reduce(function (acc, ofElement, index) {
            if (query.period) {
              logger.debug(index + '- ( processScopedGuarantee ) with query' + JSON.stringify(query, null, 2));
              var auxProcessScopedGuarantees = [...acc];
              auxProcessScopedGuarantees.push({
                manager: manager,
                query: query,
                guarantee: guaranteeDef,
                ofElement: ofElement
              });
            }
            return auxProcessScopedGuarantees;
          }, []);
          //guaranQueries.push({"guarantee": guaranteeId, "scopedGuarantees":processScopedGuarantees})
          Promise.each(processScopedGuarantees, function (guaranteeParam) {
            return processScopedGuarantee(guaranteeParam.manager, guaranteeParam.query, guaranteeParam.guarantee, guaranteeParam.ofElement).then(function () {
              logger.debug('Scoped guarantee has been processed');
              // Once we have calculated the scoped guarantee state, we add it to the array 'guaranteeValues'
              // guaranteesValues = guaranteesValues.concat(value);
            });
            // This catch will be controller by the each.catch in order to stop
            // the execution when 1 promise fails
          }).then(function () {
            logger.debug('All scoped guarantees have been processed');
            // Once we have calculated all scoped guarantees, we return guarantee ID and guarantee states values
            return resolve();
          }).catch(function (err) {
            console.log('Error processing scoped guarantee for: ' + guaranteeId)
          });
        }).then(function (result) {
          let AgreementData = {'agreement': manager.agreement, 'metricQueries': metricQueries}

          try{
            governify.httpClient.post('http://host.docker.internal:6100/api/v1/setUp/' + agreementId, AgreementData).then( (response) => {
              res.send({
                code: response.data.code,
                message: response.data.message
              })
              return resolve();
            }).catch((err) => {
              logger.error(err);
              res.send({
                code:500,
                message: 'Error setting up agreement'
              });
            })
            // end stream
            if (config.streaming) {
              result.push(null);
            }
          }catch{
            console.log('error')
          }
        }).catch(function (err) {
          console.log(err)
        });
        //utils.promise.processSequentialPromises('guarantees', manager, guaranteesQueries, result, res, config.streaming, false);
                
      } else {
        res.status(400).json(new ErrorModel(400, validationErrors));
      }
    }
  }, function (err) {
    logger.error('(guarantee controller)' + err);
    res.status(500).json(new ErrorModel(500, err));
  });

  function processScopedGuarantee(manager, query, guarantee, ofElement){
    try {
      return new Promise((resolve, reject) => {
        const agreement = manager.agreement;
        const slo = ofElement.objective;
        const penalties = ofElement.penalties;
        const processMetrics = [];
        // If some scope is not specified, we set it with default values
        const scopeWithDefault = {};
        const definedScopes = Object.keys(ofElement.scope || {});
        for (const guaranteeScope in guarantee.scope) {
          if (definedScopes.indexOf(guaranteeScope) > -1) {
            scopeWithDefault[guaranteeScope] = ofElement.scope[guaranteeScope];
          } else if (guarantee.scope[guaranteeScope].default) {
            scopeWithDefault[guaranteeScope] = guarantee.scope[guaranteeScope].default;
          }
        }
        // We collect the evidences that will be send to computer
        const evidences = [];
        if (ofElement.evidences) {
          ofElement.evidences.forEach(function (evidence) {
            const evidenceId = Object.keys(evidence)[0];
            const evidenceComputer = evidence[evidenceId].computer;
            if (evidenceComputer) {
              evidences.push({
                id: evidenceId,
                computer: evidenceComputer.url.replace(/\/$/, '') + '/api/v' + evidenceComputer.apiVersion + '/' + evidenceComputer.name.replace(/^\//, '')
              });
            }
          });
        }
        // We get the metrics to calculate from the with section of the scoped guarantee
        if (ofElement.with) {
          const window = ofElement.window;
          window.initial = query.period.from;
          if (query.period && query.period.to) {
            window.end = query.period.to;
          }
              
          window.timeZone = agreement.context.validity.timeZone;
          // For each metric, we create an object with the parameters needed by the manager to be able to calculate the metric state
          for (const metricId in ofElement.with) {
            processMetrics.push({
              metric: metricId,
              scope: scopeWithDefault,
              parameters: ofElement.with[metricId],
              evidences: evidences,
              window: window,
              period: {
                from: query.period ? query.period.from : '*',
                to: query.period ? query.period.to : '*'
              }
            });
          }
        }

        const promisesA = []
        processMetrics.forEach(function (metricParam) {

          promisesA.push(new Promise(function (resolve, reject) {
            let metric = agreement.terms.metrics[metricParam.metric];
            if (!metric) {
              return reject('Metric ' + metricParam.metric + ' not found.');
            }
            const collector = metric.collector;
            var collectorQuery = {};
            collectorQuery.parameters = metricParam.parameters;
            collectorQuery.window = metricParam.window;

            if (metricParam.evidences) {
              collectorQuery.evidences = metricParam.evidences;
            }
            var scope = metricParam.scope;

            logger.info('Using collector type: ' + collector.type);

            if (collector.type === 'POST-GET-V1') {

              const urlParams = {...metric.measure}

              urlParams.scope = metricParam.scope;
                      
              urlParams.window = metricParam.window;
              // console.log(metricParam.scope)
              metricQueries.push({
                guaranteeID: query.guarantee,
                collector: collector,
                urlParams: urlParams,
                metric: metricParam.metric
              })
              resolve()
            } else if (collector.type === 'PPINOT-V1') { // For ppinot collector
              let metric = agreement.terms.metrics[metricParam.metric];
              if (!metric) {
                return reject('Metric ' + metricParam.metric + ' not found.');
              }
              
              const metricCollectorObject = metric.collector;
              
              /** ### BUILD COMPUTER REQUEST QUERY ###**/
              var collectorQuery = {};
              collectorQuery.parameters = metricParam.parameters;
              collectorQuery.window = metricParam.window;
              
              if (metricParam.evidences) {
                collectorQuery.evidences = metricParam.evidences;
              }
              
              // Select logs data. If metric has not log, select by default log.
              let logDefinition, logId;
              if (metric.log) {
                logId = Object.keys(metric.log)[0]; // control this potential error
                if (!logId) { throw new Error('The log field of metric is not well defined in the agreement'); }
                logDefinition = metric.log[logId];
              } else {
                // Search default log
                const agLogs = agreement.context.definitions.logs;
                for (const l in agLogs) {
                  if (agLogs[l].default) {
                    logId = l;
                    logDefinition = agLogs[l];
                    break;
                  }
                }
                if (!logDefinition) { throw new Error('Agreement is not well defined. It Must has at least a default log.'); }
              }
              collectorQuery.logs = {};
              collectorQuery.logs[logId] = new LogField(
                logDefinition.uri,
                logDefinition.stateUri,
                logDefinition.terminator,
                logDefinition.structure
              );
              var scope = utils.scopes.registryToComputerParser(metricParam.scope, logDefinition.scopes);

              collectorQuery.config = new Config(
                '',
                metricCollectorObject.config.schedules,
                metricCollectorObject.config.holidays || null,
                governify.infrastructure.getServices().internal.registry.default + '/api/v6/states/' + agreement.id + '/guarantees/' + metricParam.metric + '/overrides',
                metricCollectorObject.config.measures
              );
              
              if (!collectorQuery.logs) {
                return reject('Log not found for metric ' + metricParam.metric + '. ' +
                                      'Please, specify metric log or default log.');
              }
              collectorQuery.scope = Object.keys(scope).length > 0 ? scope : metricQuery.scope;

              // Build URL query that will use on computer request
              const urlParams = Query.parseToQueryParams(collectorQuery);
              logger.debug('Sending URL params to computer:', urlParams);
              logger.info('Sending request to computer with params: %s', JSON.stringify(collectorQuery, null, 2));
              // Build and send computer request
              process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
              metricQueries.push({
                guaranteeID: query.guarantee,
                collector: collector,
                urlParams: urlParams,
                metric: metricParam.metric
              })
              resolve()
            }
          }));
        });
        Promise.all(promisesA).then(function () {
          resolve();
        }).catch(function (err) {
          console.log('Error processing timedScopes metrics for guarantee: ' + guarantee.id);
        });
      });
    } catch (err) {
      // Controlling errors that are not in promises
      const error = new Error(500, '', err);
      logger.error(error.toString());
    }
  }

  // constructor of computer request log object
  class LogField {
    constructor (uri, stateUri, terminator, structure) {
      if (!uri || !stateUri || !terminator || !structure) {
        throw new Error('The log field of metric is not well defined in the agreement, uri, stateUri, terminator and structure are required fields.');
      }
      this.uri = uri;
      this.stateUri = stateUri;
      this.terminator = terminator;
      this.structure = structure;
    }
  }

  class Config {
    constructor (ptkey, schedules, holidays, overrides, measures) {
      this.measures = measures;
      this.ptkey = ptkey;
      this.schedules = schedules;
      this.holidays = holidays;
      this.overrides = overrides;
    }
  }


  function getComputationV2 (infrastructurePath, computationURL, ttl) {
    return new Promise((resolve, reject) => {
      try {
        if (ttl < 0) { reject('Retries time surpased TTL.'); return; }
        const realTimeout = 1000; // Minimum = firstTimeout
        const firstTimeout = 500;
        setTimeout(async () => {
          governify.infrastructure.getService(infrastructurePath).get(computationURL).then(response => {
            if (response.status === 202) {
              logger.info('Computation ' + computationURL.split('/').pop + ' not ready jet. Retrying in ' + realTimeout + ' ms.');
              setTimeout(() => {
                resolve(getComputationV2(infrastructurePath, computationURL, ttl - realTimeout));
              }, realTimeout - firstTimeout);
            } else if (response.status === 200) {
              resolve(response.data.computations);
            } else {
              // FIXME - Not returning response
              reject(new Error('Invalid response status from collector. Response: \n', response));
            }
          }).catch(err => {
            if (err?.response?.status === 400) {
              logger.error('Failed obtaining computations from collector: ' + err.response.data.errorMessage + '\nCollector used: ' + infrastructurePath + '\nEndpoint: ' + computationURL);
              resolve([]);
            } else {
              logger.error('Error when obtaining computation response from collector: ', infrastructurePath, ' - ComputationURL: ', computationURL, '- ERROR: ', err);
              reject(err);
            }
          });
        }, firstTimeout);
      } catch (err) {
        reject(err);
      }
    });
  }
}
