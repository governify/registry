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
const gPeriods = governify.periods;

/**
 * Utils module.
 * @module utils.promises
 * @requires config
 * */

module.exports = {
  getPeriods: _getPeriods,
  getLastPeriod: _getLastPeriod,
  periods: periods,
  convertPeriod: _convertPeriod
};

/**
 * This method returns a set of periods which are based on a window parameter.
 * @param {AgreementModel} agreement agreement model
 * @param {WindowModel} window window model
 * @return {Set} set of periods
 * @alias module:utils.getPeriods
 * */
function _getPeriods (agreement, window) {
  if (!window) {
    window = {};
  }

  const initial = new Date(window.initial ? window.initial : agreement.context.validity.initial);
  const currentDate = new Date();
  
  const periodFrom = new Date(window.from ? window.from : initial);
  const periodTo = window.end ? new Date(window.end) : new Date();
  
  const dates = gPeriods.getDates(initial, currentDate, window.period ? window.period : 'monthly', periodTo, window.rules);
  
  const wFrom = dates.filter(date => date < periodFrom).slice(-1)[0] || periodFrom;
  const wTo = dates.filter(date => date > periodTo)[0] || periodTo;
  
  // const periods = gPeriods.getPeriods(dates, agreement.context.validity.timeZone, true, wFrom, wTo);

  return [{ from: new Date(wFrom).toISOString(), to: new Date(wTo).toISOString() }]
}

/**
 * This method returns a set of periods which are based on a window parameter.
 * @param {AgreementModel} agreement agreement model
 * @param {WindowModel} window window model
 * @return {Set} set of periods
 * @alias module:utils.getLastPeriod
 * */
function _getLastPeriod (agreement, window) {
  if (!window) {
    window = {};
  }

  const from = new Date(window.initial ? window.initial : agreement.context.validity.initial);
  const to = new Date();

  const Wto = window.end ? new Date(window.end) : new Date();
  return gPeriods.getLastPeriod(from, to, window.period ? window.period : 'monthly', Wto, window.rules, agreement.context.validity.timeZone);
}

/**
 * Periods in milliseconds
 * @alias module:utils.periods
 * */
var periods = {
  secondly: 1000,
  minutely: 60000,
  hourly: 3600000,
  daily: 86400000,
  weekly: 604800000,
  monthly: 2628000000,
  quarterly: 7884000000,
  yearly: 31540000000
};

/**
 * Convert a given billing cycle into a period string
 * @param {Object} billingCycle object billing cycle to convert
 * @alias module:utils.convertPeriod
 * */
function _convertPeriod (billingCycle) {
  switch (billingCycle) {
  case 'yearly':
    return 'years';
  case 'monthly':
    return 'months';
  case 'daily':
    return 'days';
  }
}
