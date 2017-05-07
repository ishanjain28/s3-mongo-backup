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

// S3 Utils Used to check if provided bucket exists If it does not exists then
// it can create one, and then use it.  Also used to upload File
function ListBuckets(S3, config) {
  const {bucketName} = config.s3;

  return new Promise((resolve, reject) => {
    S3.listBuckets((err, data) => {
      if (err) {
        reject({error: 1, message: err})
      } else {
        let doesBucketExists = data
          .Buckets
          .find(a => a.Name === bucketName);

        if (!doesBucketExists) {
          resolve({error: 0, message: "Bucket Does not exists", code: "BENOENT"})
        } else {
          resolve({error: 0, message: "Bucket Exists, Proceed!", code: "OK"})
        }
      }
    });
  });
}

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
        reject({error: 1, message: err.message})
      } else {
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
        reject({error: 1, message: err.message})
      }
      if (data) {
        resolve({error: 0, message: "Upload Successfull", data: data})
      }
    });
  });
}

function UploadBackup(config, backupResult) {
  // Make S3 instance from provided Configuration
  let s3 = AWSSetup(config)

  // List all available Buckets, to see if the provided in `bucketName` Exists
  return ListBuckets(s3, config).then(resolvedListBuckets => {

    if (resolvedListBuckets.code === "BENOENT") {
      // If it does not exists, Create a bucket
      return CreateBucket(s3, config).then(resolvedCreateBucket => {
        // Bucket Created Successfully, Start Uploading
        return UploadFileToS3(s3, backupResult.zipName, config.s3.bucketName);
      }, createBucketReject => {
        return Promise.reject(createBucketReject)
      });
    } else {
      // Bucket Already Exists, Start Uploading File
      return UploadFileToS3(s3, backupResult.zipName, config.s3.bucketName);
    }
  }, ListBucketReject => {
    return Promise.reject(ListBucketReject)
  });
}

function CreateBackup(config) {
  // Backup Mongo Database
  return BackupMongoDatabase(config.timezoneOffset, config).then(result => {
    // Create a zip
    return CreateZIP(result.backupFolderName).then(successResult => {
      // Delete the folder in which database was stored, because we only need zip
      return DeleteBackupFolder(successResult.folderName).then(onResolve => {
        return Promise.resolve({
          error: 0,
          message: "Successfully Zipped Database Backup",
          zipName: onResolve.folderName + ".zip"
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

module.exports = {
  CreateBackupZIP: CreateBackup,
  BackupAndUpload: BackupAndUpload
}