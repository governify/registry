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

const agreements = require('./agreements/agreements.js');

/**
 * Registry agreement module.
 * @module AgreementRegistry
 * @see module:AgreementRegistryService
 * @see module:agreements
 * @requires AgreementRegistryService
 * */
module.exports = {

  agreementsGET: _agreementsGET,
  agreementsDELETE: _agreementsDELETE,
  agreementsPOST: _agreementsPOST,

  agreementsAgreementGET: _agreementsAgreementGET,
  agreementsAgreementDELETE: _agreementsAgreementDELETE,
  agreementsAgreementPUT: _agreementsAgreementPUT,

  agreementsAgreementTermsGuaranteesGET: _agreementsAgreementTermsGuaranteesGET,
  agreementsAgreementTermsGuaranteesGuaranteeGET: _agreementsAgreementTermsGuaranteesGuaranteeGET

};

/**
 * agreementsAgreementTermsGuaranteesGuaranteeGET.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsAgreementTermsGuaranteesGuaranteeGET
 * */
function _agreementsAgreementTermsGuaranteesGuaranteeGET (req, res, next) {
  agreements.agreementsAgreementTermsGuaranteesGuaranteeGET(req.swagger.params, res, next);
}

/**
 * agreementsAgreementTermsGuaranteesGET.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsAgreementTermsGuaranteesGET
 * */
function _agreementsAgreementTermsGuaranteesGET (req, res, next) {
  agreements.agreementsAgreementTermsGuaranteesGET(req.swagger.params, res, next);
}

/**
 * agreementsIdDELETE.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsIdDELETE
 * */
function _agreementsAgreementDELETE (req, res, next) {
  agreements.agreementIdDELETE(req.swagger.params, res, next);
}

/**
 * agreementsIdGET.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsIdGET
 * */
function _agreementsAgreementGET (req, res, next) {
  agreements.agreementIdGET(req.swagger.params, res, next);
}

function _agreementsAgreementPUT (req, res, next) {
  agreements.agreementsAgreementPUT(req.swagger.params, res, next);
}

/**
 * agreementsGET.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsGET
 * */
function _agreementsGET (req, res, next) {
  agreements.agreementsGET(req.swagger.params, res, next);
}

/**
 * agreementsDELETE.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsDELETE
 * */
function _agreementsDELETE (req, res, next) {
  agreements.agreementsDELETE(req.swagger.params, res, next);
}

/**
 * agreementsPOST.
 * @param {Object} req request
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:AgreementRegistry.agreementsPOST
 * */
function _agreementsPOST (req, res, next) {
  agreements.agreementsPOST(req.swagger.params, res, next);
}
