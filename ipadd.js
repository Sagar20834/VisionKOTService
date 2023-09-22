const os = require('os');

const interfaces = os.networkInterfaces();
let localIP = '';

Object.keys(interfaces).forEach(interfaceName => {
  const interfaceData = interfaces[interfaceName];
  interfaceData.forEach(interfaceEntry => {
    if (interfaceEntry.family === 'IPv4' && !interfaceEntry.internal) {
      localIP = interfaceEntry.address;
    }
  });
});

console.log("Use this IP Address for TAB Connection : "+ ' '+localIP+'\n');
module.exports =localIP;