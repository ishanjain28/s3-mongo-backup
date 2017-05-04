const backup = require('./backup')

backup
  .CreateBackupZIP()
  .then(res => {
    console.log(res)
  }, err => {
    console.log(err)
  })