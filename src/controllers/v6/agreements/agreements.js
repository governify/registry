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
const logger = governify.getLogger().tag('agreement-manager');
const db = require('../../../database');

const states = require('../states/states');
const ErrorModel = require('../../../errors/index.js').errorModel;
const agreementManager = require('governify-agreement-manager').operations.states;

/**
 * Registry agreement module.
 * @module agreements
 * @see module:AgreementRegistry
 * @see module:AgreementRegistryService
 * @requires config
 * @requires database
 * @requires states
 * @requires StateRegistryService
 * @requires errors
 * @requires json-schema-ref-parser
 * @requires governify-agreement-manager
 * */
module.exports = {
  agreementsPOST: _agreementsPOST,
  agreementsDELETE: _agreementsDELETE,
  agreementsGET: _agreementsGET,
  agreementIdGET: _agreementIdGET,
  agreementIdDELETE: _agreementIdDELETE,
  agreementIdPUT: _agreementIdPUT
};

/**
 * Post an agreement
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsPOST
 * */
async function _agreementsPOST(req, res) {
  logger.info('New request to CREATE agreement');
  const { id } = req.body;

  try {
    let agreement = await db.models.AgreementModel.findOne({ id: id });
    if (agreement) {
      logger.warn('Agreement already exists');
      return res.status(409).json(new ErrorModel(409, 'Agreement already exists'));
    }

    agreement = new db.models.AgreementModel(req.body);
    await agreement.save();
    logger.info('New agreement saved successfully!');
    logger.info('Initializing agreement state');

    // Initialize state
    agreementManager.initializeState(
      req.body,
      async (st) => {
        await saveState(st, res); // Delegated state saving to a separate function
      },
      (err) => {
        logger.error('Error initializing state: ' + err.toString());
        res.status(500).json(new ErrorModel(500, err));
      }
    );
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

async function saveState(stateData, res) {
  const state = new db.models.StateModel(stateData);
  try {
    await state.save();
    logger.info('State initialized successfully!');
    res.sendStatus(200);
  } catch (err) {
    logger.error('Mongo error saving state: ' + err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}


/**
 * Delete all agreements.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsDELETE
 * */
async function _agreementsDELETE (req, res) {
  logger.info('New request to DELETE all agreements');
  try {
    await db.models.AgreementModel.deleteMany({});
    logger.info('Deleted all agreements');
    states.agreements.statesDELETE(req, res);
    res.sendStatus(200);
  } catch (err) {
    logger.error("Can't delete all agreements: " + err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Get all agreements.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsGET
 * */
async function _agreementsGET (req, res) {
  /**
     * parameters expected in the args:
     * namespace (String)
     **/
  try{
    logger.info('New request to GET agreements agreements/agreements.js');
    const agreements = await db.models.AgreementModel.find();
    logger.info('Agreements returned');
    res.status(200).json(agreements);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Get an agreement by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementIdGET
 * */
async function _agreementIdGET (req, res) {
  const {agreementId } = req.params;
  logger.info('New request to GET agreement with id = ' + agreementId);
  try {
    const agreement = await db.models.AgreementModel.findOne({ id: agreementId });
    if (!agreement) {
      logger.warn('There is no agreement with id: ' + agreementId);
      return res.status(404).json(new ErrorModel(404, 'There is no agreement with id: ' + agreementId));
    }
    logger.info('Agreement returned');
    res.status(200).json(agreement);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Delete an agreement by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementIdDELETE
 * */
async function _agreementIdDELETE (req, res) {
  logger.info('New request to DELETE agreement');
  const { agreementId } = req.params;

  try {
    const agreement = await db.models.AgreementModel.deleteOne({ id: agreementId });
    if (agreement.deletedCount === 0) {
      logger.warn('There is no agreement with id: ' + agreementId);
      return res.status(404).json(new ErrorModel(404, 'There is no agreement with id: ' + agreementId));
    }
    logger.info('Agreement deleted');
    res.sendStatus(200);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Update an agreement by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementIdPUT
 * */
async function _agreementIdPUT(req, res) {
  logger.info('New request to UPDATE agreement');
  const { agreementId } = req.params;

  try {
    const agreement = await db.models.AgreementModel.findOneAndUpdate(
      { id: agreementId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!agreement) {
      logger.warn('There is no agreement with id: ' + agreementId);
      return res.status(404).json(new ErrorModel(404, 'There is no agreement with id: ' + agreementId));
    }

    logger.info('Agreement updated');
    res.status(200).json(agreement);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}