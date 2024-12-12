/*!
 * governify-registry 3.0.1, built on: 2018-04-18
 * Copyright (C) 2018 ISA group
 * http://www.isa.us.es/
 * https://github.com/isa-group/governify-registry
 *
 * governify-registry is an Open-source software available under the
 * GNU General Public License (GPL) version 2 (GPL v2) for non-profit
 * applications; for commercial licensing terms, please see README.md
 * for any inquiry.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
 
'use strict';
 
const fs = require('fs');
const jsyaml = require('js-yaml');
 
/**
  * Swagger module.
  * @module swagger
  * @see module:utils.swagger
  * @requires fs
  * @requires js-yaml
  * @requires swagger-ui-express
  * */
module.exports = {
  getRouterOption: _getRouterOption,
  getSwaggerDoc: _getSwaggerDoc,
};
 
/**
  * This method returns a SwaggerRouterOptions object configured with the version.
  * @param {Number} version The version of the options required
  * @return {Object} options The object which defines the option that is given to the Swagger router component.
  * @alias module:swagger.getRouterOption
  */
function _getRouterOption(version) {
  return {
    swaggerUi: '/swaggerV' + version + '.json',
    controllers: './src/controllers/v' + version
  };
}
 
/**
  * This method returns an object with Swagger doc information of the 'version' of the API.
  * @param {Number} version The version of the options required
  * @return {Object} swaggerDoc The object which represents the Swagger document.
  * @alias module:swagger.getSwaggerDoc
  */
function _getSwaggerDoc(version) {
  const spec = fs.readFileSync('./src/api/swaggerV' + version + '.yaml', 'utf8');
  return jsyaml.load(spec);
}
 