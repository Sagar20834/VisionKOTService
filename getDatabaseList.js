const sql = require('mssql');
const fs = require('fs');

// Database configuration
const config = {
  user: 'SA',
  password: '123',
  server: 'localhost', // Replace with your SQL Server hostname or IP address
  database: 'master', // Connect to the master database
  options: {
    encrypt: false, // Set to true if you're using SSL
  },
};

// Create a connection pool
sql.connect(config)
  .then(function () {
    var request = new sql.Request();

    request.query("SELECT name FROM sys.databases WHERE database_id > 6")
      .then(function (result, length) {
        console.log(result)
        const databaseList = result.map(row => row.name);
        fs.writeFileSync('./databaseList.json', JSON.stringify(databaseList));
        console.log("Written")
        sql.close(); // Close the connection
      })
      .catch(err => {
        console.error('Error:', err);
        sql.close(); // Close the connection in case of an error
      });
  })
  .catch(err => {
    console.error('Error:', err);
  });
