/*!
governify-registry 3.0.1, built on: 2018-04-18
Copyright (C) 2017 ISA Group
http://www.isa.us.es/
http://registry.governify.io/

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

/**
 * Registry module.
 * @module registry
 * @requires express
 * @requires config
 * @requires database
 * @requires swagger
 * @requires middlewares
 * */
module.exports = {
  deploy: _deploy
};

/**
 * statesAgreementGET.
 * @param {Object} configurations configuration object
 * @param {function} callback callback function
 * @alias module:registry.deploy
 * */
function _deploy(configurations, expressMiddlewares, callback) {
  const governify = require('governify-commons');
  const config = governify.configurator.getConfig('main');

  // Elastic APM initialization can remain if telemetry is used
  //eslint-disable-next-line no-unused-vars
  const apm = require('elastic-apm-node').start({
    serviceName: 'Registry',
    serviceNodeName: 'Registry',
    captureBody: 'all',
    transactionMaxSpans: -1,
    usePathAsTransactionName: true,
    abortedErrorThreshold: 0,
    distributedTracingOrigins: ['*'],
    active: config.telemetry.enabled,
  });

  const express = require('express');
  const helmet = require('helmet');
  const compression = require('compression');
  const fs = require('fs');
  const path = require('path');
  const swaggerUi = require('swagger-ui-express');

  const logger = governify.getLogger().tag('deploy');
  const db = require('./src/database');
  const middlewares = require('./src/utils').middlewares;

  const app = express();
  const frontendPath = path.join(__dirname, '/public');
  const serverPort = process.env.PORT || config.server.port;
  const CURRENT_API_VERSION = config.server.apiVersion;
  const swaggerUtils = require('./src/utils').swagger;

  const API_PREFIX = process.env.API_PREFIX || '/api/v6';
  const agreementRegistry = require('./src/controllers/v6/AgreementRegistry.js');
  const setUpAccountableRegistry = require('./src/controllers/v6/AccountableRegistry.js');
  const billRegistry = require('./src/controllers/v6/BillRegistry.js');
  const stateRegistry = require('./src/controllers/v6/StateRegistry.js');
  const templateRegistry = require('./src/controllers/v6/TemplateRegistry.js');

  // Serve static files
  app.use(express.static(frontendPath));

  // Middleware setup
  app.use(compression());
  
  // Use built-in Express JSON parsing with more modern options
  app.use(express.json({ 
    limit: config.server.bodySize,
    strict: true // Ensures only objects and arrays are parsed
  }));
  app.use(express.urlencoded({ 
    limit: config.server.bodySize, 
    extended: true 
  }));

  // Simplified CORS handling
  if (config.server.bypassCORS) {
    const cors = require('cors');
    logger.info('Adding CORS middleware.');
    app.use(cors());
  }

  // HTTP OPTIONS handling can be simplified
  if (config.server.httpOptionsOK) {
    app.options('/*', (req, res) => {
      logger.info('Bypassing 405 status for undefined request handlers');
      res.sendStatus(200);
    });
  }

  // Package info endpoint
  if (config.server.servePackageInfo) {
    app.get('/api/info', (req, res) => {
      logger.debug("Serving package.json at '/api/info'");
      res.json(require('./package.json'));
    });
  }

  // app.use(`${API_PREFIX}/states/:agreement`, middlewares.stateInProgress);

  // Redirects
  app.get('/api/latest/docs', (req, res) => {
    res.redirect(`/api/v${CURRENT_API_VERSION}/docs`);
  });

  app.get('/api/latest/api-docs', (req, res) => {
    res.data = {
      info: {
        apiversion: CURRENT_API_VERSION
      }
    };
    res.redirect(`/api/v${CURRENT_API_VERSION}/api-docs`);
  });

  // Heap stats can use newer V8 methods
  app.get('/heapStats', (req, res) => {
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    const roundedHeapStats = Object.fromEntries(
      Object.entries(heapStats).map(([key, value]) => [
        key, Math.round((value / 1024 / 1024) * 1000) / 1000
      ])
    );
    roundedHeapStats.units = 'MB';
    res.json(roundedHeapStats);
  });

  // Apply additional middlewares
  for (const middleware of expressMiddlewares) {
    if (middleware) app.use(middleware);
  }

  logger.info('Trying to deploy server');

  // Configuration handling
  if (configurations) {
    logger.info('Reading configuration...');
    Object.entries(configurations).forEach(([key, value]) => {
      logger.info(`Setting property ${key} with value ${value}`);
      config.setProperty(key, value);
    });
  }

  // Database connection and server setup
  db.connect((err) => {
    if (err) {
      logger.error('Database connection failed', err);
      process.exit(1);
      return;
    }
  
    logger.info('Initializing app after db connection');

    // app.use(`${API_PREFIX}/agreements`, agreementRegistry);

    app.use(`${API_PREFIX}/setUpAccountableRegistry`, setUpAccountableRegistry);

    app.use(`${API_PREFIX}/bills`, billRegistry);

    // // app.use(`${API_PREFIX}/states`, middlewares.stateInProgress, stateRegistry);
    // app.use(`${API_PREFIX}/states`, stateRegistry);

    // app.use(`${API_PREFIX}/templates`, templateRegistry);
  
    // Serve Swagger UI
    const swaggerDocument =  swaggerUtils.getSwaggerDoc(CURRENT_API_VERSION);

    // Serve Swagger UI with explicit configuration
    app.use(`/api/v${CURRENT_API_VERSION}/docs`, 
      swaggerUi.serve, 
      swaggerUi.setup(swaggerDocument)
    );

    app.use(`/api/v${CURRENT_API_VERSION}/api-docs`, (req, res) => {
      res.json(swaggerDocument);
    });

    if (config.server.useHelmet) {
      logger.info('Adding Helmet related headers.');
      app.use(helmet());
    }
  
    const serverOptions = {
      port: serverPort,
      host: '0.0.0.0'
    };

    const createServer = process.env.HTTPS_SERVER === 'true' || config.server.listenOnHttps
      ? require('https').createServer.bind(null, {
        key: fs.readFileSync('certs/privkey.pem'),
        cert: fs.readFileSync('certs/cert.pem'),
      }, app)
      : require('http').createServer.bind(null, app);

    const server = createServer().listen(serverOptions, () => {
      logger.info(`Server listening on port ${serverPort} (${config.server.listenOnHttps ? 'https' : 'http'}://localhost:${serverPort})`);
      logger.info(`Swagger UI and API docs served in ${API_PREFIX}/docs and ${API_PREFIX}/api-docs`);
      if (callback) callback(server);
    });
  });  
}