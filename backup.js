const path = require('path'),
    fs = require('fs'),
    exec = require('child_process').exec,
    moment = require('moment'),
    AWS = require('aws-sdk'),
    os = require('os');

let BACKUP_PATH = (ZIP_NAME) => path.resolve(os.tmpdir(), ZIP_NAME);

// Checks provided Configuration, Rejects if important keys from config are
// missing
function ValidateConfig(config) {
    if (config && config.mongodb && config.mongodb.host && config.mongodb.name && config.s3 && config.s3.accessKey && config.s3.secretKey && config.s3.region && config.s3.bucketName) {


        if (config.keepLocalBackups) {
            fs.mkdir(path.resolve(__dirname, config.mongodb.name), err => {

                if (err) {
                    // Do nothing
                }

            });
            BACKUP_PATH = (ZIP_NAME) => path.resolve(__dirname, config.mongodb.name, ZIP_NAME);
        }
        return true;
    }
    return false;
}

function AWSSetup(config) {

    AWS
        .config
        .update({
            accessKeyId: config.s3.accessKey,
            secretAccessKey: config.s3.secretKey,
            region: config.s3.region
        });

    let s3 = new AWS.S3();

    return s3;
}

// Gets current time If Timezoneoffset is provided, then it'll get time in that
// time zone If no timezone is provided, then it gives UTC Time
function currentTime(timezoneOffset) {
    if (timezoneOffset) {
        return moment(moment(moment.now()).utcOffset(timezoneOffset, true).toDate()).format("YYYY-MM-DDTHH-mm-ss");
    } else {
        return moment
            .utc()
            .format('YYYY-MM-DDTHH-mm-ss');
    }
}

function BackupMongoDatabase(config) {

    // Backups are stored in .tmp directory in Project root
    fs.mkdir(path.resolve(".tmp"), (err) => {
        if (err && err.code != "EEXIST") {
            return Promise.reject(err);
        }
    });

    return new Promise((resolve, reject) => {

        const {
            host,
            name
        } = config.mongodb;
        const {
            timezoneOffset
        } = config;
        let DB_BACKUP_NAME = `${name}_${currentTime(timezoneOffset)}.gz`;

        // Default command, does not considers username or password
        let command = `mongodump -h ${host} -d ${name} --gzip --archive=${BACKUP_PATH(DB_BACKUP_NAME)}`;

        // When Username and password is provided
        if (config.mongodb.username && config.mongodb.password) {
            command = `mongodump -h ${host} -d ${name} -p ${config.mongodb.password} -u ${config.mongodb.username} --gzip --archive=${BACKUP_PATH(DB_BACKUP_NAME)}`;
        }
        // When Username is provided
        if (config.mongodb.username && !config.mongodb.password) {
            command = `mongodump -h ${host} -d ${name} -u ${config.mongodb.username} --gzip --archive=${BACKUP_PATH(DB_BACKUP_NAME)}`;
        }

        exec(command, (err, stdout, stderr) => {
            if (err) {
                // This error is dangerous, So If this happened, Just QUIT!
                reject({
                    error: 1,
                    message: err.message
                });
            } else {
                resolve({
                    error: 0,
                    message: "Successfully Created Backup",
                    backupName: DB_BACKUP_NAME
                });
            }
        });
    });
}

function DeleteLocalBackup(ZIP_NAME) {

    return new Promise((resolve, reject) => {
        fs.unlink(BACKUP_PATH(ZIP_NAME), (err) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    error: 0,
                    message: "Deleted Local backup",
                    zipName: ZIP_NAME
                });
            }
        });
    });
}

// S3 Utils Used to check if provided bucket exists If it does not exists then
// it can create one, and then use it.  Also used to upload File
function CreateBucket(S3, config) {
    const {
        bucketName,
        accessPerm,
        region
    } = config.s3;

    return new Promise((resolve, reject) => {
        S3.createBucket({
            Bucket: bucketName,
            ACL: accessPerm || "private",
            CreateBucketConfiguration: {
                LocationConstraint: region
            }
        }, (err, data) => {
            if (err) {
                reject({
                    error: 1,
                    message: err.message,
                    code: err.code
                });
            } else {
                resolve({
                    error: 0,
                    url: data.Location,
                    message: 'Sucessfully created Bucket'
                });
            }
        });
    });
}

function UploadFileToS3(S3, ZIP_NAME, config) {
    return new Promise((resolve, reject) => {
        let fileStream = fs.createReadStream(BACKUP_PATH(ZIP_NAME));

        fileStream.on('error', err => {
            return reject({
                error: 1,
                message: err.message
            });
        });

        let uploadParams = {
            Bucket: config.s3.bucketName,
            Key: ZIP_NAME,
            Body: fileStream
        };

        S3.upload(uploadParams, (err, data) => {
            if (err) {
                return reject({
                    error: 1,
                    message: err.message,
                    code: err.code
                });
            }

            if (!config.keepLocalBackups) {
                DeleteLocalBackup(ZIP_NAME).then(deleteLocalBackupResult => {
                    resolve({
                        error: 0,
                        message: "Upload Successfull, Deleted Local Copy of Backup",
                        data: data
                    });
                }, deleteLocalBackupError => {
                    resolve({
                        error: 1,
                        message: deleteLocalBackupError,
                        data: data
                    });
                });
            } else {
                resolve({
                    error: 0,
                    message: "Upload Successfull",
                    data: data
                });
            }
        });
    });
}

function UploadBackup(config, backupResult) {
    let s3 = AWSSetup(config);

    return UploadFileToS3(s3, backupResult.zipName, config).then(uploadFileResult => {
        return Promise.resolve(uploadFileResult);
    }, uploadFileError => {
        if (uploadFileError.code === "NoSuchBucket") {
            // Bucket Does not exists, So Create one, And Reattempt to Upload
            return CreateBucket(s3, config).then((createBucketResolved => {
                return UploadFileToS3(s3, backupResult.zipName, config).then(uploadFileResult => {
                    return Promise.resolve(uploadFileResult);
                }, uploadFileError => {
                    return Promise.reject(uploadFileError);
                });
            }, createBucketError => {
                return Promise.reject(createBucketError);
            }));
        } else {
            return Promise.reject(uploadFileError);
        }
    });
}

function CreateBackup(config) {
    // Backup Mongo Database
    return BackupMongoDatabase(config).then(result => {

        return Promise.resolve({
            error: 0,
            message: "Successfully Created Compressed Archive of Database",
            zipName: result.backupName
        });
    }, error => {
        return Promise.reject(error);
    });
}

function BackupAndUpload(config) {
    // Check if the configuration is valid
    let isValidConfig = ValidateConfig(config);

    if (isValidConfig) {
        // Create a backup of database
        return CreateBackup(config).then(backupResult => {
            // Upload it to S3
            return UploadBackup(config, backupResult).then(res => {
                return Promise.resolve(res);
            }, err => {
                return Promise.reject(err);
            });
        }, backupResult => {
            return Promise.reject(backupResult);
        });
    } else {
        return Promise.reject({
            error: 1,
            message: "Invalid Configuration"
        });
    }
}

module.exports = BackupAndUpload;