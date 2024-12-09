/*!
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
const logger = governify.getLogger().tag('template-manager');
const $RefParser = require('json-schema-ref-parser');
const db = require('../../../database');

const states = require('../states/states');
const { json } = require('body-parser');
const ErrorModel = require('../../../errors/index.js').errorModel;

/**
 * Registry template module.
 * @module templates
 * @see module:TemplateRegistry
 * @see module:TemplateRegistryService
 * @requires config
 * @requires database
 * @requires states
 * @requires StateRegistryService
 * @requires errors
 * @requires json-schema-ref-parser
 * @requires governify-template-manager
 * */
module.exports = {
  templatesPOST: _templatesPOST,
  // templatesDELETE: _templatesDELETE,
  templatesGET: _templatesGET,
  templateIdGET: _templateIdGET,
  templateIdDELETE: _templateIdDELETE,
};

/**
 * Post a template
 * @param {Object} args {template: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:template.templatesPOST
 * */
function _templatesPOST (args, res) {
  logger.info('New request to CREATE template');
  $RefParser.dereference(args.template.value, function (err, schema) {
    if (err) {
      logger.error(err.toString());
      res.status(500).json(new ErrorModel(500, err));
    } else {
      const template = new db.models.TemplateModel(schema);
      //check if the id follows a pattern
      const idPattern = /^(.*)-v(\d+)\-(\d+)\-(\d+)(-clone)?$/;
      const exampleId = 'my-string-example-v0-002-012';
      const requestId = schema.id
      if(!idPattern.test(requestId)){
        return res.status(400).json({'error': 'Bad formed id','required pattern':` ${idPattern.toString()}`,'your id':`${requestId}`,'example':`${exampleId}` })
      }
      //check type = "template"
      if(!(schema.type=='template')) return res.status(400).json(new ErrorModel(400, "Template must have: 'type':'template'"));
      template.save(function (err,data) {
        if (err) {
          logger.error('Mongo error saving template template: ' + err.toString());
          res.status(500).json(new ErrorModel(500, {data: err, text: err.toString()}));

        } else {
          logger.info('New template template saved successfully!');
          res.status(200).json(data)
        }
      });
    }
  });
}

// /**
//  * Delete all templates.
//  * @param {Object} args {}
//  * @param {Object} res response
//  * @param {Object} next next function
//  * @alias module:template.templatesDELETE
//  * */
// function _templatesDELETE (args, res) {
//   logger.info('New request to DELETE all templates');
//   const TemplateModel = db.models.TemplateModel;
//   TemplateModel.remove({}, function (err) {
//     if (!err) {
//       logger.info('Deleted all templates');
//       res.sendStatus(204);
//     } else {
//       res.sendStatus(404);
//       logger.warn("Can't delete all templates: " + err);
//     }
//   });
// }

/**
 * Get all templates.
 * @param {Object} args {}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:template.templatesGET
 * */
async function _templatesGET (req, res) {
  /**
     * parameters expected in the args:
     * namespace (String)
     **/
  logger.info('New request to GET templates templates/templates.js');
  const TemplateModel = db.models.TemplateModel;
  let regExp = /.*/
  if(req.query.id) {
    logger.info('search by id',req.query.id)
    regExp =  new RegExp(req.query.id.replace(/\*/g, '.*'))
  }
  TemplateModel.find({
    id: regExp
  },function (err, templates) {
    if (err) {
      logger.error(err.toString());
      res.status(500).json(new ErrorModel(500, err));
    }
    logger.info('Templates returned');
    res.status(200).json(templates);
  });
}





/**
 * Get a template by template ID.
 * @param {Object} args {template: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:template.templateIdGET
 * */
function _templateIdGET (args, res) {
  logger.info('New request to GET template with id = ' + args.templateId.value);
  const TemplateModel = db.models.TemplateModel;
  TemplateModel.findOne({
    id: args.templateId.value
  }, function (err, template) {
    if (err) {
      logger.error(err.toString());
      return res.status(500).json(new ErrorModel(500, err));
    }

    if (!template) {
      logger.warn('There is no template with id: ' + args.templateId.value);
      return res.status(404).json(new ErrorModel(404, 'There is no template with id: ' + args.templateId.value));
    }

    logger.info('template returned');
    res.status(200).json(template);
  });
}


/**
 * Delete a template by template ID.
 * @param {Object} args {template: String}
 * @param {Object} res response
 * @param {Object} next next function
 * @alias module:template.templateIdDELETE
 * */
function _templateIdDELETE (args, res) {
  logger.info('New request to DELETE template');
  const templateId = args.templateId.value;
  if (templateId) {
    const TemplateModel = db.models.TemplateModel;
    TemplateModel.remove({
      id: templateId
    }, function (err) {
      if (!err) {
        logger.info('Deleted template with id ' + templateId);
        res.sendStatus(204)
      } else {
        res.sendStatus(404);
        logger.warn("Can't delete template with id " + templateId);
      }
    });
  } else {
    res.sendStatus(400);
    logger.warn("Can't delete template with id " + templateId);
  }
}



function _isBadRegExp(string){
  try {
    const reg = new RegExp(string)
    return false;
  } catch (error) {
    return true
  }
}

