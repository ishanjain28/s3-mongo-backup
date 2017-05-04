const Admzip = require('adm-zip'),
  path = require('path'),
  zipFolder = require('zip-folder'),
  fs = require('fs'),
  rimraf = require('rimraf'),
  moment = require('moment'), {exec} = require('child_process');

let BACKUP_PATH = (ZIP_NAME) => path.resolve(`.tmp/${ZIP_NAME}`)

// Checks provided Configuration, Rejects if important keys from config are
// missing
function ValidateConfig(config) {
  if (config && config.mongodb && config.mongodb.host && config.mongodb.name && config.s3.access && config.s3.secret && config.s3.region && config.s3.accessPerm && config.s3.bucketName) {
    return true;
  }
  return false;
}

// Gets current time If Timezoneoffset is provided, then it'll get time in that
// time zone If no timezone is provided, then it gives UTC Time
function currentTime(timezoneOffset) {
  if (timezoneOffset) {
    return moment(moment(moment.now()).utcOffset(timezoneOffset, true).toDate()).format("YYYY-MM-DDTHH:mm:ss")
  } else {
    return moment
      .utc()
      .format('YYYY-MM-DDTHH:mm:ss');
  }
}

function BackupMongoDatabase(timezoneOffset, config) {
  return new Promise((resolve, reject) => {
    let CURRENT_TIME = currentTime(timezoneOffset)

    const {host, name} = config.mongodb
    // Default command, does not considers username or password
    let command = `mongodump -h ${host} -d ${name} -o ${BACKUP_PATH(CURRENT_TIME)}`

    // When Username and password is provided
    if (config.mongodb.username && config.mongodb.password) {
      command = `mongodump -h ${host} -d ${name} -p ${config.mongodb.password} -u ${config.mongodb.username} -o ${BACKUP_PATH(CURRENT_TIME)}`
    }
    // When Username is provided
    if (config.mongodb.username && !config.mongodb.password) {
      command = `mongodump -h ${host} -d ${name} -u ${config.mongodb.username} -o ${BACKUP_PATH(CURRENT_TIME)}`
    }

    exec(command, (err, stdout, stderr) => {
      if (err) {
        // This error is dangerous, So If this happened, Just QUIT!
        reject({error: 1, message: err.message})
      } else {
        resolve({error: 0, message: "Created Backup Successfully", backupFolderName: CURRENT_TIME})
      }
    })
  })
}

function CreateZIP(ZIP_NAME) {

  return new Promise((resolve, reject) => {
    zipFolder(BACKUP_PATH(ZIP_NAME), BACKUP_PATH(ZIP_NAME + ".zip"), err => {
      if (err) {
        reject({error: 1, message: e})
      } else {
        resolve({
          error: 0,
          message: "Successfully Zipped Database Backup",
          zipName: ZIP_NAME + ".zip",
          folderName: ZIP_NAME
        })
      }
    })
  })
}

function DeleteBackupFolder(ZIP_NAME) {
  return new Promise((resolve, reject) => {
    rimraf(BACKUP_PATH(ZIP_NAME), (err) => {
      if (err) {
        reject({error: 1, message: err.message})
      } else {
        resolve({error: 0, message: `Deleted ${ZIP_NAME}`, folderName: ZIP_NAME})
      }
    })
  })
}

function CreateBackup() {
  return BackupMongoDatabase(null, {
    mongodb: {
      host: "localhost",
      "name": "zion17"
    }
  }).then(result => {
    return CreateZIP(result.backupFolderName).then(successResult => {
      return DeleteBackupFolder(successResult.folderName).then(onResolve => {
        return {error: 0, message: "Successfully Zipped Database Backup", folderName: onResolve.folderName}
        // console.log(onResolve);
      }, error => {
        return error
      })
    }, error => {
      return error
    })
  }, error => {
    return error
  })
}

module.exports = {
  CreateBackupZIP: CreateBackup
}