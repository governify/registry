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
const $RefParser = require('@apidevtools/json-schema-ref-parser');
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
  agreementsAgreementTermsGuaranteesGET: _agreementsAgreementTermsGuaranteesGET,
  agreementsAgreementTermsGuaranteesGuaranteeGET: _agreementsAgreementTermsGuaranteesGuaranteeGET
};

/**
 * Post an agreement
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsPOST
 * */
function _agreementsPOST (args, res) {
  logger.info('New request to CREATE agreement');
  $RefParser.dereference(args.agreement.value, function (err, schema) {
    if (err) {
      logger.error(err.toString());
      res.status(500).json(new ErrorModel(500, err));
    } else {
      const agreement = new db.models.AgreementModel(schema);
      agreement.save(function (err) {
        if (err) {
          logger.error('Mongo error saving agreement: ' + err.toString());
          res.status(500).json(new ErrorModel(500, err));
        } else {
          logger.info('New agreement saved successfully!');
          logger.info('Initializing agreement state');
          // Initialize state
          agreementManager.initializeState(schema, function (st) {
            const state = new db.models.StateModel(st);
            state.save(function (err) {
              if (err) {
                logger.error('Mongo error saving state: ' + err.toString());
                res.status(500).json(new ErrorModel(500, err));
              } else {
                logger.info('State initialized successfully!');
                res.sendStatus(200);
              }
            });
          }, function (err) {
            logger.error('Mongo error saving state: ' + err.toString());
            res.status(500).json(new ErrorModel(500, err));
          });
        }
      });
    }
  });
}

/**
 * Delete all agreements.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsDELETE
 * */
function _agreementsDELETE (args, res) {
  logger.info('New request to DELETE all agreements');
  const AgreementModel = db.models.AgreementModel;
  AgreementModel.remove({}, function (err) {
    if (!err) {
      logger.info('Deleted all agreements');
      states.agreements.statesDELETE(args, res);
    } else {
      res.sendStatus(404);
      logger.warn("Can't delete all agreements: " + err);
    }
  });
}

/**
 * Get all agreements.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsGET
 * */
function _agreementsGET (args, res) {
  /**
     * parameters expected in the args:
     * namespace (String)
     **/
  logger.info('New request to GET agreements agreements/agreements.js');
  const AgreementModel = db.models.AgreementModel;
  AgreementModel.find(function (err, agreements) {
    if (err) {
      logger.error(err.toString());
      res.status(500).json(new ErrorModel(500, err));
    }
    logger.info('Agreements returned');
    res.status(200).json(agreements);
  });
}

/**
 * Get an agreement by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementIdGET
 * */
function _agreementIdGET (args, res) {
  logger.info('New request to GET agreement with id = ' + args.agreement.value);
  const AgreementModel = db.models.AgreementModel;
  AgreementModel.findOne({
    id: args.agreement.value
  }, function (err, agreement) {
    if (err) {
      logger.error(err.toString());
      return res.status(500).json(new ErrorModel(500, err));
    }

    if (!agreement) {
      logger.warn('There is no agreement with id: ' + args.agreement.value);
      return res.status(404).json(new ErrorModel(404, 'There is no agreement with id: ' + args.agreement.value));
    }

    logger.info('Agreement returned');
    res.status(200).json(agreement);
  });
}

/**
 * Delete an agreement by agreement ID.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementIdDELETE
 * */
function _agreementIdDELETE (args, res) {
  logger.info('New request to DELETE agreement');
  const agreementId = args.agreement.value;
  if (agreementId) {
    const AgreementModel = db.models.AgreementModel;
    AgreementModel.remove({
      id: agreementId
    }, function (err) {
      if (!err) {
        logger.info('Deleted agreement with id ' + agreementId);
        args.agreements = args.agreement;
        states.agreements.agreementIdDELETE(args, res);
      } else {
        res.sendStatus(404);
        logger.warn("Can't delete agreement with id " + agreementId);
      }
    });
  } else {
    res.sendStatus(400);
    logger.warn("Can't delete agreement with id " + agreementId);
  }
}

/**
 * Get all agreement terms.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsAgreementTermsGuaranteesGET
 * */
function _agreementsAgreementTermsGuaranteesGET (args, res) {
  const AgreementModel = db.models.AgreementModel;
  AgreementModel.find({
    id: args.agreement.value
  }, function (err, agreement) {
    if (err) {
      console.error(err);
      res.end();
    }
    if (agreement.length === 1) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(agreement[0].terms.guarantees));
    }
  });
}

/**
 * Get all agreement guarantees.
 * @param {Object} args {agreement: String, guarantee: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:agreement.agreementsAgreementTermsGuaranteesGuaranteeGET
 * */
function _agreementsAgreementTermsGuaranteesGuaranteeGET (args, res) {
  const AgreementModel = db.models.AgreementModel;
  AgreementModel.find({
    id: args.agreement.value
  }, function (err, agreement) {
    if (err) {
      logger.error(err);
      res.end();
    }
    if (agreement.length === 1) {
      const guarantee = agreement[0].terms.guarantees.filter(function (guarantee) {
        return guarantee.id === args.guarantee.value;
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(guarantee));
    }
  });
}
