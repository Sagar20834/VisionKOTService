const databaseList = require('./databaseList');

console.log(databaseList);



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

console.log("Database connected!!")

// Create a connection pool
sql.connect(config)
  .then(function () {
    var request = new sql.Request();

    request.query("SELECT name FROM sys.databases ")
      .then(function (result) {
       
          console.log(result);

          // Extract the database names from the query result
          const databaseNames = result.recordset.map(row => row.name);

          // Convert the array to a JavaScript string
          const databaseNamesString = JSON.stringify(databaseNames, null, 2);

          // Write the JavaScript file with the database names
          fs.writeFileSync('databaseList.js', `const databaseList = ${databaseNamesString};\n\nmodule.exports = databaseList;`);

          console.log('Database list has been saved to databaseList.js');
       

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
