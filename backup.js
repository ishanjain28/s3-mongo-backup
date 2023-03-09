'use strict';

const path = require('path'),
    fs = require('fs'),
    os = require('os'),
    moment = require('moment'),
    MongodbURI = require('mongodb-uri'),
    PROJECT_ROOT = process
    .mainModule
    .paths[0]
    .split("node_modules")[0];
const { S3Client, CreateBucketCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { spawn } = require('child_process');

let BACKUP_PATH = (ZIP_NAME) => path.resolve(os.tmpdir(), ZIP_NAME);

// Checks provided Configuration, Rejects if important keys from config are
// missing
function ValidateConfig(config) {
    if (config && config.mongodb && config.s3 && config.s3.accessKey && config.s3.secretKey && config.s3.region && config.s3.bucketName) {
        let mongodb;
        if (typeof config.mongodb == "string") {
            mongodb = MongodbURI.parse(config.mongodb);
        } else {
            if (config.mongodb.database && config.mongodb.host && config.mongodb.port) {

                mongodb = {
                    scheme: 'mongodb',
                    username: config.mongodb.username || null,
                    password: config.mongodb.password || null,
                    database: config.mongodb.database,
                    ssl: config.mongodb.ssl,
                    authenticationDatabase: config.mongodb.authenticationDatabase,
                    hosts: [{
                        host: config.mongodb.host,
                        port: config.mongodb.port
                    }]
                };
            } else {
                return false;
            }
        }
        if (config.keepLocalBackups) {
            fs.mkdir(path.resolve(PROJECT_ROOT, mongodb.database), err => {
                if (err) {
                    // Do nothing
                }
            });
            BACKUP_PATH = (ZIP_NAME) => path.resolve(PROJECT_ROOT, mongodb.database, ZIP_NAME);
        }

        // Replace Connection URI with parsed output from mongodb-uri
        config.mongodb = mongodb;
        return true;
    }
    return false;
}

function AWSSetup(config) {
    return new S3Client({
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
        region: config.s3.region
    });
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

        const database = config.mongodb.database,
            password = config.mongodb.password || null,
            username = config.mongodb.username || null,
            timezoneOffset = config.timezoneOffset || null,
            host = config.mongodb.hosts[0].host || null,
            port = config.mongodb.hosts[0].port || null,
            ssl = config.mongodb.ssl || null,
            authenticationDatabase = config.mongodb.authenticationDatabase || null,
            quiet = config.quiet || false;


        let DB_BACKUP_NAME = `${database}_${currentTime(timezoneOffset)}.gz`;

        let args=[
            `--host=${host}`,
            `--port=${port}`,
            `--db=${database}`,
            `--gzip`,
            `--archive="${BACKUP_PATH(DB_BACKUP_NAME)}"`];
        if (username && password) args.push(`-p "${password}"`).push(`-u ${username}`);
        if (username && !password) args.push(`-u ${username}`);
        if (ssl) args.push(`--ssl`);
        if (quiet) args.push(`--quiet`);
        if (authenticationDatabase) args.push(`--authenticationDatabase=${authenticationDatabase}`);
        // Default command, does not considers username or password
        try {

            const mongoDumpProcess = spawn('mongodump', args);


            mongoDumpProcess.on('error', (err) => {
                reject(err);
            });

            mongoDumpProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            mongoDumpProcess.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
            });

            mongoDumpProcess.on('close', (code) => {
                if (code == 0) {
                    resolve({
                        error: 0,
                        message: "Successfully Created Backup",
                        backupName: DB_BACKUP_NAME
                    });
                } else {
                // Most likely, mongodump isn't installed or isn't accessible
                    reject({
                        error: 1,
                        message: `mongodump closed with code ${code}`
                    });
                }

            });

        } catch (ex) {
            reject(ex);
        }


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

    const bucketName = config.s3.bucketName,
        accessPerm = config.s3.accessPerm,
        region = config.s3.region;

    return new Promise((resolve, reject) => {
        const commandCreate = new CreateBucketCommand({
            Bucket: bucketName,
            ACL: accessPerm || "private",
            CreateBucketConfiguration: {
                LocationConstraint: region
            }
        });
        S3.send(commandCreate, (err, data) => {
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
            Key: `mongoDbBackups/${ZIP_NAME}`,
            Body: fileStream
        };
        const commandPut = new PutObjectCommand(uploadParams);
        S3.send(commandPut, (err, data) => {
            if (err) {
                return reject({
                    error: 1,
                    message: err.message,
                    code: err.code
                });
            }

            if (!config.keepLocalBackups) {
                //  Not supposed to keep local backups, so delete the one that was just uploaded
                DeleteLocalBackup(ZIP_NAME).then(deleteLocalBackupResult => {
                    resolve({
                        error: 0,
                        message: "Upload Successful, Deleted Local Copy of Backup",
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
                // Only keep most recent "noOfLocalBackups" number of backups and delete older
                // backups

                if (config.noOfLocalBackups) {
                    let oldBackupNames = fs
                        .readdirSync(BACKUP_PATH(""))
                        .filter(dirItem => fs.lstatSync(BACKUP_PATH(dirItem)).isFile())
                        .reverse()
                        .slice(config.noOfLocalBackups);

                    oldBackupNames.forEach(fileName => {
                        fs.unlink(BACKUP_PATH(fileName), err => {
                            if (err) {
                                // Do nothing
                            }
                        });
                    });
                }

                resolve({
                    error: 0,
                    message: "Upload Successful",
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
            return CreateBucket(s3, config).then(createBucketResolved => {
                return UploadFileToS3(s3, backupResult.zipName, config).then(uploadFileResult => {
                    return Promise.resolve(uploadFileResult);
                }, uploadFileError => {
                    return Promise.reject(uploadFileError);
                });
            }, createBucketError => {
                return Promise.reject(createBucketError);
            });
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
