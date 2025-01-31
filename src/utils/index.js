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

const diff = require('deep-diff');
/**
 * Utils module.
 * @module utils
 * @requires deep-diff
 * */

module.exports = {
  /**
     * Errors module.
     * @see module:utils.errors
     * */
  errors: require('./errors.js'),
  /**
     * Scopes module.
     * @see module:utils.scopes
     * */
  scopes: require('./scopes.js'),
  /**
     * @class Query Class.
     * @see module:utils.query
     * */
  Query: require('./query.js'),
  /**
     * Validator module.
     * @see module:utils.validators
     * */
  validators: require('./validators.js'),
  /**
     * Swagger module.
     * @see module:utils.timeAndPeriod
     * */
  time: require('./timeAndPeriod.js'),
  /**
     * Swagger module.
     * @see module:utils.promise
     * */
  promise: require('./promise.js'),
  /**
     * Swagger module.
     * @see module:utils.stream
     * */
  stream: require('./stream.js'),
  /**
     * Swagger module.
     * @see module:utils.swagger
     * */
  swagger: require('./swagger.js'),
  /**
     * middlewares module.
     * @see module:utils.middlewares
     * */
  middlewares: require('./middlewares.js'),
  containsObject: _containsObject,
  context: require('./context.js'),

};

/**
 * Check if an array contains a given object
 * @param {Object} obj object to search for
 * @param {array} array array to search into
 * @alias module:utils.containsObject
 * */
function _containsObject (obj, array) {
  for (let i = 0; i < array.length; i++) {
    const difs = diff(array[i], obj);
    if (difs === undefined || difs === null) {
      return i;
    }
  }
  return -1;
}
