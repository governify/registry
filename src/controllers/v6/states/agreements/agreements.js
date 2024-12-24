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
const logger = governify.getLogger().tag('agreement-state-manager');
const db = require('../../../../database');
const stateManager = require('../../../../stateManager/v6/state-manager.js');
const JSONStream = require('JSONStream');

/**
 * Agreement state module.
 * @module agreementsState
 * @see module:states
 * @requires config
 * @requires stateManager
 * @requires request
 * */
module.exports = {
  agreementIdGET: _agreementIdGET,
  agreementIdDELETE: _agreementIdDELETE,
  statesDELETE: _statesDELETE,
  statesFilter: _statesFilter
};

/**
 * Get an agreement state by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreements.agreementIdGET
 * */
async function _agreementIdGET (req, res) {
  logger.info('New request to GET agreements (states/agreements/agreements.js)');
  const { agreementId } = req.params;
  try{
    const manager = await stateManager({id: agreementId});
    manager.get(agreementId).then(function (agreement) {
      res.json(agreement);
    }, function (err) {
      logger.error(err.message.toString());
      res.status(err.code).json(err);
    });
  } catch (err) {
    logger.error(err.message.toString());
    return res.status(err.code || 500).json({ error: err.message });
  }
}

/**
 * Delete an agreement state by agreement ID.
 * @param {Object} args {agreement: String, from: String, to: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreements.agreementIdDELETE
 * */
async function _agreementIdDELETE(req, res) {
  const { agreementId } = req.params;
  logger.info('New request to DELETE agreement state for agreement ' + agreementId);

  if (!agreementId) {
    logger.warn("Can't delete state for agreement: Missing agreementId");
    return res.status(400).send({ message: "Can't delete state for agreement: Missing agreementId" });
  }

  try {
    const StateModel = db.models.StateModel;
    const BillsModel = db.models.BillsModel;

    const stateResult = await StateModel.deleteOne({ agreementId });

    if (stateResult.deletedCount === 0) {
      logger.warn('No state found to delete for agreement ' + agreementId);
      return res.status(404).send({ message: 'No state found to delete for agreement ' + agreementId });
    }

    logger.info('Deleted state for agreement ' + agreementId);

    // Delete bills associated with the agreement
    const billsResult = await BillsModel.deleteMany({ agreementId });
    logger.info(`Deleted ${billsResult.deletedCount} bills for agreement ` + agreementId);

    return res.sendStatus(200);
  } catch (error) {
    logger.error('Error while deleting state or bills for agreement ' + agreementId + ': ' + error.message);
    return res.status(500).send({ message: 'Error while deleting state or bills for agreement ' + agreementId + ': ' + error.message });
  }
}

/**
 * Delete all agreement states
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreements.statesDELETE
 * */
async function _statesDELETE (req, res) {
  logger.info('New request to DELETE all agreement states');
  const StateModel = db.models.StateModel;
  try{
    await StateModel.deleteMany({});
    res.sendStatus(200);
    logger.info('Deleted state for all agreements');
  } catch (err) {
    res.status(404).send({ message: "Can't delete state for all agreements: " + err.message });
    logger.warn("Can't delete state for all agreements: " + err.message);
  }
}

/**
 * States filter
 * @param {Object} req {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreements.statesFilter
 * */
async function _statesFilter(req, res) {
  logger.info('New request to GET filtered agreements states (states/agreements/agreements.js) with params: ' + JSON.stringify(req.query));

  const { agreementId } = req.params;
  const indicator = req.query.indicator;
  const type = req.query.type;
  const from = req.query.from;
  const to = req.query.to;
  const at = req.query.at;

  try {
    // Recreate scopes object
    const scopeQuery = {};
    let groupQuery = {};

    for (const property in req.query) {
      if (property.startsWith('scope.')) {
        if (req.query[property] === '*') {
          scopeQuery[property] = { $exists: true };
        } else {
          const parsedValue = parseInt(req.query[property], 10);
          scopeQuery[property] = isNaN(parsedValue)
            ? { $eq: req.query[property] }
            : { $eq: parsedValue };
        }

        groupQuery = {
          $group: {
            _id: `$${property}`,
            evidences: { $push: '$records.evidences' },
          },
        };
      }
    }
    const StateModel = db.models.StateModel;
    const andQuery = {
      agreementId: { $eq: agreementId },
      id: { $eq: indicator },
      stateType: { $eq: type },
      'period.from': { $eq: from || at },
    };

    if (to) {
      andQuery['period.to'] = { $eq: to };
    }
    Object.assign(andQuery, scopeQuery); // Merge scope properties into the query
    const aggregationPipeline = [
      { $match: { $and: [andQuery] } },
      { $unwind: '$records' },
    ];

    if (Object.keys(groupQuery).length > 0) {
      aggregationPipeline.push(groupQuery);
    }
    const results = await StateModel.aggregate(aggregationPipeline).allowDiskUse(true).exec();

    if (results.length === 0) {
      logger.warn(`No states found for agreementId: ${agreementId}`);
      return res.status(404).send({ message: `No states found for agreementId: ${agreementId}` });
    }
    // Stream the results to the response
    JSONStream.stringify()(results).pipe(res);

  } catch (err) {
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      res.status(400).send({ message: `Invalid request: ${err.message}` });
      logger.warn(`Invalid request: ${err.message}`);
    } else {
      res.status(500).send({ message: `Unexpected error: ${err.message}` });
      logger.error(`Unexpected error: ${err.message}`);
    }
  }
}