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
const logger = governify.getLogger().tag('overrides');
const $RefParser = require('@apidevtools/json-schema-ref-parser');
const db = require('../../../database');
const ErrorModel = require('../../../errors/index.js').errorModel;
const bills = require('../bills/bills');
const guarantees = require('../states/guarantees/guarantees');

/**
 * Registry override module.
 * @module overrides
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
  statesAgreementGuaranteesGuaranteeOverridesPOST: _statesAgreementGuaranteesGuaranteeOverridesPOST,
  statesAgreementGuaranteesGuaranteeOverridesDELETE: _statesAgreementGuaranteesGuaranteeOverridesDELETE,
  statesAgreementGuaranteesGuaranteeOverridesGET: _statesAgreementGuaranteesGuaranteeOverridesGET,
  statesAgreementOverridesDELETE: _statesAgreementOverridesDELETE
};

function createOverride (override, agreement, guarantee) {
  return changeOverride(override, agreement, guarantee, false);
}

function deleteOverride (override, agreement, guarantee) {
  return changeOverride(override, agreement, guarantee, true);
}

// Helper function to get a bill for a specific period
async function getBillForPeriod(agreement, period) {
  const bill = await bills.getBill(agreement, period);
  if (bill && bill.state.toUpperCase() === 'CLOSED') {
    throw new ErrorModel(403, 'You cannot override periods when the bill is closed.');
  } else if (!bill) {
    throw new ErrorModel(404, 'Bill not found for that period.');
  }
  return bill;
}

// Helper function to find an existing override
async function findOverride(agreement, guarantee, override) {
  const OverridesModel = db.models.OverridesModel;
  return OverridesModel.findOne({
    agreement,
    guarantee,
    'overrides.id': override.id,
    'overrides.scope.priority': override.scope.priority,
    'overrides.period.from': override.period.from
  });
}

// Helper function to update overrides
async function updateOverrides(agreement, guarantee, override, deleteOverride) {
  const OverridesModel = db.models.OverridesModel;

  const existingOverridesDoc = await OverridesModel.findOne({ agreement, guarantee });
  let overrides = existingOverridesDoc?.overrides || [];

  if (deleteOverride) {
    overrides = overrides.filter(o => o.id !== override.id);
  } else {
    overrides.push(override);
  }

  await OverridesModel.updateOne(
    { agreement, guarantee },
    deleteOverride ? { $pull: { overrides: override } } : { overrides },
    { upsert: true }
  );
}

// Helper function to update agreement state and recalculate points
async function updateAgreementState(agreement, guarantee, override) {
  const query = { from: override.period.from, to: override.period.to };
  await guarantees.getGuarantees(agreement, guarantee, query, true);

  const requestData = {
    periods: [{ from: override.period.from, to: override.period.to }]
  };

  const AgreementModel = db.models.AgreementModel;
  const agreementRes = await AgreementModel.findOne({ id: agreement });

  if (agreementRes) {
    const recalculateRequest = await governify.infrastructure
      .getService('internal.reporter')
      .post(`/api/v4/contracts/${agreement}/createPointsFromPeriods`, requestData)
      .catch(err => {
        logger.error('Error recalculating from override:', err);
        throw new Error(err);
      });

    if (recalculateRequest) {
      logger.debug('Result of point recalculation due to an override:', recalculateRequest.status);
    }
  }
}

async function changeOverride(override, agreement, guarantee, deleteOverride) {
  try {
    await getBillForPeriod(agreement, override.period.from);
    const existingOverride = await findOverride(agreement, guarantee, override);
    if (existingOverride && !deleteOverride) {
      throw new ErrorModel(500, 'That override already exists.');
    } else if (!existingOverride && deleteOverride) {
      throw new ErrorModel(404, 'That override does not exist.');
    }

    await updateOverrides(agreement, guarantee, override, deleteOverride);
    logger.info('Override updated successfully!');

    await updateAgreementState(agreement, guarantee, override);
    logger.info('Agreement state updated successfully!');

    return 'OK';
  } catch (err) {
    logger.error('Error changing override:', JSON.stringify(err.message));
    throw err;
  }
}

/**
 * Post an agreement
 * @param {Object} req request
 * @param {Object} res response
 * @alias module:agreement.agreementsPOST
 * */
async function _statesAgreementGuaranteesGuaranteeOverridesPOST (req, res) {
  logger.info('New request to CREATE override');
  const { agreementId, guaranteeId } = req.params;
  const override = req.body;

  try {
    await $RefParser.dereference(override);
    const result = await createOverride(override, agreementId, guaranteeId);
    res.status(200).send(result);
  } catch (err) {
    logger.error(JSON.stringify(err));
    res.status(err.code ?? 500).json({ message: err.message });
  }
}

/**
 * Delete override.
 * @param {Object} req request
 * @param {Object} res response
 * @alias module:override.overrideDELETE
 * */
async function _statesAgreementGuaranteesGuaranteeOverridesDELETE (req, res) {
  logger.info('New request to DELETE override');
  const { agreementId, guaranteeId } = req.params;
  const override = req.body;

  try {
    await $RefParser.dereference(override);
    const result = await deleteOverride(override, agreementId, guaranteeId);
    res.status(200).send(result);
  } catch (err) {
    logger.error(JSON.stringify(err));
    res.status(err.code ?? 500).json({ message: err.message });
  }
}

/**
 * Get all agreements.
 * @param {Object} req request
 * @param {Object} res response
 * @alias module:agreement.agreementsGET
 * */
async function _statesAgreementGuaranteesGuaranteeOverridesGET (req, res) {
  logger.info('New request to GET overrides overrides/overrides.js');
  const { agreementId, guaranteeId } = req.params;
  const OverridesModel = db.models.OverridesModel;

  try {
    const overrides = await OverridesModel.findOne({
      agreement: agreementId,
      guarantee: guaranteeId
    });

    if (!overrides) {
      logger.info('Overrides not found');
      res.status(404).json(new ErrorModel(404, 'Overrides not found'));
      return;
    }
    logger.info('Overrides returned');
    res.status(200).json(overrides ? overrides.overrides : []);
  } catch (err) {
    logger.error(JSON.stringify(err));
    res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Delete override.
 * @param {Object} req request
 * @param {Object} res response
 * @alias module:override.overrideDELETE
 * */
async function _statesAgreementOverridesDELETE (req, res) {
  try {
    logger.info('New request to DELETE all overrides for agreement');
    const { agreementId } = req.params;
    const OverridesModel = db.models.OverridesModel;
    const agreement = await OverridesModel.deleteMany({
      agreement: agreementId
    });
    
    if (agreement.deletedCount === 0) {
      logger.info('Overrides not found');
      res.status(404).json(new ErrorModel(404, 'Overrides not found'));
      return;
    }
    logger.info('Deleted all overrides for agreement ' + agreementId);
    res.status(200).send('OK');
  } catch (err) {
    logger.error(JSON.stringify(err));
    res.status(500).json(new ErrorModel(500, err));
  }
}
