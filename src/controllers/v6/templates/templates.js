'use strict';

const governify = require('governify-commons');
const logger = governify.getLogger().tag('template-manager');
const $RefParser = require('json-schema-ref-parser');
const db = require('../../../database');
const ErrorModel = require('../../../errors/index.js').errorModel;

module.exports = {
  templatesPOST: _templatesPOST,
  templatesGET: _templatesGET,
  templateIdGET: _templateIdGET,
  templateIdDELETE: _templateIdDELETE,
};

async function _templatesPOST(req, res) {
  try {
    const schema = await $RefParser.dereference(req.body.template);
    const template = new db.models.TemplateModel(schema);

    const idPattern = /^(.*)-v(\d+)-(\d+)-(\d+)(-clone)?$/;
    const exampleId = 'my-string-example-v0-002-012';
    const requestId = schema.id;

    if (!idPattern.test(requestId)) {
      return res.status(400).json({
        error: 'Bad formed id',
        'required pattern': idPattern.toString(),
        'your id': requestId,
        example: exampleId,
      });
    }

    if (schema.type !== 'template') {
      return res.status(400).json(new ErrorModel(400, "Template must have: 'type':'template'"));
    }

    const data = await template.save();
    logger.info('New template template saved successfully!');
    res.status(200).json(data);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

async function _templatesGET(req, res) {
  try {
    logger.info('New request to GET templates templates/templates.js');
    const TemplateModel = db.models.TemplateModel;
    let regExp = /.*/;

    if (req.query.id) {
      logger.info('search by id', req.query.id);
      regExp = new RegExp(req.query.id.replace(/\*/g, '.*'));
    }

    const templates = await TemplateModel.find({ id: regExp });
    logger.info('Templates returned');
    res.status(200).json(templates);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

async function _templateIdGET(req, res) {
  try {
    const templateId = req.params.templateId;
    logger.info('New request to GET template with id = ' + templateId);
    const TemplateModel = db.models.TemplateModel;

    const template = await TemplateModel.findOne({ id: templateId });

    if (!template) {
      logger.warn('There is no template with id: ' + templateId);
      return res.status(404).json(new ErrorModel(404, 'There is no template with id: ' + templateId));
    }

    logger.info('Template returned');
    res.status(200).json(template);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}

async function _templateIdDELETE(req, res) {
  try {
    const templateId = req.params.templateId;
    logger.info('New request to DELETE template with id = ' + templateId);

    if (!templateId) {
      logger.warn("Can't delete template without id");
      return res.status(400).send("Can't delete template without id");
    }

    const TemplateModel = db.models.TemplateModel;
    const result = await TemplateModel.deleteOne({ id: templateId });

    if (result.deletedCount === 0) {
      logger.warn("Can't delete template with id " + templateId);
      return res.status(404).send("Can't delete template with id " + templateId);
    }

    logger.info('Deleted template with id ' + templateId);
    res.sendStatus(204);
  } catch (err) {
    logger.error(err.toString());
    res.status(500).json(new ErrorModel(500, err));
  }
}
