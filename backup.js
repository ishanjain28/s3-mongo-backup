const {utils, checkConfig, currentTime} = require('./utils'),
  fs = require('fs'),
  path = require('path'),
  moment = require('moment'),
  AWS = require('aws-sdk'),

  lowdb = require('lowdb'),

  // var config = {   "mongodb": {     "host": "",     "name": ""   },   "s3": {
  // access: "",     secret: "",     region: "",     bucketName: "", "accessPerm":
  // ""   },   backupMeta: {     "timezoneOffset": "-330", "backupDir": ".",
  // persistentRecord: false   } } Intialises Everything!

  function init(config) {
    // logTime used to print currentTime before logs
    const logTime = (TIME) => `[${TIME}]:`,
      // store result of checkConfig in isValidConfig
      isValidConfig = checkConfig(config),
      isLoggingEnabled = false;

    // Check if config is valid, If it is not valid, QUIT!
    if (!isValidConfig) {
      return console.error(`${currentTime(timezoneOffset)} Invalid Config Provided! Exiting!`);
    }

    let {name, host} = config.mongodb;
    let {access, secret, region, accessPerm, bucketName} = config.s3;
    let {backupDir, timezoneOffset, persistentRecord} = config.backupMeta,
      db = lowdb(),
      bucketProps = {
        Bucket: bucketName,
        ACL: accessPerm || "private",
        CreateBucketConfiguration: {
          LocationConstraint: region
        }
      }
    // If persistentRecord is true,then create a persistentStore to store backup
    // informations
    if (persistentRecord) {
      db = lowdb(path.resolve('./backupRecords.json'))
    }
    // Store Some default values in db
    db
      .defaults({S3_STORE: []})
      .write()

    // Intialises AWS
    AWS
      .config
      .update({accessKeyId: access, secretAccessKey: secret, region: region});

    // Create a new S3 Instance
    const S3 = new AWS.S3()

  }
  // Export Init Function
  module.exports = {
    "mongoBackup": init
  }

init({
  "mongodb": {
    "host": "localhost",
    "name": "freecodecamp"
  },
  "s3": {
    access: "asdasdasd",
    secret: "asdasda",
    region: "us-west-2",
    bucketName: "fintrig",
    "accessPerm": "private"
  },
  backupMeta: {
    "timezoneOffset": "-330",
    "backupDir": ".",
    persistentRecord: false
  }
});