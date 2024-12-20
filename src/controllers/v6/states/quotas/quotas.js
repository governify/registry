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
const logger = governify.getLogger().tag('quotas');
const stateManager = require('../../../../stateManager/v6/state-manager.js');

/**
 * Quotas state module.
 * @module quotas
 * @see module:states
 * @requires config
 * @requires stateManager
 * */
module.exports = {
  quotasGET: _quotasGET,
  quotasQuotaGET: _quotasIdGET
};

/**
 * Get all quotas.
 * @param {Object} args {agreement: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:quotas.quotasGET
 * */
async function _quotasGET (req, res) {
  logger.info('New request to GET quotas');
  const { agreementId } = req.params;

  try{
    const quotas = await stateManager({
      id: agreementId
    });
    quotas.get('quotas', function (quotas) {
      res.json(quotas);
    }, function (err) {
      logger.error(err.message.toString());
      res.status(err.code || 500).json({ error: err.message });
    });
  } catch (err) {
    logger.error(err.message.toString());
    res.status(err.code || 500).json({ error: err.message });
  }
}

/**
 * Get quotas by ID.
 * @param {Object} args {agreement: String, quota: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:quotas.quotasQuotaGET
 * */
async function _quotasIdGET (req, res) {
  logger.info('New request to GET quota');
  const { agreementId, quotaId } = req.params;

  if(!quotaId || typeof quotaId !== 'string' || quotaId.trim() === ''){
    return res.status(400).json({ error: 'Invalid quotaId' });
  }
  try{
    const quotas = await stateManager({
      id: agreementId
    });
    quotas.get('quotas', {
      id: quotaId
    }, function (quota) {
      res.json(quota);
    }, function (err) {
      logger.error(err.message.toString());
      return res.status(err.code).json({ error: err.message });
    });
  } catch (err) {
    logger.error(err.message.toString());
    return res.status(err.code || 500).json({ error: err.message });
  }
}
