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
const config = governify.configurator.getConfig('main');
const logger = governify.getLogger().tag('db-manager');

const jsyaml = require('js-yaml');
const fs = require('fs');
const mongoose = require('mongoose');
const $RefParser = require('@apidevtools/json-schema-ref-parser');
const nodeEnv= process.env.NODE_ENV;
const memoryDB = getMemoryDB(nodeEnv);

/**
 * Database module.
 * @module database
 * @requires config
 * @requires js-yaml
 * @requires fs
 * @requires mongoose
 * @requires json-schema-ref-parser
 * */
module.exports = {
  db: null,
  models: null,
  connect: _connect,
  close: _close
};

/**
 * Create a new database connection.
 * @param {callback} callback callback connect function
 * @alias module:database.connect
 * */
function _connect(callback) {
  const instance = this;
  let databaseFullURL;
  if(process.env.NODE_ENV === 'production') {
    databaseFullURL = governify.infrastructure.getServiceURL('internal.database.mongo-registry') + '/' + config.database.name;
  } else if (process.env.NODE_ENV === 'ci'){
    logger.info('Using in-memory database for CI environment');
    memoryDB.connect();
    logger.info('In-memory MongoDB connected');
    if (callback) callback();
    return;
  } else {
    databaseFullURL = 'mongodb://' + process.env.MONGOADMIN + ':'+ process.env.MONGOPASS + '@' + config.database.host + ':' + config.database.port + '/' + config.database.name + '?authSource=admin';
  }
  logger.info('Connecting to ' + databaseFullURL);

  mongoose.Promise = global.Promise;
  mongoose.connect(databaseFullURL)
    .then(() => {
      const db = mongoose.connection;
      logger.info('Connected to db!');
      instance.db = db;

      if (!instance.models) {
        instance.models = {};
        try {
          setupModel(instance, config.models.template.name, config.models.template.path, config.models.template.indexableParams);
          setupModel(instance, config.models.agreement.name, config.models.agreement.path);
          setupModel(instance, config.models.state.name, config.models.state.path);
          setupModel(instance, config.models.overrides.name, config.models.overrides.path);
          setupModel(instance, config.models.bills.name, config.models.bills.path);
        } catch (error) {
          logger.error('Error setting the /models files with /configuration files:', error);
          if (callback) {
            callback(error);
          }
          return;
        }
      }

      if (callback) {
        callback();
      }
    })
    .catch(err => {
      logger.error('Database connection error:', err);
      if (callback) {
        callback(err);
      }
    });
}

/**
 * Close an existing database connection.
 * @param {callback} done callback function when connection closes
 * @alias module:db.close
 * */
function _close (done) {
  const instance = this;
  if (this.db) {
    this.db.close(function (err) {
      instance.db = null;
      done(err);
    });
  }
}

/**
 * Create Mongo schema from JSON schema.
 * @param {Object} instance instance
 * @param {String} modelName model name
 * @param {String} jsonModelUri model URI
 * */
function setupModel (instance, modelName, jsonModelUri,indexableParams) {
  const referencedJsonModel = jsyaml.load(fs.readFileSync(jsonModelUri));
  $RefParser.dereference(referencedJsonModel, function (err, dereferencedJsonModel) {
    if (err) {
      logger.info('dereference error in setupModel: ' + err);
    }
    const mongooseSchema = new mongoose.Schema(dereferencedJsonModel, {
      minimize: false
    });
    if(indexableParams){
      mongooseSchema.index(indexableParams, { unique: true });
    }
    const mongooseModel = mongoose.model(modelName, mongooseSchema);
    instance.models[modelName] = mongooseModel;
  });
}


function getMemoryDB(env) {
  if (env === 'ci') {
    return require('./MemoryServer');
  }
  return null;
}