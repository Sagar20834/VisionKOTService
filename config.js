const localIP=require('./ipadd')


var config={};

config.web={};
config.db={};
config.db.options={};
config.common={};
config.db.print={};





//web config no need to change this
config.web.port=3000;
config.web.host='localhost';

//database config 
config.db.server=localIP;
config.db.userName='SA';
config.db.password='123';

config.db.database='BT805001';
config.db.options={
	instanceName:''//if no instance the put blank
};

//common config
//need to insert userID else is fetched using it
config.common.UserID=2;

config.db.user=config.db.userName;
config.db.options.database=config.db.database;
config.db.print.server=config.db.server + "\\" +config.db.options.instanceName;

module.exports=config;