const path = require('path'),
  fs = require('fs'),
  exec = require('child_process').exec,
  rimraf = require('rimraf'),
  moment = require('moment'),
  zipFolder = require('zip-folder'),
  AWS = require('aws-sdk');

let BACKUP_PATH = (ZIP_NAME) => path.resolve(`.tmp/${ZIP_NAME}`)

// Checks provided Configuration, Rejects if important keys from config are
// missing
function ValidateConfig(config) {
  if (config && config.mongodb && config.mongodb.host && config.mongodb.name && config.s3 && config.s3.accessKey && config.s3.secretKey && config.s3.region && config.s3.accessPerm && config.s3.bucketName) {
    return true;
  }
  return false;
}

function AWSSetup(config) {

  AWS
    .config
    .update({accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey, region: config.s3.region})

  let s3 = new AWS.S3();

  return s3
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

function BackupMongoDatabase(config) {
  return new Promise((resolve, reject) => {

    const {host, name} = config.mongodb
    const {timezoneOffset} = config
    let DB_BACKUP_NAME = `${name}_${currentTime(timezoneOffset)}`

    // Default command, does not considers username or password
    let command = `mongodump -h ${host} -d ${name} -o ${BACKUP_PATH(DB_BACKUP_NAME)}`

    // When Username and password is provided
    if (config.mongodb.username && config.mongodb.password) {
      command = `mongodump -h ${host} -d ${name} -p ${config.mongodb.password} -u ${config.mongodb.username} -o ${BACKUP_PATH(DB_BACKUP_NAME)}`
    }
    // When Username is provided
    if (config.mongodb.username && !config.mongodb.password) {
      command = `mongodump -h ${host} -d ${name} -u ${config.mongodb.username} -o ${BACKUP_PATH(DB_BACKUP_NAME)}`
    }

    exec(command, (err, stdout, stderr) => {
      if (err) {
        // This error is dangerous, So If this happened, Just QUIT!
        reject({error: 1, message: err.message})
      } else {
        resolve({error: 0, message: "Created Backup Successfully", backupFolderName: DB_BACKUP_NAME})
      }
    })
  })
}

function CreateZIP(DB_FOLDER_NAME) {
  return new Promise((resolve, reject) => {
    zipFolder(BACKUP_PATH(DB_FOLDER_NAME), BACKUP_PATH(DB_FOLDER_NAME + ".zip"), err => {
      if (err) {
        reject({error: 1, message: e})
      } else {
        resolve({
          error: 0,
          message: "Successfully Zipped Database Backup",
          zipName: DB_FOLDER_NAME + ".zip",
          folderName: DB_FOLDER_NAME
        });
      }
    });
  });
}

function DeleteBackupFolder(DB_FOLDER_NAME) {
  return new Promise((resolve, reject) => {
    rimraf(BACKUP_PATH(DB_FOLDER_NAME), (err) => {
      if (err) {
        reject({error: 1, message: err.message})
      } else {
        resolve({error: 0, message: `Deleted ${DB_FOLDER_NAME}`, folderName: DB_FOLDER_NAME})
      }
    })
  })
}

function DeleteLocalBackup(ZIP_NAME) {

  return new Promise((resolve, reject) => {
    fs.unlink(BACKUP_PATH(ZIP_NAME), (err) => {
      if (err) {
        reject(err)
      } else {
        resolve({error: 0, message: "Deleted Local backup", zipName: zipName});
      }
    })
  })
}

// S3 Utils Used to check if provided bucket exists If it does not exists then
// it can create one, and then use it.  Also used to upload File
function CreateBucket(S3, config) {
  const {bucketName, accessPerm, region} = config.s3;

  return new Promise((resolve, reject) => {
    S3.createBucket({
      Bucket: bucketName,
      ACL: accessPerm || "private",
      CreateBucketConfiguration: {
        LocationConstraint: region
      }
    }, (err, data) => {
      if (err) {
        console.log(err)
        reject({error: 1, message: err.message, code: err.code})
      } else {
        console.log(data)
        resolve({error: 0, url: data.Location, message: 'Sucessfully created Bucket'})
      }
    })
  })
}

function UploadFileToS3(S3, ZIP_NAME, bucketName) {
  return new Promise((resolve, reject) => {
    let fileStream = fs.createReadStream(BACKUP_PATH(ZIP_NAME));

    fileStream.on('error', err => {
      return reject({error: 1, message: err.message});
    });

    let uploadParams = {
      Bucket: bucketName,
      Key: ZIP_NAME,
      Body: fileStream
    }

    S3.upload(uploadParams, (err, data) => {
      if (err) {
        reject({error: 1, message: err.message, code: err.code})
      }

      if (data) {
        if (!config.keepLocalBackups) {
          DeleteLocalBackup(backupResult.zipName).then(deleteLocalBackupResult => {
            resolve({error: 0, message: "Upload Successful, Deleted Local Copy of Backup", data: data});
          }, deleteLocalBackupError => {
            resolve({error: 1, message: deleteLocalBackupError, data: data})
          });
        } else {
          resolve({error: 0, message: "Upload Successful", data: data});
        }
      }
    });
  });
}

function UploadBackup(config, backupResult) {
  let s3 = AWSSetup(config);

  return UploadFileToS3(s3, backupResult.zipName, config.s3.bucketName).then(uploadFileResult => {
    return Promise.resolve(uploadFileResult)
  }, uploadFileError => {
    if (uploadFileError.code === "NoSuchBucket") {
      return CreateBucket(s3, config).then((createBUucketResolved => {
        return UploadFileToS3(s3, backupResult.zipName, config.s3.bucketName).then(uploadFileResult => {
          return Promise.resolve(uploadFileResult)
        }, uploadFileError => {
          return Promise.reject(uploadFileError)
        });
      }, createBucketError => {
        return Promise.reject(createBucketError);
      }))
    }
  })
}

function CreateBackup(config) {
  // Backup Mongo Database
  return BackupMongoDatabase(config).then(result => {
    // Create a zip
    return CreateZIP(result.backupFolderName).then(successResult => {
      // Delete the folder in which database was stored, because we only need zip
      return DeleteBackupFolder(successResult.folderName).then(backupFolderResult => {
        return Promise.resolve({
          error: 0,
          message: "Successfully Zipped Database Backup",
          zipName: backupFolderResult.folderName + ".zip"
        });
      }, error => {
        return Promise.reject(error)
      })
    }, error => {
      return Promise.reject(error)
    })
  }, error => {
    return Promise.reject(error)
  })
}

function BackupAndUpload(config) {
  // Check if the configuration is valid
  let isValidConfig = ValidateConfig(config)

  if (isValidConfig) {
    // Create a backup of database
    return CreateBackup(config).then(backupResult => {
      // Upload it to S3
      return UploadBackup(config, backupResult).then(res => {
        return Promise.resolve(res)
      }, err => {
        return Promise.reject(err)
      });
    }, backupResult => {
      return Promise.reject(backupResult)
    });
  } else {
    return Promise.reject({error: 1, message: "Invalid Configuration"})
  }
}

module.exports = BackupAndUpload