const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const governify = require('governify-commons');
const logger = governify.getLogger().tag('db-manager');

let mongoServer;

const connect = async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    logger.info(`MongoDB connected to ${uri}`);
  } catch (error) {
    logger.error('Error while connecting to MongoDB en memoria:', error);
    throw error; 
  }
};

const closeDatabase = async () => {
  try {
    if (mongoose.connection.readyState) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      await mongoServer?.stop();
      logger.info('MongoDB disconnected');
    }
  } catch (error) {
    logger.error('Error while disconnecting MongoDB en memoria:', error);
  }
};

const clearDatabase = async () => {
  try {
    const collections = mongoose.connection.collections;
    await Promise.all(
      Object.values(collections).map(async (collection) => {
        await collection.deleteMany();
      }),
    );
    logger.info('MongoDB collections cleared');
  } catch (error) {
    logger.error('Error while clearing MongoDB collections en memoria:', error);
  }
};

module.exports = {
  connect,
  closeDatabase,
  clearDatabase,
};
