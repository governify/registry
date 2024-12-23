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

const express = require('express');
const router = express.Router();
const states = require('../../controllers/v6/states/states.js');
const overrides = require('../../controllers/v6/overrides/overrides.js');
const middlewares = require('../../utils').middlewares;

// State Middleware
router.use(middlewares.stateInProgress);

// Agreements
router.delete('/', states.agreements.statesDELETE);
router.get('/:agreementId', states.agreements.agreementIdGET);
router.delete('/:agreementId', states.agreements.agreementIdDELETE);
router.get('/:agreementId/filtered', states.agreements.statesFilter);
router.delete('/:agreementId/overrides', overrides.statesAgreementOverridesDELETE);

// Agreements Guarantees
router.get('/:agreementId/guarantees', states.guarantees.guaranteesGET); // TODO: Test positives
router.get('/:agreementId/guarantees/:guaranteeId', states.guarantees.guaranteeIdGET); // TODO: Test positives
router.get('/:agreementId/guarantees/:guaranteeId/overrides', overrides.statesAgreementGuaranteesGuaranteeOverridesGET);
router.post('/:agreementId/guarantees/:guaranteeId/overrides', overrides.statesAgreementGuaranteesGuaranteeOverridesPOST);
router.delete('/:agreementId/guarantees/:guaranteeId/overrides', overrides.statesAgreementGuaranteesGuaranteeOverridesDELETE);

// Agreements Metrics
router.get('/:agreementId/metrics', states.metrics.metricsGET);
router.get('/:agreementId/metrics/:metricId', states.metrics.metricsIdGET);
router.post('/:agreementId/metrics/:metricId', states.metrics.metricsIdPOST);
router.post('/:agreementId/metrics/:metricId/increase', states.metrics.metricsIdIncrease);

// Agreements Pricing Billing Penalties
router.get('/:agreementId/pricing/billing/penalties', states.pricing.PricingBillingPenaltiesGET);

// Agreements Quotas
router.get('/:agreementId/quotas', states.quotas.quotasGET);
router.get('/:agreementId/quotas/:quotaId', states.quotas.quotasQuotaGET);

// Agreements Rates
router.get('/:agreementId/rates', states.rates.ratesGET);
router.get('/:agreementId/rates/:rateId', states.rates.ratesRateGET);

module.exports = router;
