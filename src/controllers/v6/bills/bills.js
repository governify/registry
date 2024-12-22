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
const logger = governify.getLogger().tag('bills');
const $RefParser = require('json-schema-ref-parser');
const db = require('../../../database');
const utils = require('../../../utils');

const ErrorModel = require('../../../errors/index.js').errorModel;
const moment = require('moment-timezone');

/**
 * Registry bill module.
 * @module bills
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
  billsPUT: _billsPUT,
  billsGET: _billsGET,
  billsDELETE: _billsDELETE,
  getBill: _getBill
};

/**
 * Post an bill
 * @param {Object} args {bill: Object}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:bills.bills
 * PUT
 * */
async function _billsPUT(req, res) {
  const { agreementId, billId } = req.params;
  const data = req.body;

  logger.info('New request to CREATE or UPDATE bill');

  try {
    // Dereference the schema
    await $RefParser.dereference(data);

    // Get the BillsModel
    const BillsModel = db.models.BillsModel;

    // Check if the bill already exists
    const existingBill = await BillsModel.findOne({ agreementId, billId });

    if (existingBill) {
      if (existingBill.state === 'closed') {
        // Bill is closed, so you can't modify it
        return res.status(403).send('Cannot edit bill when state is closed.');
      }

      // If the bill exists and is not closed, update it
      const updatedBill = await BillsModel.updateOne(
        { agreementId, billId },
        data,
        { upsert: true }
      );

      logger.info('Bill updated successfully!');
      return res.status(200).send(updatedBill);
    }

    // If the bill does not exist, create a new one
    const newBill = new BillsModel(data);
    await newBill.save();

    logger.info('New bill created successfully!');
    return res.status(201).send(newBill);

  } catch (err) {
    logger.error('Error occurred during PUT request:', err);
    return res.status(500).json(new ErrorModel(500, err));
  }
}


/**
 * Get all bills.
 * @param {Object} req {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:bills.billsGET
 * */
async function _billsGET(req, res) {
  const { agreementId } = req.params;
  const { from, to } = req.query; 

  logger.info('New request to GET bills from bills/bills.js');

  try {
    const AgreementModel = db.models.AgreementModel;
    const BillsModel = db.models.BillsModel;

    // Find the agreement based on the agreementId
    const agreement = await AgreementModel.findOne({ id: agreementId });

    if (!agreement) {
      return res.status(404).send('Agreement not found');
    }

    // Find all bills for the given agreementId
    const bills = await BillsModel.find({ agreementId });

    let periods;
    if (from && to) {
      const window = { from, end: to };
      periods = utils.time.getPeriods(agreement, window);
    } else {
      periods = utils.time.getPeriods(agreement);
    }

    const billsDates = bills.map(bill => moment(bill.period.from).unix());
    const orderedBills = periods.map(period => {
      const periodUnix = moment(period.from).unix();
      const existingBillIndex = billsDates.indexOf(periodUnix);

      if (existingBillIndex === -1) {
        return {
          agreementId,
          billId: periodUnix.toString(),
          state: 'open',
          period,
        };
      } else {
        return bills[existingBillIndex];
      }
    });

    logger.info('Bills returned successfully');
    return res.status(200).json(orderedBills);
    
  } catch (err) {
    logger.error('Error occurred:', err);
    return res.status(500).json(new ErrorModel(500, err));
  }
}

/**
 * Get bill for one agreement and period
 * @param {String} agreementId AgreementId
 * @alias module:bills.getBill
 * */
async function _getBill (agreementId, from) {
  const BillsModel = db.models.BillsModel;
  return BillsModel.findOne({ agreementId: agreementId, 'period.from': from });
}

/**
 * Get bill for one agreement and period
 * @param {String} agreementId AgreementId
 * @alias module:bills.getBill
 * */
async function _billsDELETE(req, res) {
  const { agreementId } = req.params;
  const BillsModel = db.models.BillsModel;

  try {
    const result = await BillsModel.deleteMany({ agreementId: agreementId.value });

    if (result.deletedCount === 0) {
      return res.status(404).send('No bills found for the given agreementId');
    }

    res.status(200).send('Bills deleted successfully');
  } catch (err) {
    logger.error('Error occurred during bills deletion:', err);
    res.status(500).json(new ErrorModel(500, err));
  }
}

