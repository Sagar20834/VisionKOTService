var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');

//request module to check the connection 
var request=require('request');

var Connection = require('tedious').Connection;
var edge = require('edge-js');
var sql=require('mssql');
var Request = require('tedious').Request;
var config=require('./config');
config.Server=config.db.server + "\\" + config.db.options.instanceName;

//no need to change this
config.common.UnitID=1;
config.common.FiscalYearID=1;

var fs = require("fs");
var file = "KDSData.db";
var exists = fs.existsSync(file);
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database(file);
if(!exists) {
  	db.run("CREATE TABLE StoreMessage (id TEXT,user TEXT,message TEXT);");
    console.log('Creating Database ');
}

var print=require('edge').func({
  assemblyFile:'MobilePrinting.dll',
  typeName:'MobilePrinting.PrintNew',
  methodName:'PrintOrder'
});

var printers=require('edge').func({
	assemblyFile:'MobilePrinting.dll',
	typeName:'MobilePrinting.PrinterList',
	methodName:'Printers'
});

console.log("mobileprinting "+print);
console.log("mobileprinting"+ printers);

//connection pools
var cp = new sql.Connection(config.db);
cp.connect().then(function(){
	//good to go
	//now fetch required config values from database  

	var request=new sql.Request(cp);
	request.input('UserID',sql.Int,config.common.UserID);
	request.query("DECLARE  @OutletSegmentID tinyint, @CounterSegmentID tinyint \
    ,@DefaultCashBook int,@DefaultGodown int\
    SELECT @OutletSegmentID =OutletSegmentID ,  @CounterSegmentID = CounterSegmentID \
    ,@DefaultCashBook =SYSTEMC.CBID        ,@DefaultGodown =SYSTEMC.SDefaultGodownID \
    FROM GM.TBL_SystemControl SYSTEMC \
    \
    SELECT  \
    Outlet.ID AS OutletID\
    ,CM.ID as CounterID\
    ,ISNULL(CM.CashBookID ,@DefaultCashBook) AS CashBookID\
    ,ISNULL(CM.GodownID ,@DefaultGodown) AS GodownID\
    ,CounterMaster.BillDocNumbID\
    ,CounterMaster.OrderDocNumbID\
    \
    FROM GM.Tbl_ClassMaster CM\
    LEFT OUTER JOIN  \
    (\
    SELECT ID ,Code,Name FROM GM.Tbl_ClassMaster WHERE ClassTypeID = 1\
    ) AS Outlet ON CLSID1 = Outlet.ID\
    LEFT OUTER JOIN GM.Tbl_CounterMaster CounterMaster ON CounterMaster.ClassID =CM.ID\
    WHERE CM.ID = (SELECT DefaultCounterID FROM  GM.Tbl_UserMaster UM WHERE  UM.ID = @UserID)").then(function(recordset){
     console.log(recordset);

     var c=recordset[0];

     config.common.OutletID = c.OutletID;
     config.common.CounterID = c.CounterID;
     config.common.DefaultCashBookId = c.CashBookID;
     config.common.GodownId = c.GodownID;
     config.common.OrderNumberingId = c.OrderDocNumbID;
     config.common.BillNumberingId = c.BillDocNumbID;
   }).catch(function(err){
     console.log(err,err.message);
   });

 }).catch(function(err){
   console.log(err,err.message);
 });

 var connection=new Connection(config.db);
 var connection1=new Connection(config.db);
 connection.on('connect', function(err) {
    // If no error, then good to go...
    if(err){
      console.log(err,err.message);
    }
  });
 connection1.on('connect', function(err) {
    // If no error, then good to go...
    if(err){
      console.log(err,err.message);
    }
  });



 var routes = require('./routes/index');
 var users = require('./routes/users');
 var chat=require('./routes/chat');

 var app = express();  
// call socket.io to the app
app.io = require('socket.io')();
io=app.io;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({ limit:'50mb',extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);
app.use('/chat',chat);

// catch 404 and forward to error handler
// app.use(function(req, res, next) {
//   var err = new Error('Not Found');
//   err.status = 404;
//   next(err);
// });

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

var waiters={};
var KDSUsers={};



// start listen with socket.io
app.io.on('connection', function(socket){  
  console.log('a user connected');
  console.log(socket.id);
  socket.emit('signUp',"");
  
  console.log(Object.keys(waiters));

  socket.on('login',function(msg){
  	console.log(msg);
  	msg=JSON.parse(msg);
  	waiterName=msg.waiterName;
    delete waiters[waiterName];
    socket.broadcast.emit('logout',waiterName);
    socket.nickName=waiterName;
    waiters[waiterName]=socket;

    console.log(waiterName +" joined the chat");
    console.log(Object.keys(waiters));
  });
  
  socket.on('KDSLogin',function(msg){
  	msg= JSON.parse(msg);
  	var KDSUser = msg.KDSUser;
  	socket.nickName=KDSUser;
  	KDSUsers[KDSUser]=socket;
  	var remainingArray={};
  		console.log('KDS Login : '+msg.KDSUser);
  	//check for messages in sqlite and emit
  	db.each("select message from StoreMessage where user =?",msg.KDSUser,function(err,message){
  		app.io.emit('KDSOrderMessage',message);
  		console.log('Data emitted to KDS waiting : ');
      console.log(message);
  	});
  });

  socket.on('KDSDataManage',function(msg){
  	msg= JSON.parse(msg);
  	var KDSType = msg.KDSType;
	  var id = msg.OrderID;
		console.log(msg);
  	//check if kstype exists in KDSUsers
  	if(typeof KDSUsers[KDSType] != "undefined"){
  		  	KDSUsers[KDSType].emit(msg);
  		  		console.log('Data emitted to KDS asap : '+ msg);
  	}
  	else{
  		db.run("INSERT INTO StoreMessage VALUES (?,?,?)",id,KDSType,JSON.stringify(msg));//error may come

	}
  	
  });

  socket.on('logout',function(msg){
    app.io.emit('logout',msg);
  });

  socket.on('chat message', function(msg){
    console.log(msg);
    app.io.emit('chat message', msg);
  });

  socket.on('chatMessage', function(msg){
    console.log(msg);
    app.io.emit('chatMessage', msg);
  });

  socket.on('KDSMessage', function(msg){
    console.log(msg);
    app.io.emit('KDSMessage', msg);
  });

  socket.on('tableStatus', function(msg){
    console.log(msg);
    app.io.emit('tableStatus', msg);
  });

  socket.on('browser chat', function(msg){
    console.log(msg);
    app.io.emit('browser chat', msg);
  });

  socket.on('privateChat',function(msg){
   msg=JSON.parse(msg);
   waiterName=msg.to;
   console.log(msg);
   if(typeof waiters[waiterName] != "undefined"){
    waiters[waiterName].emit('privateChat',msg);
        // waiters[msg.username].emit('privateChat',msg);
      //  socket.emit('privateChat',msg);
        app.io.emit('privateChat',msg);
      }else{			
       console.log(typeof waiters.property);
       console.log('error sending message');
     }

    	// socket.broadcast.to(socketid).emit('message', 'for your eyes only');
    });
  socket.on('disconnect',function(msg){
    console.log("a user disconnected");
    waiterName=socket.nickName;
      //check if disconnected user is current user
      if(socket.id==waiters[waiterName].id){
        delete waiters[waiterName];
      }
      if(socket.id==KDSUsers[waiterName].id){
        delete KDSUsers[waiterName];
      }
      console.log(Object.keys(waiters));
      console.log(waiterName +" left the chat");
    });
});

app.get('/api/v1/userlist',function(req,res){
	res.send(Object.keys(waiters));
});

app.get('/table',function(req,res){
	res.redirect('/api/v1/gettable');
});


app.get('/product',function(req,res){
	res.redirect('/api/v1/getproduct');
});


app.get('/api/v1/orderInformationSetting',function(req,res){
  var request=new sql.Request(cp);

  request.query('select ID,StatusID from gm.tbl_orderInformationSetting').then(function(recordsets){
      res.json(recordsets);
  }).catch(function(err){
      res.status(500).send(err.message);
  })
})

app.get('/api/v1/tabledesign',function(req,res){ 
	var request=new sql.Request(cp);
	request.query("SELECT 0 AS ID, 'Default' AS [Code],'Default' AS [Description],'' AS [Design],0 as [GroupID] UNION ALL SELECT \
   ID,[Code],[Description],[Design],[GroupID]  FROM  GM.tbl_tablelayout WHERE ISNULL(INACTIVE,0)=0").then(function(recordset) 
   { 
     res.send(recordset);
   }).catch(function(err) {
    console.log(err); status='error'; 
    res.status(500).send(err.message); 
	// ... query error checks
}); 
 });

app.put('/api/v1/tabledesign',function(req,res){

 var description=req.body.description;
 var design=req.body.design;
 var code=req.body.code;
 var groupID=req.body.groupID;

 var request=new sql.Request(cp);
 request.input('design',sql.Xml ,design);
 request.input('description',sql.NChar ,description);
 request.input('code',sql.NChar,code);
 request.input('groupID',sql.Int,groupID);
 request.query("if exists(select * from gm.tbl_tablelayout where GroupID=@groupID)\
  update [GM].[tbl_tablelayout] set code=@code,Description=@description,design=@design,groupID=@groupID where groupID=@groupID\
  else \
   insert into [GM].[tbl_tablelayout] values(@code,@description,@design,0,@groupID)").then(function(recordset) {
     console.log('design set');
     res.sendStatus(200);

   }).catch(function(err) {
     console.log(err);
     status='error';
     res.status(500).send(err.message);
		  // ... query error checks 
		});
 });


app.post('/api/v1/submitFullPayment',function(req,res){
  var CustomerID = req.body.CustomerID;
  var Remarks = req.body.Remarks;
  var NoPax_Adult = req.body.AdultPax;
  var NoPax_Child = req.body.ChildPax;
  var PaymentCardID = req.body.PaymentCardID;
  var CardDiscountRate = req.body.CardDiscountRate;
  var CardDiscountAmount = req.body.CardDiscountAmount;
  var ManualDiscount = req.body.ManualDiscount;
  var ActualReceipt = req.body.ActualReceipt;
  var ID = req.body.ID;

  var request = new sql.Request(cp);

  request.input('ID',sql.Int,ID);
  request.input('CustomerID',sql.Int,CustomerID);
  request.input('Remarks',sql.Char,Remarks);
  request.input('NoPax_Adult',sql.Int,NoPax_Adult);
  request.input('NoPax_Child',sql.Int,NoPax_Child);
  request.input('PaymentCardID',sql.Int,PaymentCardID);
  request.input('CardDiscountRate',sql.Decimal,CardDiscountRate);
  request.input('CardDiscountAmount',sql.Decimal,CardDiscountAmount);
  request.input('ManualDiscount',sql.Decimal,ManualDiscount);
  request.input('ActualReceipt',sql.Decimal,ActualReceipt);
  request.query("SET XACT_ABORT ON \
    BEGIN TRANSACTION DECLARE \
    @SalesTypeID INT SELECT @SalesTypeID = \
    CASE TypeID WHEN 15 THEN 96 WHEN 16 THEN 96 \
    ELSE 97 END FROM GM.Tbl_Ledger \
    WHERE ID= @CustomerID UPDATE [SALES].[Tbl_SBM] \
    SET CustomerID =@CustomerID ,\
    StatusID=2 ,\
    SalesTypeID=@SalesTypeID,\
    Remarks=@Remarks WHERE ID = @ID EXEC [SALES].[Usp_AT_SB] @ID \
    IF EXISTS (SELECT 0 FROM [SALES].[Tbl_FNBBillAdditional] WHERE SBMID = @ID) \
    BEGIN UPDATE [SALES].[Tbl_FNBBillAdditional] SET NoPax_Adult = @NoPax_Adult, \
    NoPax_Child = @NoPax_Child, PaymentCardID = @PaymentCardID, CardDiscountRate = @CardDiscountRate, \
    CardDiscountAmount = @CardDiscountAmount, ManualDiscount = @ManualDiscount, ActualReceipt = @ActualReceipt \
    WHERE SBMID = @ID\
    END ELSE BEGIN INSERT INTO [SALES].[Tbl_FNBBillAdditional] ( SBMID, NoPax_Adult, \
    NoPax_Child, BillCardID, PaymentCardID, CardDiscountRate, CardDiscountAmount, ManualDiscount, ActualReceipt ) \
    SELECT @ID, @NoPax_Adult,@NoPax_Child,NULL , @PaymentCardID,@CardDiscountRate, \
    @CardDiscountAmount, @ManualDiscount, @ActualReceipt \
    END COMMIT \
    SET XACT_ABORT OFF").then(function(recordset){
      res.send(recordset);
    }).catch(function(err){
      console.log(err);
      res.sendStatus(500);
    })        

  });

app.post('/api/v1/submitPartialPayment',function(req,res){
  var CustomerID = req.body.CustomerID;
  var ReceiptAmount = req.body.ReceiptAmount;
  var CashBankId = req.body.CashBankId;
  var SalesTypeID = req.body.SalesTypeID;
  var Remarks = req.body.Remarks;
  var NoPax_Adult = req.body.AdultPax;
  var NoPax_Child = req.body.ChildPax;
  var PaymentCardID = req.body.PaymentCardID;
  var CardDiscountRate = req.body.CardDiscountRate;
  var CardDiscountAmount = req.body.CardDiscountAmount;
  var ManualDiscount = req.body.ManualDiscount;
  var ActualReceipt = req.body.ActualReceipt;
  var ID = req.body.ID;
  if(CashBankId==0)
  {
   CashBankId=null;
 }
 if(PaymentCardID==0)
 {
   PaymentCardID = null;
 }
 var request = new sql.Request(cp);
 request.input('CustomerID',sql.Int,CustomerID);
 request.input('ReceiptAmount',sql.Decimal,ReceiptAmount);
 request.input('CashBankId',sql.Int,CashBankId);
 request.input('Remarks',sql.Char,Remarks);
 request.input('NoPax_Adult',sql.Int,NoPax_Adult);
 request.input('NoPax_Child',sql.Int,NoPax_Child);
 request.input('PaymentCardID',sql.Int,PaymentCardID);
 request.input('CardDiscountRate',sql.Decimal,CardDiscountRate);
 request.input('CardDiscountAmount',sql.Decimal,CardDiscountAmount);
 request.input('ManualDiscount',sql.Decimal,ManualDiscount);
 request.input('ActualReceipt',sql.Decimal,ActualReceipt);
 request.input('ID',sql.Decimal,ID);
 request.query("SET XACT_ABORT ON BEGIN TRANSACTION DECLARE @SalesTypeID INT SELECT @SalesTypeID = \
  CASE TypeID WHEN 15 THEN 96 WHEN 16 THEN 96 \
  ELSE 97 END FROM GM.Tbl_Ledger \
  WHERE ID= @CustomerID UPDATE [SALES].[Tbl_SBM] \
  SET CustomerID =@CustomerID , AdvanceAmt=@ReceiptAmount, AdvanceCBID= @CashBankId , \
  StatusID=2 , SalesTypeID=@SalesTypeID, Remarks=@Remarks \
  WHERE ID = @ID EXEC [SALES].[Usp_AT_SB] @ID \
  IF EXISTS (SELECT 0 FROM [SALES].[Tbl_FNBBillAdditional] WHERE SBMID = @ID) \
  BEGIN UPDATE [SALES].[Tbl_FNBBillAdditional] \
  SET NoPax_Adult = @NoPax_Adult,\
  NoPax_Child = @NoPax_Child,  PaymentCardID = @PaymentCardID,  CardDiscountRate = @CardDiscountRate, \
  CardDiscountAmount = @CardDiscountAmount,  ManualDiscount = @ManualDiscount,  ActualReceipt = @ActualReceipt \
  WHERE SBMID = @ID  \
  END ELSE  \
  BEGIN INSERT INTO [SALES].[Tbl_FNBBillAdditional] ( SBMID, \
  NoPax_Adult,  NoPax_Child,  BillCardID,  PaymentCardID,  CardDiscountRate, \
  CardDiscountAmount,  ManualDiscount,  ActualReceipt ) \
  SELECT @ID, @NoPax_Adult,@NoPax_Child,NULL , \
  @PaymentCardID, @CardDiscountRate,  @CardDiscountAmount,  @ManualDiscount, \
  @ActualReceipt \
  END COMMIT \
  SET XACT_ABORT OFF").then(function(recordset){
    res.send(recordset);
  }).catch(function(err){
    console.log(err);
    res.sendStatus(500);
  })        

});

app.get('/api/v1/billreceipt',function(req,res){
  var request = new sql.Request(cp);
  request.query("select m.ID,m.VNo as BillNo,t.Name as TableName,m.BasicAmt,m.NetAmt  as BillAmt \
    from sales.Tbl_SBM m left outer join gm.Tbl_ClassMaster t on m.CLSID3 = t.ID \
    where m.StatusID is null and m.CancelByID is null").then(function(recordset){
      res.send(recordset);
    }).catch(function(err){
      console.log(err);
      res.sendStatus(500);
    });        
  });

app.get('/api/v1/companyDetails',function(req,res){
  var request = new sql.Request(cp);
  request.query("select Name,Code,SDate,EDate, sd.M_Miti as [sMiti], ed.M_Miti as [eMiti] \
    from gm.Tbl_FiscalYearMaster m left outer join usys.Tbl_DateMiti sd on m.SDate = sd.M_Date\
    left outer join usys.Tbl_DateMiti ed on m.EDate = ed.M_Date").then(function(recordset)
    {
      res.send(recordset);
    }).catch(function(err){
      console.log(err); status='error';
      res.status(500).send(err.message);
    });
  });

app.get('/api/v1/productImage/:id',function(req,res){

  var productid=req.params.id;

  var request=new sql.Request(cp);

  request.input("productID",sql.Int,productid);
  request.query("select Logo from gm.tbl_product where id=@productID;").then(function(recordset) {
    console.log(recordset)

    // if(!recordset[0].Logo) {
    //   res.status(500).json({"message":"No image Found"});
    // }else{
      res.writeHead(200, {'Content-Type': 'image/jpeg'});
      res.end(recordset[0].Logo);
  // }
}).catch(function(err) {
  console.log(err);
  status='error';
  res.status(500).send(err.message);
      // ... query error checks 
    });
});

app.get('/api/v1/tableDesignList',function(req,res){
  var request=new sql.Request(cp); 
  request.query("select [ID],[Code],[Description],[GroupID] from \
    [GM].[tbl_tablelayout] where inactive=0").then(function(recordset) {
      res.send(recordset);
    }).catch(function(err) {
      console.log(err); 
      status='error'; 
      res.status(500).send(err.message); 
    }); 
  });

app.get('/check',function(req,res){
	
	var productStatus='not connected',tableStatus='not connected';
	//now check for table,product ,else and output result

	function gettable(){
		request('http://localhost:3000/table', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body.length+" tables");
        if(body.length>10){
         tableStatus="connected";
       }
     }else{
       console.log(error);
     }
     res.render('check',{productStatus:productStatus,tableStatus:tableStatus});
   });
	};
	

	function getproduct(){
		request.get('http://localhost:3000/product', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body.length+" products");
        if(body.length>10){
         productStatus="connected";
       }
     }else{
       console.log(error);
     }
     gettable();
   });
	};
	
	
	getproduct();
});

app.get('/setting',function(req,res){
  res.render('setting',{server:config.db.server,
    database:config.db.database,
    username:config.db.userName,
    password:config.db.password,
    instance:config.db.options.instanceName,
    userID:config.common.UserID});
});

app.post('/setting',function(req,res){

  var server=req.body.server;
  var database=req.body.database;
  var username=req.body.username;
  var password=req.body.password;
  var instance=req.body.instance;

  var userID=req.body.userID;

  fs.readFile('config.js', 'utf8', function (err,data) {
    if (err) {
      return console.log(err);
    }

    var result=data.replace(/config.db.server='[^;]*'/, "config.db.server='"+server+"'");
    result=result.replace(/config.db.database='[^;]*'/, "config.db.database='"+database+"'");
    result=result.replace(/config.db.userName='[^;]*'/, "config.db.userName='"+username+"'");
    result=result.replace(/config.db.password='[^;]*'/, "config.db.password='"+password+"'");
    result=result.replace(/instanceName:'[^;]*'/, "instanceName:'"+instance+"'");
    result=result.replace(/config.common.UserID=[^;]*/, "config.common.UserID="+userID+"");

    fs.writeFile('config.js', result, 'utf8', function (err) {
     if (err) {
      return console.log(err);
    }else{
      console.log("Config file changed");
      console.log("Exit called");
      console.log("Will respawn if run using forever");
      process.exit(0);
    }
  });
  });
  res.render('configchanged');
  
});

app.post('/api/v1/privatechat',function(req,res){
	var to=req.body.to;
	var to=String[to];
	if(typeof waiters.property != "undefined"){
		waiters[to].emit('privateChat',req.body.message);
	}else{
   console.log(typeof waiters.property);
   console.log('error sending message');
 }

 res.send("privatechat send");
 console.log(req.body);
});

app.post('/api/v1/chattest',function(req,res){
  tableID=req.body.TableID;
  status=req.body.Status;
  app.io.emit("tableStatus",{DineIn:tableID});
  res.send("test");
  console.log("status changed"+tableID);
});

app.post('/api/v1/chatmessage',function(req,res){

  message=req.body.message;
  app.io.emit("chatMessage",message);
  res.send("Send");
  console.log("chat message "+message);
});

app.post('/api/v1/tableKDS',function(req,res){

  var msg={};

  msg.TableNo=req.body.TableNo;
  msg.WaiterID=req.body.WaiterID;
  msg.GroupName=req.body.GroupName;
  msg.ProductName=req.body.ProductName;
  msg.Status=req.body.Status;
  msg.OrderNo=req.body.OrderNo;

  app.io.emit("KDSMessage",msg);
  res.send("kds messsage send");
  console.log("message send "+msg);
  console.log(req.body);
});

app.post('/api/v1/test',function(req,res){
  console.log("bill order called");
  var TableID=req.body.TableID;
  var WaiterID=req.body.WaiterID;
  var PCInfo=req.body.PCInfo;
  var Remarks=req.body.Remarks;
  var NoOfGuest=req.body.NoOfGuest;
  var NoOfGuestChild=req.body.NoOfGuestChild;
  var DetailsXml=req.body.DetailsXml;

  var BillingName=req.body.BillingName;
  var BillingAddress=req.body.BillingAddress;
  var BillingEmail=req.body.BillingEmail;
  var BillingPhone=req.body.BillingPhone;
  var BillingType=req.body.BillingType;
  var VATPANNo=req.body.VATPANNo;
  var PrinterName=req.body.Printer;
  var Token=req.body.Token;

    // Token='123';s
    console.log(DetailsXml);

    if(PrinterName=='undefined'){	
      PrinterName="";
    }

    var invoiceID=0;
    request = new Request('[SALES].[Usp_FNBO_Tab_UI]', function(err, rowCount) {
      if (err) {
        console.log(err);
        // res.sendStatus(500);
      } else {
        console.log(rowCount + ' rows');
        // res.send("Order taken");
        // app.io.emit("tableStatus",{DineIn:TableID});
        // print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:253, VoucherNumber: invoiceID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
        // 	,DataBaseName:config.db.database,PrinterName:PrinterName,NoOfCopy:1}
        //   , function (error, result) {
        //   if (error){
        //     console.log(error);
        //   }else{ 
        //     console.log("printer:"+PrinterName);
        //     console.log(result);
        //   }
        // });
      }
    });

    // request.on('row', function(columns) {
    //  var message;
    //  columns.forEach(function(column) {
    //    console.log(column.value);
    //    message=message+column.value;
    //  });
    //  res.send(message);
    // });

    var TYPES = require('tedious').TYPES;
    request.addParameter('OutletID',TYPES.Int,  config.common.OutletID);
    request.addParameter('TableID', TYPES.Int,  TableID);
    request.addParameter('AddClass1ID', TYPES.Int);
    request.addParameter('AddClass2ID', TYPES.Int);
    request.addParameter('AddClass3ID', TYPES.Int);
    request.addParameter( 'AddClass4ID', TYPES.Int);
    request.addParameter('AddClass5ID', TYPES.Int);
    request.addParameter('FYID', TYPES.TinyInt, config.common.FiscalYearID);
    request.addParameter('UnitID',TYPES.SmallInt, config.common.UnitID);
    request.addParameter('DID', TYPES.Int);
    request.addParameter('NumId', TYPES.SmallInt, config.common.OrderNumberingId);
    request.addParameter('CounterID', TYPES.Int, config.common.CounterID);
    request.addParameter('WaiterID', TYPES.Int, WaiterID);
    request.addParameter('UserId', TYPES.SmallInt, config.common.UserID);

    request.addParameter('BillingName',TYPES.NVarChar,BillingName);
    request.addParameter('BillingAddress',TYPES.NVarChar,BillingAddress);
    request.addParameter('BillingEmail',TYPES.NVarChar,BillingEmail);
    request.addParameter('Billingphone',TYPES.NVarChar,BillingPhone);
    request.addParameter('BillingType',TYPES.SmallInt,BillingType);
    request.addParameter('VATPANNo',TYPES.NVarChar,VATPANNo);


    request.addParameter('Remarks', TYPES.Text,Remarks);
    request.addParameter('NoOfGuestAdult', TYPES.Int,NoOfGuest);
    request.addParameter('NoOfGuestChild', TYPES.Int,NoOfGuestChild);
    request.addParameter( 'PCInfo',TYPES.Text,PCInfo);
    request.addParameter( 'Token',TYPES.Text,Token);
    request.addParameter('DetailsXml', TYPES.Text,DetailsXml);
    request.addOutputParameter( 'OutMessage', TYPES.NVarChar);
    request.addOutputParameter('OutId',TYPES.Int);

    request.on('returnValue', function(parameterName, value, metadata) {
        console.log(parameterName + ' = ' + value);      // outputParameterName = ...
        if(parameterName=='OutId'){
          invoiceID=value;

          res.send("Order taken");
          app.io.emit("tableStatus",{DineIn:TableID});

          print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:253, VoucherNumber: invoiceID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
            ,DataBaseName:config.db.database,PrinterName:PrinterName,NoOfCopy:1}
            , function (error, result) {
              if (error){
                console.log(error);
              }else{ 
                console.log("printer:"+PrinterName);
                console.log(result);
              }
            });
        }
      });


    connection.callProcedure(request);

    
  });

 app.post('/api/v1/kycformdetails',function(req,res){
  var id = req.body.id;
  var name = req.body.name;
  var addressValue = req.body.address;
  var phoneValue = req.body.phone;
  var emailValue = req.body.email;
  var descriptions = req.body.descriptions;
  var userId = req.body.userId;
  var pcInfo = req.body.pcInfo;
  var paymentMode = req.body.paymentMode;
  var birthDate = req.body.birthDate;
  var anniversaryDate = req.body.anniversaryDate;
  var request=new sql.Request(cp);
  console.log(request);
  request.input('ID',sql.Int,id);
  request.input('Name',sql.NVarChar(256),name);
  request.input('AddressValue',sql.NVarChar(256),addressValue);
  request.input('PhoneValue',sql.NVarChar(256),phoneValue);
  request.input('EmailValue',sql.NVarChar(256),emailValue);
  request.input('Descriptions',sql.NVarChar(1024),descriptions);
  request.input('UnitId',sql.Int,config.common.UnitID);
  request.input('UserId',sql.Int,userId);
  request.input('PCInfo', sql.NVarChar(50),pcInfo);
  request.input('PaymentMode',sql.Int,paymentMode);
  request.input('Birthdate',sql.Date,birthDate);
  request.input('AnniversaryDate',sql.Date,anniversaryDate);
  request.execute('[GM].Usp_KycForm_UI_TAB').then(function(recordset){
    res.status(200).send('Successfully Inserted.');
  }).catch(function(err){
    console.log(err);
    res.status(500).send(err.message);
  })

 });

 app.get('/api/v1/searchKycFormMobile',function(req,res){
  console.log(req.headers);
  var mobileNo = req.headers.mobileno;
  var request = new sql.Request(cp);
  console.log(mobileNo);
  request.input('mobileNo',sql.Char,mobileNo);

  request.query("select ID,PName,PhoneValue,AddressValue,BirthDate,Anniversary,PaymentMode,Descriptions,EmailValue\
    from gm.tbl_guestMaster\
    where PhoneValue=@mobileNo order by id desc").then(function(recordsets){
      res.status(200).json(recordsets);
    }).catch(function(err){
      res.status(500).json({message:err.message});
    });
  });


app.post('/api/v1/billorder',function(req,res){
  console.log(req.body);
  var datetime = new Date();

  var TableID=req.body.TableID;
  var WaiterID=req.body.WaiterID;
  var PCInfo=req.body.PCInfo;
  var BillingName=req.body.BillingName;
  var BillingAddress=req.body.BillingAddress;
  var BillingEmail=req.body.BillingEmail;
  var BillingPhone=req.body.BillingPhone;
  var VATPANNo=req.body.VATPANNo;
  var BillCardID=req.body.BillCardID;
  if(BillCardID==0){
    BillCardID=null;
  }

  var CustomerID=req.body.CustomerID;
  var BasicAmt=req.body.BasicAmt;
  var TAmt=req.body.TAmt;
  var NetAmt=req.body.NetAmt;
  var PCInfo=req.body.PCInfo;
  var details=req.body.details;
  var sbt=req.body.sbt;
  var remarks=req.body.Remarks;
  var PrinterName=req.body.Printer;
  var NoOfCopy=req.body.NoOfCopy;

  NoOfCopy=Number(NoOfCopy);

  if(PrinterName=='undefined')
    PrinterName="";
  if(NoOfCopy=='undefined')
    NoOfCopy=0;

  var invoiceID=0;

  var TYPES = require('tedious').TYPES;

  console.log(datetime);

  request = new Request('[SALES].[Usp_FNBB_TAB_UI]', function(err, rowCount) {
    if (err) {
      console.log(err);
        // res.sendStatus(500);
      } else {
        console.log(rowCount + ' rows');
     //    res.send("Bill Order taken");
     //    // app.io.emit("tableStatus",{Billed:TableID}); //handle from android

     //    print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:257, VoucherNumber: invoiceID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
     //    	,DataBaseName:config.db.database,PrinterName:PrinterName,NoOfCopy:NoOfCopy}
	    //   , function (error, result) {
	    //   if (error){
	    //     console.log(error);
	    //   }else{ 
     //      console.log("printer:"+PrinterName+" NoOfCopy:"+NoOfCopy);
	    //     console.log(result);
	    //   }
	    // });
    }
  });





  var dTable=JSON.parse(details);
  var sTable=JSON.parse(sbt);
          // console.log(dTable);
    // console.log(sTable);  


    var detailsTable={
      "columns":[
      {
        "name":"ID",
        "type":TYPES.Int
      },
      {
        "name":"SODID",
        "type":TYPES.Int
      },
      {
        "name":"Sno",
        "type":TYPES.SmallInt
      },
      {
        "name":"PID",
        "type":TYPES.Int
      },
      {
        "name":"Qty",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"UOMID",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"Rate",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"Amt",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"TermAmt",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"NetAmt",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"Description",
        "type":TYPES.NVarChar
      }
      ],
      "rows":dTable
    };

    var sbtTable={
      "columns":[
      {
        "name":"ROWID",
        "type":TYPES.Int
      },
      {
        "name":"PSno",
        "type":TYPES.SmallInt
      },
      {
        "name":"ID",
        "type":TYPES.Int
      },
      {
        "name":"PID",
        "type":TYPES.Int
      },
      {
        "name":"BTID",
        "type":TYPES.SmallInt
      },
      {
        "name":"TypeID",
        "type":TYPES.SmallInt
      },
      {
        "name":"TRate",
        "type":TYPES.Decimal,precision:19,scale:7
      },
      {
        "name":"TAmt",
        "type":TYPES.Decimal,precision:19,scale:7 
      }
      ],
      "rows":sTable
    };

    // console.log(JSON.stringify(detailsTable));
    // console.log(JSON.stringify(sbtTable));
    
    request.addParameter('ID',TYPES.Int,0);
    request.addParameter('VDate',TYPES.Date,datetime);
    request.addParameter('CustomerID',TYPES.Int,CustomerID);
    request.addParameter('OutletID',TYPES.Int,config.common.OutletID);//default6
    request.addParameter('CounterID',TYPES.Int,config.common.CounterID);//default
    request.addParameter('TableID',TYPES.Int,TableID);
    request.addParameter('WaiterID',TYPES.Int,WaiterID);
    request.addParameter('AddClass1ID',TYPES.Int,null);
    request.addParameter('AddClass2ID',TYPES.Int,null);
    request.addParameter('AddClass3ID',TYPES.Int,null);
    request.addParameter('AddClass4ID',TYPES.Int,null);
    request.addParameter('AddClass5ID',TYPES.Int,null);
    request.addParameter('DefaultGodownID',TYPES.Int,config.common.GodownId);//default
    request.addParameter('AdvanceAmt',TYPES.Decimal,0);
    request.addParameter('AdvanceCBID',TYPES.Int,null);

    request.addParameter('BasicAmt',TYPES.Decimal,BasicAmt);
    request.addParameter('TAmt',TYPES.Decimal,TAmt);
    request.addParameter('NetAmt',TYPES.Decimal,NetAmt);
    request.addParameter('RVno',TYPES.NVarChar,null);

    request.addParameter('noOfPaxAdult',TYPES.Decimal,0);
    request.addParameter('noOfPaxChild',TYPES.Decimal,0);
    request.addParameter('BillCardID',TYPES.Int,BillCardID);

    request.addParameter('Remarks',TYPES.NVarChar,remarks);
    request.addParameter('BillingName',TYPES.NVarChar,BillingName);
    request.addParameter('BillingAddress',TYPES.NVarChar,BillingAddress);
    request.addParameter('BillingEmail',TYPES.NVarChar,BillingEmail);
    request.addParameter('Billingphone',TYPES.NVarChar,BillingPhone);
    request.addParameter('VATPANNo',TYPES.NVarChar,VATPANNo);
    request.addParameter('PriceListID',TYPES.SmallInt,null);


    request.addParameter('TenderAmt',TYPES.Decimal,0);//zero
    request.addParameter('ReturnAmt',TYPES.Decimal,0);//zero
    request.addParameter('FYID',TYPES.TinyInt,config.common.FiscalYearID);//default
    request.addParameter('UnitID',TYPES.TinyInt,config.common.UnitID);

    request.addParameter('DID',TYPES.Int,null);
    request.addParameter('NumId',TYPES.Int,config.common.BillNumberingId);

    request.addParameter('PCInfo',TYPES.Text,PCInfo);
    request.addParameter('UserId',TYPES.Int,config.common.UserID);

    request.addParameter('Details',TYPES.TVP,detailsTable);
    request.addParameter('SBT',TYPES.TVP,sbtTable);

    request.addOutputParameter('OutId',TYPES.Int);
    request.addOutputParameter( 'OutMessage', TYPES.NVarChar);

    request.on('row', function(columns) {
     columns.forEach(function(column) {
      console.log(column.value);
    });
   });

    request.on('returnValue', function(parameterName, value, metadata) {
        console.log(parameterName + ' = ' + value);      // outputParameterName = ...
        // res.sendStatus(200);
        if(parameterName=='OutId'){
            //print
            if(value==0){
              //status code 213 if already billed
              res.send("213");
              return;
            }
            invoiceID=value;
            res.send("Bill Order taken");
        // app.io.emit("tableStatus",{Billed:TableID}); //handle from android

        print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:257, VoucherNumber: invoiceID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
          ,DataBaseName:config.db.database,PrinterName:PrinterName,NoOfCopy:NoOfCopy}
          , function (error, result) {
            if (error){
              console.log(error);
            }else{
              console.log("printer:"+PrinterName+" NoOfCopy:"+NoOfCopy);
              console.log(result);
            }
          });
      }
    });

    connection.callProcedure(request);
  });

function isEmpty(obj) {
  return !Object.keys(obj).length;
}

app.get('/api/v1/login',function(req,res){
  var username=req.headers['username'];
  var password=req.headers['password'];

  var request=new sql.Request(cp);
  request.input('Username',sql.NChar ,username);
  request.input('Password',sql.NChar ,password);
  request.query("if exists(    SELECT \
    U.ID\
    FROM   GM.Tbl_ClassMaster  AS U\
    WHERE U.Name = @UserName AND CONVERT(VARCHAR(MAX),U.[Password]) = ISNULL(NULLIF(@Password,''),'000')  AND InActive = 0\
    )\
    SELECT \
    U.ID,\
    U.Name,\
    UR.IsBillCancel,\
    UR.IsBilling,\
    UR.IsOrderCancel,\
    UR.IsOrderTransfer,\
    UR.IsRePrintBill,\
    UR.IsRePrintOrder,\
    UR.IsRePrintOrderCancel,\
    UR.IsBillSettlement,\
    UR.IsRePrintOrderTransfer\
    FROM (select * from  GM.Tbl_ClassMaster WHERE Name = @UserName AND CONVERT(VARCHAR(MAX),[Password]) = ISNULL(NULLIF(@Password,''),'000')  AND InActive = 0 ) AS U\
    LEFT OUTER JOIN GM.Tbl_WaiterRole UR on U.ID=UR.WaiterID\
    else select  Convert(smallint,0 ) ID").then(function(recordset) {
      console.log('login api called');
      console.log(recordset);
      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  });

app.get('/api/v1/nocControl',function(req,res){
  var request = new sql.Request(cp);

  request.query("select ISNULL(IsAdult,1) IsAdult,ISNULL(IsChild,0) IsChild,ISNULL(NoOfAdult,2) NoOfAdult,\
    ISNULL(NoOfChild,0) NoOfChild,ISNULL(NULLIF(CaptionAdult,''),'NoOfAdult') CaptionAdult,ISNULL(NULLIF(CaptionChild,''),'NoOfChild') CaptionChild \
    from GM.TBL_SystemControl").then(function(recordsets){
      res.status(200).json(recordsets);
    }).catch(function(err){
      res.status(500).json({message:err.message});
    });
  });

app.post('/api/v1/passcodelogin',function(req,res){
  var passcode = req.body.passcode;
  console.log("passcode");
  console.log(passcode);
  var request = new sql.Request(cp);
  request.input('passcode',sql.NVarChar(1024),passcode);
  request.query('IF EXISTS( Select ID from GM.Tbl_ClassMaster where ClassTypeID=4 and PassCode = convert(Varbinary(max),@passcode ) and InActive=0)\
   SELECT \
   U.ID,\
   U.Name,\
   UR.IsBillCancel,\
   UR.IsBilling,\
   UR.IsOrderCancel,\
   UR.IsOrderTransfer,\
   UR.IsRePrintBill,\
   UR.IsRePrintOrder,\
   UR.IsRePrintOrderCancel,\
   UR.IsBillSettlement,\
   UR.IsRePrintOrderTransfer\
   FROM (select * from  GM.Tbl_ClassMaster WHERE PassCode = convert(Varbinary(max),@passcode ) and InActive=0 ) AS U\
   LEFT OUTER JOIN GM.Tbl_WaiterRole UR on U.ID=UR.WaiterID\
   Else \
   Select 0 ID').then(function(recordsets){
    res.status(200).json(recordsets[0]);
    console.log(recordsets[0]);
    }).catch(function(err){
    res.status(500).json(err.message);
  });
});

app.post('/api/v1/cashierPasscodeLogin',function(req,res){
  var passcode = req.body.passcode;
  console.log('cashierPasscode');
  console.log(passcode);
  var request = new sql.Request(cp);
  request.input('passcode',sql.NVarChar(1024),passcode);
  request.query('IF EXISTS( Select ID from GM.Tbl_UserMaster where PassCode = convert(Varbinary(max),@passcode) and InActive=0)\
   SELECT \
   U.ID,\
   U.Name \
   FROM (select * from  GM.Tbl_UserMaster WHERE PassCode = convert(Varbinary(max),@passcode) and InActive=0 ) AS U\
   Else \
   Select 0 ID').then(function(recordsets){
    res.status(200).json(recordsets[0]);
    console.log(recordsets[0]);
    }).catch(function(err){
      res.status(500).json(err.message);
      console.log(err);
  });
});

app.post('/api/v1/history',function(req,res){
 var mobile=req.body.mobile;
 console.log(mobile);

 var request=new sql.Request(cp);

 request.input('mobileNo',sql.Char ,mobile);	
 request.query("with cte as(select d.pid,count(d.pid) as [count]\
  from sales.tbl_sbd as d\
  where sbmid in (select sbmid from sales.tbl_sbba where BillingPhoneValue=@mobileNo)\
  group by pid) select TOP 15 pid,Name,SalesPrice,UOMID,count from cte \
  LEFT OUTER JOIN gm.tbl_product p on cte.pid =p.id order by [count] desc").then(function(recordset) {
    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.post('/api/v1/latestSOMID',function(req,res){
 var tableID=req.body.tableID;

 var request=new sql.Request(cp);

 request.input('tableID',sql.Char ,tableID);	
 request.query("SELECT TOP 1\
   SOMID\
   FROM  [SALES].[Ufn_SO_Outstanding](0,0) Outstanding\
   LEFT OUTER JOIN SALES.Tbl_SOM SOM ON Outstanding.SOMID = SOM.ID\
   WHERE Outstanding.QTY > 0  and  SOM.CLSID3 =@tableID\
   order by SOMID ").then(function(recordset) {
    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.get('/api/v1/billingTerms',function(req,res){

  var request=new sql.Request(cp);
  request.query("SELECT \
    BT.ID\
    ,BT.Code \
    ,BT.Name\
    ,BT.SBCategoryID AS CategoryID\
    ,BT.SBInActive\
    ,Category = (SELECT ENUM.CValue FROM Usys.Tbl_ENUM_COLL AS ENUM WHERE ENUM.ID =  BT.SBCategoryID)\
    ,BT.[SBBasisID] AS BasisID\
    ,Basis = (SELECT ENUM.CValue FROM Usys.Tbl_ENUM_COLL AS ENUM WHERE ENUM.ID =  BT.[SBBasisID])\
    ,CASE BT.SBCategoryID  WHEN 46 THEN '+/-' ELSE BT.[SBSign] END AS [Sign]\
    ,CASE BT.SBCategoryID  WHEN 46 THEN 0 ELSE COALESCE(BT.SBRate,0)  END AS [Rate]\
    ,CASE BT.SBCategoryID  WHEN 46 THEN 0 ELSE COALESCE(BT.SBAmount,0) END AS [Amount]\
    ,CASE BT.SBCategoryID  WHEN 46 THEN 63 ELSE BT.[SBRoundOffID] END AS [RoundOffID]\
    ,RoundOff = (SELECT ENUM.CValue FROM Usys.Tbl_ENUM_COLL AS ENUM WHERE ENUM.ID =  CASE BT.SBCategoryID  WHEN 46 THEN 63 ELSE BT.[SBRoundOffID] END)\
    ,ISNULL(BT.[SBFormualation],'') AS [Formulation]\
    ,BT.[SBCalcBasisID] AS [CalcBasisID]\
    ,CalcBasis= (SELECT ENUM.CValue FROM Usys.Tbl_ENUM_COLL AS ENUM WHERE ENUM.ID =  BT.[SBCalcBasisID])\
    ,BT.SBIsDisableID AS IsDisableID\
    ,BT.SBTypeID  AS IsTypeID\
    ,CONVERT(smallint,117) AS TypeID\
    FROM GM.Tbl_BillingTerm AS BT\
    WHERE BT.ModuleID In (49,51,109,111)\
    AND  BT.SBCategoryID  In (43,45,46)\
    AND  BT.SBTypeID = 105 ---BillWise\
    AND  BT.SBInActive = 0 \
    ORDER BY CASE WHEN BT.SBCategoryID = 46 THEN 99999 ELSE  CODE  END ").then(function(recordset){
      res.send(recordset);

    }).catch(function(err){
      res.sendStatus(500);
    });
  });

app.get('/api/v1/makingTime',function(req,res){

  var request=new sql.Request(cp);

  request.query("select TOP 1 NormalFromTime,NormalToTime,PickFromTime,PickToTime,OffFromTime,OffToTime from gm.tbl_systemcontrol").then(function(recordset) {
    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.get('/api/v1/getOrderPersonDetails',function(req,res){

 var tableID=req.headers['table'];

 var request=new sql.Request(cp);

 request.input('tableID',sql.Char ,tableID);	
 request.query("select * from sales.tbl_soba where somid  in(\
   SELECT distinct SOMID\
   \
   FROM  [SALES].[Ufn_SO_Outstanding](0,0) Outstanding   \
   LEFT OUTER JOIN SALES.Tbl_SOM SOM ON Outstanding.SOMID = SOM.ID\
   WHERE Outstanding.QTY > 0  and  SOM.CLSID3 =@tableID\
   )order by id desc").then(function(recordset) {
    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

})

app.post('/api/v1/getOrderPersonDetails1',function(req,res){
 var tableID=req.body.tableID;

 var request=new sql.Request(cp);

 request.input('tableID',sql.Char ,tableID);	
 request.query("select * from sales.tbl_soba where somid = (\
  SELECT TOP 1\
  SOMID\
  FROM  [SALES].[Ufn_SO_Outstanding](0,0) Outstanding\
  LEFT OUTER JOIN SALES.Tbl_SOM SOM ON Outstanding.SOMID = SOM.ID\
  WHERE Outstanding.QTY > 0  and  SOM.CLSID3 =@tableID\
  order by SOMID ) order by id desc").then(function(recordset) {
    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.get('/api/v1/searchmobile',function(req,res){

  var mobileNo = req.headers.mobileno;
  var request = new sql.Request(cp);

  request.input('mobileNo',sql.Char,mobileNo);

  request.query("select TOP 1 BillingName,BillingPhoneValue,BillingAddressValue,BillingEmailValue,BillingVatPanNo \
    from sales.tbl_sbba \
    where BillingPhoneValue=@mobileNo order by id desc").then(function(recordsets){
      res.status(200).json(recordsets);
    }).catch(function(err){
      res.status(500).json({message:err.message});
    });
  });

app.post('/api/v1/setOrderPersonDetails',function(req,res){
 var ID=req.body.ID;
 var tableID=req.body.tableID;

 var BillingName=req.body.BillingName;
 var BillingAddress=req.body.BillingAddress;
 var BillingEmail=req.body.BillingEmail;
 var BillingPhone=req.body.BillingPhone;
 var BillingType=req.body.BillingType;

 var request=new sql.Request(cp);

 request.input('ID',sql.Char ,ID);

 request.input('BillingName',sql.Char ,BillingName);
 request.input('BillingAddress',sql.Char ,BillingAddress);
 request.input('BillingEmail',sql.Char ,BillingEmail);	
 request.input('BillingPhone',sql.Char ,BillingPhone);
 request.execute("Sales.tbl_orderPersonDetails").then(function(recordset) {
  res.sendStatus(200);

}).catch(function(err) {
  console.log(err);
  status='error';
  res.sendStatus(500);
      // ... query error checks 
    });
});

app.get('/api/v1/userlogin',function(req,res){
  var username=req.headers['username'];
  var password=req.headers['password'];

  var request=new sql.Request(cp);
  request.input('Username',sql.Char ,username);
  request.input('Password',sql.Char ,password);
  request.query("if exists(    SELECT \
    U.ID\
    FROM   GM.Tbl_UserMaster  AS U\
    WHERE U.Name = @UserName AND CONVERT(NVARCHAR(MAX),U.[Password]) = ISNULL(NULLIF(@Password,''),'000')  AND InActive = 0 \
    )\
    SELECT \
    U.ID\
    FROM   GM.Tbl_UserMaster  AS U\
    WHERE U.Name = @UserName AND CONVERT(NVARCHAR(MAX),U.[Password]) = ISNULL(NULLIF(@Password,''),'000')  AND InActive = 0 \
    else select  Convert(smallint,0 ) ID").then(function(recordset) {
      console.log('login api called');
      console.log(recordset);
      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  })

app.get('/api/v1/printerList',function(req,res){
 printers({},function (error, result) {
   if (error){
     res.sendStatus(500);
     throw err;
     console.log(err);
   } else{
     res.send(result);
   }

 });
});

app.post('/api/v1/print',function(req,res){

 var VoucherNumber=req.body.VoucherNumber;
 var type=req.body.type;
 var PrinterName=req.body.Printer;
 var NoOfCopy=req.body.NoOfCopy;
 if(PrinterName=='undefined'){
  PrinterName="";
}
if(NoOfCopy=='undefined'){
  NoOfCopy=0;
}

console.log(req.body);

VoucherNumber=Number(VoucherNumber);
NoOfCopy=Number(NoOfCopy);
if(type==1){
  type=257;
}else if(type==2){
  type=253;
}

console.log(typeof(VoucherNumber)+" "+typeof(type));
console.log(VoucherNumber+" "+type);

    print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:type, VoucherNumber: VoucherNumber, ServerName: config.Server,ServerUserName:config.db.userName
    	,ServerPassword:config.db.password,DataBaseName:config.db.database,PrinterName:PrinterName,NoOfCopy:NoOfCopy}
      , function (error, result) {
        if (error){
          console.log(error);
        }else{ 
          console.log(result);
        }
      });
    debugger;
    res.sendStatus(200);
    console.log("aysnc");
  });

app.get('/api/v1/gettable',function(req,res){

  var request=new sql.Request(cp);
  request.query("              ; WITH  CTE AS (\
    SELECT  DISTINCT \
    SOM.CLSID3 AS TableID\
    \
    FROM  [SALES].[Ufn_SO_Outstanding](0,0) Outstanding   \
    LEFT OUTER JOIN SALES.Tbl_SOM SOM ON Outstanding.SOMID = SOM.ID\
    WHERE Outstanding.QTY > 0 \
    )\
    ,BILLED AS (\
    SELECT DISTINCT SBM.CLSID3 AS TABLEID\
    \
    FROM SALES.TBL_SBM SBM WHERE ISNULL(STATUSID,0) <>2 AND CANCELBYID IS NULL  \
    \
    \
    \
    )  \
    \
    SELECT \
    \
    CM.ID AS TABLEID\
    ,CM.NAME\
    , CASE when cte.TableID is not null then 'DineIn' WHEN BILLED.TABLEID IS NOT NULL then 'Billed'  else 'Vacant' end as [Status]\
    ,CG.NAME AS [TableGroup]\
    ,CM.GroupID AS [TableGroupID]\
    FROM GM.TBL_CLASSMASTER CM  \
    LEFT OUTER JOIN CTE ON   CM.ID = CTE.TABLEID\
    LEFT OUTER JOIN BILLED ON CM.ID = BILLED.TABLEID\
    LEFT OUTER JOIN GM.TBL_CLASSGROUP CG ON CM.GroupID= CG.ID\
    WHERE CM.INACTIVE =  0 and cm.classtypeid=3\
    AND cm.id not in(SELECT ISNULL( HomeDeliveryTableID,0) FROM GM.TBL_SystemControl)\
    ORDER BY CM.Schedule").then(function(recordset) {
      console.log('table api called')
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });


  });



app.get('/api/v1/getproduct',function(req,res){
  var request=new sql.Request(cp);
  request.input('CounterID',sql.Int ,config.common.CounterID);
  request.query(";with Cte as (\
    SELECT \
    0 as MenuID\
    ,'Default' AS MenuName\
    ,P.ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,ISNULL(c.Name,'None') AS [Category]\
    \
    ,P.NormalHour\
    ,P.PickHour\
    ,P.OffHour\
    \
    FROM GM.Tbl_Product P\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    LEFT OUTER JOIN  [GM].[Tbl_ProductCategoryMaster] c on p.categoryId1 =c.id\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = @CounterID) \
    \
    UNION ALL \
    \
    SELECT \
    M.ID AS MenuID\
    ,isnull(nullif(M.PName,''),M.Code) AS MenuName\
    ,D.PID  as ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,ISNULL(c.Name,'None') AS [Category]\
    \
    ,P.NormalHour\
    ,P.PickHour\
    ,P.OffHour\
    \
    FROM GM.Tbl_RecipeMenuMaster M \
    LEFT OUTER JOIN GM.Tbl_RecipeMenuDetails  D ON M.ID = D.MID\
    LEFT OUTER JOIN GM.Tbl_Product P ON D.PID=P.ID\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    LEFT OUTER JOIN  [GM].[Tbl_ProductCategoryMaster] c on p.categoryId1 =c.id\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = @CounterID) ) select * from cte order by Menuid, name").then(function(recordset){
      console.log("database api called");
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      res.sendStatus(500);
      // ... query error checks 
    });
  });

app.get('/api/v1/outstanding',function(req,res){
  var tableid=req.headers['tableid'];
	// console.log('table ID' + tableid);
  var request=new sql.Request(cp);
  request.input('TableID',sql.Int ,tableid);
  
  request.query("Declare @smt nvarchar(max)='' \
    Declare @TableSegment int \
    \
    SELECT @TableSegment = ClassTypeID FROM GM.Tbl_ClassMaster WHERE ID = @TableID \
    ;With Data AS (\
    SELECT TOP 100 PERCENT\
    SOM.VNo AS OrderNo\
    ,SOD.Sno As OrderSno\
    ,P.Name AS Product\
    ,Outstanding.Qty \
    ,SOD.NetAmt As NetAmount \
    ,SOD.No_qty as Seat \
    FROM [SALES].[Tbl_SOD] SOD  \
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID  \
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    LEFT OUTER JOIN [GM].[Tbl_Product] P ON SOD.PID = P.ID\
    WHERE  CASE @TableSegment \
    WHEN 1 THEN SOM.CLSID1 \
    WHEN 2 THEN SOM.CLSID2 \
    WHEN 3 THEN SOM.CLSID3 \
    WHEN 4 THEN SOM.CLSID4 \
    WHEN 5 THEN SOM.CLSID5 \
    WHEN 6 THEN SOM.CLSID6\
    WHEN 7 THEN SOM.CLSID7\
    WHEN 8 THEN SOM.CLSID8\
    WHEN 9 THEN SOM.CLSID9\
    END = @TableID AND Outstanding.Qty > 0\
    ORDER BY SOM.VNo,SOD.Sno\
    ) SELECT * FROM Data").then(function(recordset) {
      console.log('outstanding api called');
        res.send(recordset);

      }).catch(function(err) {
        console.log(err);
        status='error';
        res.sendStatus(500);
      // ... query error checks 
    });

    });

app.get('/api/v1/getMenu',function(req,res){
  var request=new sql.Request(cp);
      // request.input('CounterID',sql.Int ,config.common.CounterID);
      request.query(" ;with Cte as (\
        SELECT \
        0 as MenuID\
        ,'Default' AS MenuName\
        ,P.ID\
        ,P.Name\
        ,P.Descriptions\
        ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
        ,ISNULL(UOM.ID,0) AS UOMID\
        ,ISNULL(UOM.Code,'') AS UOM\
        \
        ,ISNULL(PG.id,0) AS [GroupId]\
        ,ISNULL(PG.Name,'None') AS [GroupName]\
        \
        ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
        ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
        \
        ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
        when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
        else 'Other' End as Category\
          ,20 as MakingTime\
        \
        \
        FROM GM.Tbl_Product P\
        LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
        LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
        LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
        WHERE P.InActive = 0 \
        AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
        union all\
        SELECT \
        1 as MenuID\
        ,'Today Special' AS MenuName\
        ,P.ID\
        ,P.Name\
        ,P.Descriptions\
        ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
        ,ISNULL(UOM.ID,0) AS UOMID\
        ,ISNULL(UOM.Code,'') AS UOM\
        \
        ,ISNULL(PG.id,0) AS [GroupId]\
        ,ISNULL(PG.Name,'None') AS [GroupName]\
        \
        ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
        ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
        \
        ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
        when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
        else 'Other' End as Category\
          \
        ,30 as MakingTime\
        \
        FROM GM.Tbl_Product P\
        LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
        LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
        LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
        WHERE P.InActive = 0 \
        AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
        \
        )select distinct MenuId,MenuName from cte ").then(function(recordset){
          console.dir(recordset);
          res.send(recordset);
        }).catch(function(err) {
          console.log(err);
          res.sendStatus(500);
      // ... query error checks 
    });
      });

app.get('/api/v1/getGroup',function(req,res){
  var request=new sql.Request(cp);
  request.query("select ID, Name from gm.TBL_PRODUCTGROUP where InActive=0").then(function(recordset){
      console.dir(recordset);
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      res.sendStatus(500);
      // ... query error checks 
    });
  });

app.get('/api/v1/getAdditionalGroup',function(req,res){
  var request=new sql.Request(cp);
  request.query(" ;with Cte as (\
    SELECT \
    0 as MenuID\
    ,'Default' AS MenuName\
    ,P.ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
    when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
    else 'Other' End as Category\
      ,20 as MakingTime\
    \
    \
    FROM GM.Tbl_Product P\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
    union all\
    SELECT \
    1 as MenuID\
    ,'Today Special' AS MenuName\
    ,P.ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
    when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
    else 'Other' End as Category\
      \
    ,30 as MakingTime\
    \
    FROM GM.Tbl_Product P\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
    \
    ) select distinct [AdditionalGroupId],[AdditionalGroupName] from cte").then(function(recordset){
      console.dir(recordset);
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      res.sendStatus(500);
      // ... query error checks 
    });
  });

app.get('/api/v1/KDSProduct',function(req,res){
  var groupID=req.headers['groupid'];
  var request = new sql.Request(cp);
  request.input("grpID",sql.Int,groupID);
  request.query("Declare @GroupID int=@grpID\
               SELECT\
                SOD.ID AS OrderID\
              ,SOM.VNo AS OrderNo\
              ,CONVERT(INT,SOD.Sno) As OrderSno\
              ,SOM.VDate As OrderDate\
              ,CLS.NAME AS TableName\
              ,SOM.VTime AS OrderTime\
              ,P.Name AS Item\
              ,Outstanding.Qty \
              ,UOM = ISNULL((SELECT UOM.Code FROM GM.Tbl_UOM UOM WHERE UOM.ID =SOD.UOMID),'')\
              ,SOD.Rate\
              ,SOD.BasicAmt As Amt\
              ,SOD.Descriptions\
              ,CASE WHEN SOD.StatusBYDate IS NULL THEN ( CONVERT (TIME,\
                CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) / 60 / 60)   AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) / 60 % 60) AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) % 60) AS NVARCHAR(50))))\
            ELSE\
              (CONVERT (TIME,\
               CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) / 60 / 60)   AS NVARCHAR(50)) + ':'\
              + CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) / 60 % 60) AS NVARCHAR(50)) + ':'\
              + CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) % 60) AS NVARCHAR(50))))\
            END \
              AS TimeConsume\
              ,SOM.Remarks\
                ,ISNULL(FOD.NoPax_Adult,0) + ISNULL(FOD.NoPax_Child,0) AS Pax\
                ,CONVERT(BIT,CASE WHEN SOD.StatusID=10 THEN 1 ELSE 0 END ) AS IsDelivered\
                ,ISNULL(SOD.StatusID,4) AS StatusID\
            FROM [SALES].[Tbl_SOD] SOD  \
            LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID  \
            LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
            LEFT OUTER JOIN [GM].[Tbl_Product] P ON SOD.PID = P.ID\
            LEFT OUTER JOIN [SALES].[Tbl_FNBOrderAdditional] FOD ON FOD.SOMID= SOD.SOMID  \
            LEFT OUTER JOIN GM.Tbl_ClassMaster CLS ON SOM.CLSID3=CLS.ID\
            WHERE  SOM.CLSID3  is not null   AND P.GroupID=@GroupID AND\
                Outstanding.Qty > 0  AND ISNULL(SOD.StatusID,0) <> 3  AND SOM.CancelByID IS NULL \
            --ORDER BY SOM.VDate DESC,SOM.VTime  DESC\
          UNION \
          select \
             SOD.ID AS OrderID\
              ,SOM.VNo AS OrderNo\
              ,CONVERT(INT,SOD.Sno) As OrderSno\
              ,SOM.VDate As OrderDate\
              ,CLS.NAME AS TableNo\
              ,SOM.VTime AS OrderTime\
              ,P.Name AS Product\
              ,SOD.Qty \
              ,UOM = ISNULL((SELECT UOM.Code FROM GM.Tbl_UOM UOM WHERE UOM.ID =SOD.UOMID),'''')\
              ,SOD.Rate\
              ,SOD.BasicAmt As Amt\
              ,SOD.Descriptions\
              ,CASE WHEN SOD.StatusBYDate IS NULL THEN ( CONVERT (TIME,\
                CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) / 60 / 60)   AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) / 60 % 60) AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, SOM.VTime, CONVERT(TIME,GETDATE())) % 60) AS NVARCHAR(50))))\
              ELSE\
                (CONVERT (TIME,\
                  CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) / 60 / 60)   AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) / 60 % 60) AS NVARCHAR(50)) + ':'\
                + CAST(ABS(DATEDIFF(second, CONVERT (TIME,SOD.StatusBYDate), SOM.VTime) % 60) AS NVARCHAR(50))))\
              END \
                AS TimeConsume\
              ,SOM.Remarks\
                ,ISNULL(FOD.NoPax_Adult,0) + ISNULL(FOD.NoPax_Child,0) AS Pax\
                ,CONVERT(BIT,CASE WHEN SOD.StatusID=10 THEN 1 ELSE 0 END ) AS IsServed\
                ,ISNULL(SOD.StatusID,4) AS StatusID\
            FROM [SALES].[Tbl_SOD] SOD  \
            LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID  \
          LEFT OUTER JOIN [SALES].[Tbl_FNBOrderAdditional] FOD ON FOD.SOMID= SOD.SOMID \
          LEFT OUTER JOIN [GM].[Tbl_Product] P ON SOD.PID = P.ID\
           LEFT OUTER JOIN GM.Tbl_ClassMaster CLS ON SOM.CLSID3=CLS.ID\
           WHERE  SOM.CLSID3  is not null   AND P.GroupID=@GroupID AND\
              ISNULL(SOD.StatusID,0) Not IN(3, 10 )  AND SOM.CancelByID IS NULL \
            ORDER BY SOM.VDate DESC,SOM.VTime  DESC").then(function(recordset){
      console.dir(recordset);
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      res.sendStatus(500);
      // ... query error checks 
    });
});  

app.get('/api/v1/getCategory',function(req,res){
  var request=new sql.Request(cp);
  request.query(" ;with Cte as (\
    SELECT \
    0 as MenuID\
    ,'Default' AS MenuName\
    ,P.ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
    when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
    else 'Other' End as Category\
      ,20 as MakingTime\
    \
    \
    FROM GM.Tbl_Product P\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
    union all\
    SELECT \
    1 as MenuID\
    ,'Today Special' AS MenuName\
    ,P.ID\
    ,P.Name\
    ,P.Descriptions\
    ,Convert(decimal(19,2),ISNULL(P.SalesPrice,0.0000)) SalesPrice\
    ,ISNULL(UOM.ID,0) AS UOMID\
    ,ISNULL(UOM.Code,'') AS UOM\
    \
    ,ISNULL(PG.id,0) AS [GroupId]\
    ,ISNULL(PG.Name,'None') AS [GroupName]\
    \
    ,ISNULL(PAG.id,0) AS [AdditionalGroupId]\
    ,ISNULL(PAG.Name,'None') AS [AdditionalGroupName]\
    \
    ,case when Row_Number() over (order by  P.Name) %3 =0 then 'Veg' \
    when Row_Number() over (order by  P.Name) %4 =0 then 'NonVeg' \
    else 'Other' End as Category\
      \
    ,30 as MakingTime\
    \
    FROM GM.Tbl_Product P\
    LEFT OUTER JOIN GM.TBL_PRODUCTGROUP PG ON P.GROUPID=PG.ID\
    LEFT OUTER JOIN GM.Tbl_ProductAdditionalGroup PAG ON P.AddGroupID = PAG.ID\
    LEFT OUTER JOIN GM.Tbl_UOM UOM ON P.UOMID =UOM.ID\
    WHERE P.InActive = 0 \
    AND P.GroupID IN (SELECT [ProductGroupID] FROM  [GM].[Tbl_CounterProductGroupMapping] C WHERE C.CounterID = 262) \
    \
    ) select distinct Category from cte").then(function(recordset){
      console.dir(recordset);
      res.send(recordset);
    }).catch(function(err) {
      console.log(err);
      res.sendStatus(500);
      // ... query error checks 
    });
  });



app.post('/api/v1/takeorder',function(req,res){
  var TableID=req.body.TableID;
  var WaiterID=req.body.WaiterID;
  var CounterID=req.body.CounterID;
  var OutletID=req.body.OutletID;
  var AddClass1ID=req.body.AddClass1ID;
  var AddClass2ID=req.body.AddClass2ID;
  var AddClass3ID=req.body.AddClass3ID;
  var AddClass4ID=req.body.AddClass4ID;
  var AddClass5ID=req.body.AddClass5ID;
  var FYID=req.body.FYID;
  var UnitID=req.body.UnitID;
  var DID=req.body.DID;
  var NumId=req.body.NumId;
  var UserId=req.body.UserId;
  var PCInfo=req.body.PCInfo;
  var DetailsXml=req.body.DetailsXml;

    // sql.connect("mssql://sa:123@localhost/BP725001").then(function() {
      var request=new sql.Request(cp);
      request.input('OutletID', sql.Int, OutletID);
      request.input('TableID', sql.Int, TableID);
      request.input('WaiterID', sql.Int, WaiterID);
      request.input('CounterID', sql.Int, CounterID);
      request.input('AddClass1ID', sql.Int, AddClass1ID);
      request.input('AddClass2ID', sql.Int, AddClass2ID);
      request.input('AddClass3ID', sql.Int, AddClass3ID);
      request.input('AddClass4ID', sql.Int, AddClass4ID);
      request.input('AddClass5ID', sql.Int, AddClass5ID);
      request.input('FYID', sql.Int, FYID);
      request.input('UnitID', sql.Int, UnitID);
      request.input('DID', sql.Int, DID);
      request.input('NumId', sql.TINYINT, NumId);
      request.input('UserId', sql.TINYINT, UserId);
      request.input('PCInfo', sql.VarChar(50), PCInfo);
      request.input('DetailsXml', sql.VarChar(200), DetailsXml);
      request.output('OutId', sql.Int);
      request.output('OutMessage', sql.Nvarchar);
      request.execute('[SALES].[Usp_FNBO_Tab_UI]').then(function(recordsets) {
        console.dir(recordsets);
        // console.log(returnValue);
        // console.log(request.parameters.OutMessage.value);
        // console.log(request.parameters.OutID.value);
        res.sendStatus(200);
      }).catch(function(err) {
        // ... execute error checks
        res.sendStatus(500);
        console.log(err); 
      });
    });

app.use("/static", express.static(__dirname + '/static'));

app.post('/api/v1/changepassword',function(req,res){
  var id=req.body.id;
  var newpassword=req.body.password;

  var request=new sql.Request(cp);
  request.input('password',sql.NChar,newpassword);
  request.input('id',sql.Int,id);
  request.query("UPDATE GM.Tbl_ClassMaster SET [Password] = CONVERT(VARBINARY,ISNULL(NULLIF(@password,''),'000') )\
    WHERE Id = @id").then(function(recordset) {
      console.log('password changed by id '+id);
      res.sendStatus(200);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  });

app.post('/api/v1/changePasscode',function(req,res){
  console.log(req.body);
  var waiterID=req.body.waiterID;
  var passcode=req.body.passcode;

  var request=new sql.Request(cp);
  request.input('Passcode',sql.NChar,passcode);
  request.input('WaiterID',sql.Int,waiterID);

  request.query("IF NOT EXISTS (select ID from gm.tbl_classmaster where Passcode = convert(varbinary(max),@Passcode))\
    BEGIN\
      Update gm.tbl_classmaster set PassCode=convert(varbinary(max),@Passcode) where ID=@WaiterID\
      select 1 ID\
    END\
    ELSE\
    BEGIN\
      select 0 ID\
    END").then(function(recordsets){
    res.status(200).json(recordsets[0]);
    console.log(recordsets[0]);
  }).catch(function(err){
      console.log(err);
      res.status(500).json({message:err.message});
  });
});

app.post('/api/v1/changePasscodeCashier',function(req,res){
  console.log(req.body);
  var waiterID=req.body.waiterID;
  var passcode=req.body.passcode;

  var request=new sql.Request(cp);
  request.input('Passcode',sql.NChar,passcode);
  request.input('WaiterID',sql.Int,waiterID);

  request.query("IF NOT EXISTS (select ID from gm.Tbl_UserMaster where Passcode = convert(varbinary(max),@Passcode))\
    BEGIN\
      Update gm.Tbl_UserMaster set PassCode=convert(varbinary(max),@Passcode) where ID=@WaiterID\
      select 1 ID\
    END\
    ELSE\
    BEGIN\
      select 0 ID\
    END").then(function(recordsets){
    res.status(200).json(recordsets[0]);
    console.log(recordsets[0]);
  }).catch(function(err){
      console.log(err);
      res.status(500).json({message:err.message});
  });
});


app.post('/api/v1/tableTransfer',function(req,res){
  var sourceid=req.body.sourceid;
  var destinationid=req.body.destinationid;
  var waiterID=req.body.waiterID;
  var printerName=req.body.printerName || "";

  var request=new sql.Request(cp);
  request.input('sourceTableId',sql.Int,sourceid);
  request.input('destinationTableId',sql.Int,destinationid);
  request.input('userID',sql.Int,config.common.UserID);
  request.input('waiterID',sql.Int,waiterID);
  request.query("SET XACT_ABORT ON \
    BEGIN TRANSACTION\
    DECLARE @ID TABLE (ID INT )  \
    \
    Declare @TableSegment int \
    SELECT @TableSegment = ClassTypeID FROM GM.Tbl_ClassMaster WHERE ID = @sourceTableId \
    \
    \
    INSERT INTO @ID\
    SELECT DISTINCT\
    SOM. ID\
    FROM [SALES].[Tbl_SOD] SOD  \
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID         \
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    WHERE  CASE @TableSegment \
    WHEN 1 THEN SOM.CLSID1 \
    WHEN 2 THEN SOM.CLSID2 \
    WHEN 3 THEN SOM.CLSID3 \
    WHEN 4 THEN SOM.CLSID4 \
    WHEN 5 THEN SOM.CLSID5 \
    WHEN 6 THEN SOM.CLSID6\
    WHEN 7 THEN SOM.CLSID7\
    WHEN 8 THEN SOM.CLSID8\
    WHEN 9 THEN SOM.CLSID9\
    END = @sourceTableId AND Outstanding.Qty > 0\
    \
    \
    \
    \
    UPDATE [SALES].[Tbl_SOM] SET CLSID3 = @destinationTableId\
    WHERE ID IN (\
    SELECT DISTINCT\
    SOM. ID\
    FROM [SALES].[Tbl_SOD] SOD  \
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID         \
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    WHERE  CASE @TableSegment \
    WHEN 1 THEN SOM.CLSID1 \
    WHEN 2 THEN SOM.CLSID2 \
    WHEN 3 THEN SOM.CLSID3 \
    WHEN 4 THEN SOM.CLSID4 \
    WHEN 5 THEN SOM.CLSID5 \
    WHEN 6 THEN SOM.CLSID6\
    WHEN 7 THEN SOM.CLSID7\
    WHEN 8 THEN SOM.CLSID8\
    WHEN 9 THEN SOM.CLSID9\
    END = @sourceTableId AND Outstanding.Qty > 0)\
    \
    DECLARE @Code NVARCHAR(64) \
    EXEC Usys.Usp_GetCode 'SALES.Tbl_FNBOrderTransfer', 'OTCode','','TF',@Code OUTPUT  \
    INSERT INTO [SALES].[Tbl_FNBOrderTransfer]\
    (\
    SOMID,SODID,OldSOMID,OldSODID,NewTableID ,OldTableID,UserID ,WaiterID ,Messagess,OTCode ,StatusID,ActionDateTime,PrintNo\
    )\
    SELECT \
    D.SOMID,D.ID,   D.SOMID,D.ID,@destinationTableId,@sourceTableId,@UserId,@waiterID,NULL, @Code,13,GETDATE(),NULL\
    FROM [SALES].[Tbl_SOD] D WHERE D.SOMID IN(SELECT ID FROM @ID)  ORDER BY  D.SOMID,SNO      \
    \
    SELECT TOP 1 ID FROM [SALES].[Tbl_FNBOrderTransfer] WHERE OTCode =@Code  AND ISNULL(StatusID,0)=13 ORDER BY ID\
    \
    \
    COMMIT\
    SET XACT_ABORT OFF").then(function(recordset) {
      console.log(recordset);
      console.log('table transferred to'+destinationid);
        //TODO: print about transfer
        print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:302, VoucherNumber: recordset[0].ID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
         ,DataBaseName:config.db.database,PrinterName:printerName,NoOfCopy:1}
         , function (error, result) {
          if (error){
            console.log(error);
          }else{ 
            console.log("printer:"+printerName);
            console.log(result);
          }
        });

        res.sendStatus(200);

      }).catch(function(err) {
        console.log(err);
        status='error';
        res.sendStatus(500);
      // ... query error checks 
    });

    });

app.post('/api/v1/seatTransfer',function(req,res){

  var newTableID=req.body.newTableID;
  var waiterID=req.body.waiterID;
  var remarks=req.body.remarks;
  var seatNo = req.body.seatNo;
  var printerName=req.body.printerName || "";

  var request = new sql.Request(cp);
  request.input('SeatNo',sql.Char,seatNo);
  request.input('NewTableID',sql.Int,newTableID);
  request.input('WaiterID',sql.Int,waiterID);
  request.input('UserID',sql.Int,config.common.UserID);
  request.input('Remarks',sql.Char,remarks);

    request.query("SET XACT_ABORT ON \
    BEGIN TRANSACTION\
    DECLARE @ID int  ,@OldTableID int \
    SELECT @ID = ID,@OldTableID=[CLSID3] FROM SALES.Tbl_SOM WHERE No_Qty=@seatNo \
    \
    UPDATE [SALES].[Tbl_SOM] SET [CLSID3]=@NewTableID WHERE No_Qty=@seatNo\
    UPDATE [Audit].[Tbl_SOM_Audit] SET [CLSID3]=@NewTableID WHERE VNO=@voucherNo\
    \
    DECLARE @Code NVARCHAR(64) \
    EXEC Usys.Usp_GetCode 'SALES.Tbl_FNBOrderTransfer', 'OTCode','','TF',@Code OUTPUT  \
    \
    INSERT INTO [SALES].[Tbl_FNBOrderTransfer]\
    (\
    SOMID,SODID,OldSOMID,OldSODID,NewTableID ,OldTableID,UserID ,WaiterID ,Messagess,OTCode ,StatusID,ActionDateTime,PrintNo\
    )\
    SELECT \
    @ID,D.ID,  @ID,D.ID,@NewTableID,@OldTableID,@UserId,@WaiterID,@REMARKS,@Code,12,GETDATE(),NULL\
    FROM [SALES].[Tbl_SOD] D WHERE D.SOMID=@ID  ORDER BY SNO                \
    \
    SELECT TOP 1 ID FROM [SALES].[Tbl_FNBOrderTransfer] WHERE SOMID=@ID AND ISNULL(StatusID,0)=12  ORDER BY ID\
    \
    \
    COMMIT\
    SET XACT_ABORT OFF ").then(function(recordset) {
                        //print about transfer
                        console.log('order transferred to '+newTableID);
                        console.log(recordset);

                        print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:302, VoucherNumber: recordset[0].ID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
                          ,DataBaseName:config.db.database,PrinterName:printerName,NoOfCopy:1}
                          , function (error, result) {
                            if (error){
                              console.log(error);
                            }else{ 
                              console.log("printer:"+printerName);
                              console.log(result);
                            }
                          });

                        res.sendStatus(200);

                      }).catch(function(err) {
                        console.log(err);
                        status='error';
                        res.sendStatus(500);
    // ... query error checks 
  });

});

app.post('/api/v1/orderTransfer',function(req,res){
  var voucherNo=req.body.voucherNo;
  var newTableID=req.body.newTableID;
  var waiterID=req.body.waiterID;
  var remarks=req.body.remarks;
  var printerName=req.body.printerName || "";

  var request=new sql.Request(cp);
  request.input('VoucherNo',sql.Char,voucherNo);
  request.input('NewTableID',sql.Int,newTableID);
  request.input('WaiterID',sql.Int,waiterID);
  request.input('UserID',sql.Int,config.common.UserID);
  request.input('Remarks',sql.Char,remarks);

  request.query("SET XACT_ABORT ON \
    BEGIN TRANSACTION\
    DECLARE @ID int  ,@OldTableID int \
    SELECT @ID = ID,@OldTableID=[CLSID3] FROM SALES.Tbl_SOM WHERE VNO=@VoucherNo \
    \
    UPDATE [SALES].[Tbl_SOM] SET [CLSID3]=@NewTableID WHERE VNO=@voucherNo\
    UPDATE [Audit].[Tbl_SOM_Audit] SET [CLSID3]=@NewTableID WHERE VNO=@voucherNo\
    \
    DECLARE @Code NVARCHAR(64) \
    EXEC Usys.Usp_GetCode 'SALES.Tbl_FNBOrderTransfer', 'OTCode','','TF',@Code OUTPUT  \
    \
    INSERT INTO [SALES].[Tbl_FNBOrderTransfer]\
    (\
    SOMID,SODID,OldSOMID,OldSODID,NewTableID ,OldTableID,UserID ,WaiterID ,Messagess,OTCode ,StatusID,ActionDateTime,PrintNo\
    )\
    SELECT \
    @ID,D.ID,  @ID,D.ID,@NewTableID,@OldTableID,@UserId,@WaiterID,@REMARKS,@Code,12,GETDATE(),NULL\
    FROM [SALES].[Tbl_SOD] D WHERE D.SOMID=@ID  ORDER BY SNO                \
    \
    SELECT TOP 1 ID FROM [SALES].[Tbl_FNBOrderTransfer] WHERE SOMID=@ID AND ISNULL(StatusID,0)=12  ORDER BY ID\
    \
    \
    COMMIT\
    SET XACT_ABORT OFF ").then(function(recordset) {
                        //print about transfer
                        console.log('order transferred to '+newTableID);
                        console.log(recordset);

                        print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:302, VoucherNumber: recordset[0].ID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
                          ,DataBaseName:config.db.database,PrinterName:printerName,NoOfCopy:1}
                          , function (error, result) {
                            if (error){
                              console.log(error);
                            }else{ 
                              console.log("printer:"+printerName);
                              console.log(result);
                            }
                          });

                        res.sendStatus(200);

                      }).catch(function(err) {
                        console.log(err);
                        status='error';
                        res.sendStatus(500);
    // ... query error checks 
  });

                    });

app.get("/api/v1/narration",function(req,res){
  var request=new sql.Request(cp);
  request.query("SELECT Narration, NM.TypeId FROM GM.Tbl_NarrationMaster NM WHERE NM .InActive = 0 ").then(function(recordset){
    res.send(recordset);
  });
});

app.get("/api/v1/guestno",function(req,res){
  var tableID=req.headers['tableid'];

  var request=new sql.Request(cp);
  request.input('TableID',sql.Char,tableID);
  request.query("WITH CTE  AS (\
    SELECT   \
    Outstanding.Qty \
    ,SOM.CLSID3 \
    AS TableID\
    ,FOD.* \
    FROM [SALES].[Tbl_SOD] SOD \
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID \
    LEFT OUTER JOIN [SALES].[Tbl_FNBOrderAdditional] FOD ON FOD.SOMID= SOD.SOMID \
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    \
    \
    ) select TOP 1 NoPax_Adult ,NoPax_Child,BillingGLID from CTE WHERE TableID=@TableID AND Qty > 0 and somid is not null Order by somid desc").then(function(recordset){
      res.send(recordset);
    });
  });

app.post('/api/v1/itemtransfer',function(req,res){
  var voucherNo=req.body.voucherNo;
  var sn=req.body.sn;
  var remarks=req.body.remarks;
  var newTableName=req.body.newTableName;
  var newTableID=req.body.newTableID;
  var userID=req.body.userID;
  var waiterID=req.body.waiterID;
  var printerName=req.body.printerName || "";
  var seatNo = req.body.seatNo;
  console.log(seatNo);
  
    //check with tedious
    request1 = new Request('[SALES].[USP_FNBO_TRANSFER_TAB_UI]', function(err, rowCount) {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else {
        console.log(rowCount + ' rows');
        console.log("item transferred to "+newTableName);

        res.sendStatus(200);
      }
    });
  
    var TYPES = require('tedious').TYPES;
    request1.addParameter('VoucherNo',TYPES.Char,  voucherNo);
    request1.addParameter('Sno',TYPES.Int,  sn);
    request1.addParameter('REMARKS',TYPES.Char,  remarks);
    request1.addParameter('NewTableName',TYPES.Char,  newTableName);
    request1.addParameter('NewTableID',TYPES.Int,  newTableID);
    request1.addParameter('UserId',TYPES.Int,  config.common.UserID);
    request1.addParameter('WaiterID',TYPES.Int, waiterID);
    request1.addParameter('SeatNo',TYPES.Int, seatNo);

    request1.on('row', function(columns) {
    	// console.log(columns);
      columns.forEach(function(column) {

        console.log("column value"+column.value);
        !column.value || print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:302, VoucherNumber: Number (column.value), ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
          ,DataBaseName:config.db.database,PrinterName:printerName,NoOfCopy:1}
          , function (error, result) {
            if (error){
              console.log(error);
            }else{ 
              console.log("printer:"+printerName);
              console.log(result);
            }
          });

      });
    });

    connection.callProcedure(request1);

  });

app.post('/api/v1/orderCancellation',function(req,res){
  console.log(req.body);
  var reason=req.body.reason;
  var orderNo=req.body.orderno;
  var waiterID=req.body.waiterID;
  var printerName=req.body.printerName;
  
  if(!!printerName){
    printerName="";
  }

  var statusID = Number(req.body.statusID || 3);

  var sn=req.body.sn;

  var request=new sql.Request(cp);
  request.input('reason',sql.Char,reason);
  request.input('sno',sql.Int,sn);
  request.input('orderNo',sql.Char,orderNo);
  request.input('waiterID',sql.Int,waiterID);
  request.input('statusID',sql.Int,statusID);
  
  request.query("UPDATE SALES.Tbl_SOD SET StatusID = @statusID,StatusRemarks=@reason,StatusByDate=getdate(),StatusByWaiterID=@waiterID \
    WHERE SOMID=(SELECT ID FROM SALES.Tbl_SOM WHERE VNO=@orderNo  AND Sno=@sno)\
    SELECT ID FROM SALES.TBL_SOD WHERE SOMID=(SELECT ID FROM SALES.Tbl_SOM WHERE VNO=@orderNo) AND Sno=@sno").then(function(recordset) {
      console.log('Order Cancelled '+orderNo);
    //print about cancellation
    print({UserID:config.common.UserID,UnitID:config.common.UnitID,type:284, VoucherNumber: recordset[0].ID, ServerName: config.Server,ServerUserName:config.db.userName,ServerPassword:config.db.password
      ,DataBaseName:config.db.database,PrinterName:printerName,NoOfCopy:1}
      , function (error, result) {
        if (error){
          console.log(error);
        }else{
          console.log("printer:"+printerName);
          console.log(result);
        }
      });
    console.log(recordset);
    res.sendStatus(200);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.get('/api/v1/billDetails',function(req,res){
  var tableID=req.headers['tableid'];

  var request=new sql.Request(cp);
  request.input('tableID',sql.Char,tableID);

  request.query(";WITH CTE  AS (\
    SELECT   \
    SOM.ID AS SOMID\
    ,SOD.ID AS SODID\
    ,SOM.VNo AS OrderNo\
    ,SOD.Sno As OrderSno\
    ,cast(SOD.No_Qty as INT )AS Seat\
    ,SOM.RefVno AS OrderRefNo\
    ,SOM.VDate As OrderDate\
    ,OrderMiti = (SELECT M_Miti FROM Usys.Tbl_DateMiti DM WHERE DM.M_Date = SOM.VDate)\
    ,SOM.VTime AS OrderTime\
    ,P.GroupID                                    \
    ,G.Name as [Group]\
    ,ISNULL(P.CategoryID1,0) as CategoryID\
    ,ISNULL(C.Name,'NONE') as Category\
    ,P.ID AS PID\
    ,P.Name AS Product\
    ,Outstanding.Qty \
    ,ISNULL(SOD.UOMID,0) UOMID\
    ,UOM = ISNULL((SELECT UOM.Code FROM GM.Tbl_UOM UOM WHERE UOM.ID =SOD.UOMID),'')\
    ,SOD.Rate Rate\
    ,SOD.Rate  * Outstanding.Qty  As Amt\
    ,SOD.Descriptions\
    , SOM.CLSID3 \
    AS TableID\
    FROM [SALES].[Tbl_SOD] SOD  \
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID         \
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    LEFT OUTER JOIN [GM].[Tbl_Product] P ON SOD.PID = P.ID\
    LEFT OUTER JOIN [GM].[Tbl_ProductGroup] G ON P.GroupID = G.ID\
    LEFT OUTER JOIN  [GM].[Tbl_ProductCategoryMaster] C on P.categoryId1 =C.id\
    WHERE  ISNULL(SOD.StatusID,0) <> 3  AND SOM.CancelByID IS NULL \
    )\
    SELECT * FROM CTE WHERE TableID=@TableID AND Qty > 0\
    ORDER BY SOMID,OrderSno ").then(function(recordset) {
      console.log('Bill Details ');
      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  });

app.get('/api/v1/customer',function(req,res){

  var request=new sql.Request(cp);
  request.query("SELECT  [M].[ID], [M].[Name] FROM [GM].[Tbl_Ledger] AS M WHERE TypeID IN (15,16,18,20) AND InActive = 0").then(function(recordset) {

    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

});

app.get('/api/v1/party',function(req,res){

  var request=new sql.Request(cp);
  request.query("SELECT  G.ID,Name,ISNULL(CPerson,'') AS CPerson,ISNULL(AddressValue,'') AS AddressValue,ISNULL(PhoneValue,'') AS PhoneValue\
    ,ISNULL(EmailValue,'') AS EmailValue,ISNULL(URLValue,'') AS URLValue\
    ,ISNULL(C.VatPanNo,'') AS VatPanNo\
    FROM GM.Tbl_ledger G\
    LEFT OUTER JOIN GM.TBL_CVAddInfo C ON G.ID=C.GLID \
    WHERE TypeID IN (18,20) AND InActive = 0").then(function(recordset) {

      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  });

app.get('/api/v1/privilege',function(req,res){

  var request=new sql.Request(cp);
  request.query("Select Id AS ID,Name  as CardNo , DiscountRate From GM.tbl_PrevilageCard").then(function(recordset) {

    res.send(recordset);

  }).catch(function(err) {
    console.log(err);
    status='error';
    res.sendStatus(500);
      // ... query error checks 
    });

}); 

app.get('/api/v1/billPrintDetails',function(req,res){

 var request=new sql.Request(cp);
 request.query("select TOP 50 sm.ID,VNo,gm.Name as TableName,\
  cm.Name as WaiterName,NetAmt,VDate,M_Miti as Miti from sales.tbl_sbm as sm\
  left outer join USys.Tbl_DateMiti dm on sm.VDate=dm.m_Date\
  left outer join gm.tbl_classmaster cm on sm.clsid4=cm.ID\
  left outer join gm.tbl_classmaster gm on sm.clsid3=gm.ID\
  order by id DESC").then(function(recordset){
    res.send(recordset);
  }).catch(function(err){
    console.log(err);
    res.sendStatus(500);
  });
});

app.get('/api/v1/orderPrintDetails',function(req,res){
 var request=new sql.Request(cp);
 request.query("select TOP 50 sm.ID,VNo,gm.Name as TableName,\
  cm.Name as WaiterName,NetAmt,VDate,M_Miti as Miti from sales.tbl_som as sm\
  left outer join USys.Tbl_DateMiti dm on sm.VDate=dm.m_Date\
  left outer join gm.tbl_classmaster cm on sm.clsid4=cm.ID\
  left outer join gm.tbl_classmaster gm on sm.clsid3=gm.ID\
  order by id DESC").then(function(recordset){
    res.send(recordset);
  }).catch(function(err){
    console.log(err);
    res.sendStatus(500);
  });
});

app.get('/api/v1/currentPAX',function(req,res){

  var request=new sql.Request(cp);
  request.query("; with cte as (SELECT SOM.CLSID3 , MAX(A.NoPax_Adult) AS PaxAdult ,MAX(A.NoPax_Child) AS PaxChild FROM [SALES].[Tbl_SOD] SOD\
    LEFT OUTER JOIN [SALES].[Tbl_SOM] SOM ON SOM.ID= SOD.SOMID\
    LEFT OUTER JOIN SALES.Tbl_FNBOrderAdditional A ON SOM.ID=A.SOMID\
    LEFT OUTER JOIN [SALES].[Ufn_SO_Outstanding](0,0) Outstanding ON SOD.ID=Outstanding.ID\
    LEFT OUTER JOIN [GM].[Tbl_Product] P ON SOD.PID = P.ID WHERE Outstanding.Qty > 0\
    group by SOM.CLSID3 )\
    select sum(isnull(PaxAdult,0) + isnull(PaxChild,0)) as NUMBEROFPAX from cte").then(function(recordset) {

      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  }); 

  app.get('/api/v1/customerSystemControl',function(req,res){
    console.log("/api/v1/customerSystemControl not found");
  });



  //for GET /api/v1/getModifier
  app.get('/api/v1/getModifier',function(req,res){

    // var request=new sql.Request(cp);
    // request.query("select * from gm.Tbl_BillingTerm").then(function(recordset) {
  
    //     res.send(recordset);
  
    //   }).catch(function(err) {
    //     console.log(err);
    //     status='error';
    //     res.sendStatus(500);
    //     // ... query error checks 
    //   });

    console.log("/api/v1/getModifier not found");
  
    });
  



  //totalPAX
app.get('/api/v1/totalPAX',function(req,res){

  var request=new sql.Request(cp);
  request.query("SELECT SUM(ISNULL(F.NoPax_Adult,0) + ISNULL(F.NoPax_Child,0)) AS NUMBEROFPAX FROM SALES.Tbl_FNBBillAdditional F\
    LEFT OUTER JOIN SALES.Tbl_SBM M ON M.ID=F.SBMID WHERE M.VDATE=CONVERT(DATE,GETDATE()) AND (M.CancelByID IS NULL )").then(function(recordset) {

      res.send(recordset);

    }).catch(function(err) {
      console.log(err);
      status='error';
      res.sendStatus(500);
      // ... query error checks 
    });

  });

  //changes on uwp
  app.get('/api/v1/customerDetails',function(req,res){
   var request = new sql.Request(cp);
   request.query("SELECT  [M].[ID], [M].[Name], [M].[Code], d.CValue as [Type] \
     FROM [GM].[Tbl_Ledger] AS M \
     left outer join usys.Tbl_ENUM_COLL as d on m.TypeID=d.ID \
     WHERE m.TypeID IN (15,16,18,20) AND m.InActive = 0").then(function(recordset){
      res.send(recordset);
    }).catch(function(err){
      console.log(err);
      status='error';
      res.sendStatus(500);
    });
  });

  app.get('/api/v1/productImage',function(req,res){
   var request=new sql.Request(cp);
   request.query("select ID,Logo from gm.tbl_product where Logo IS NOT NULL;").then(function(recordset) {
     res.status(200).json(recordset);
   }).catch(function(err) {
     console.log(err);
     status='error';
     res.status(500).send(err.message);
		  // ... query error checks 
		});
 });	

  app.put('/api/v1/tabledesign',function(req,res){

   var description=req.body.description;
   var design=req.body.design;
   var code=req.body.code;
   var groupID=req.body.groupID;

   var request=new sql.Request(cp);
   request.input('design',sql.Xml ,design);
   request.input('description',sql.NChar ,description);
   request.input('code',sql.NChar,code);
   request.input('groupID',sql.Int,groupID);
   request.query("if exists(select * from gm.tbl_tablelayout where GroupID=@groupID)\
    update [GM].[tbl_tablelayout] set code=@code,Description=@description,design=@design,groupID=@groupID where groupID=@groupID\
    else \
     insert into [GM].[tbl_tablelayout] values(@code,@description,@design,0,@groupID)").then(function(recordset) {
       console.log('design set');
       res.sendStatus(200);

     }).catch(function(err) {
       console.log(err);
       status='error';
       res.status(500).send(err.message);
		  // ... query error checks 
		});
   });

  app.get("/api/v1/waiter",function(req,res){	
    var request=new sql.Request(cp);
    query="Select ID,Name from gm.tbl_classmaster where classtypeid=4";
    request.query(query).then(function(recordsets){
     res.json(recordsets);
   });
  });

  app.get('/api/v1/decimalformat',function(req,res){
    var request=new sql.Request(cp);
    request.query("select DFQty,DFRate,DFAmount from gm.tbl_systemcontrol").then(function(recordsets){
     res.send(recordsets);
   }).catch(function(err){
     res.status(500).send(err.msg);
   });
 });
  app.get('/api/v1/BillCardInformation',function(req,res){
    console.log(req.headers);
		//var id = req.headers['BillID'];
		
		var request = new sql.Request(cp);
		request.query("SELECT BillCard = (SELECT Name FROM GM.Tbl_PrevilageCard PC \
        WHERE PC.ID=AD.BillCardID),SBT.SBMID as ID ,SBT.TRate CardDiscountRate ,\
        ABS(SBT.TAmt) CardDiscountAmount FROM SALES.Tbl_FNBBillAdditional AD LEFT OUTER JOIN SALES.Tbl_SBT SBT ON \
        SBT.SBMID = AD.SBMID WHERE BTID = (SELECT TOP 1 ID FROM GM.Tbl_BillingTerm WHERE NAME LIKE 'DISCOUNT%') AND TYPEID = 117"
      ).then(function(recordset){
			res.send(recordset);
		}).catch(function(err){
			status='error';
			res.sendStatus(500);
   });
	});

  app.get('/api/v1/BillReceiptNoOfPax',function(req,res){
    var tableID=req.headers['tableid'];

    var request=new sql.Request(cp);
    request.input('tableID',sql.Char,tableID); 

  request.query('select * from SALES.Tbl_FNBOrderAdditional where SOMID = (SELECT top 1 SOMID \
       FROM  [SALES].[Ufn_SO_Outstanding](0,0) Outstanding \
       LEFT OUTER JOIN SALES.Tbl_SOM SOM ON Outstanding.SOMID = SOM.ID \
       WHERE   SOM.CLSID3 =@tableID \
       order by SOMID desc)').then(function(recordset){
       res.send(recordset);
      }).catch(function(err){
    status='error';
    res.sendStatus(500);
   });
  });
  // catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  process.on('uncaughtException', function (error) {
    console.log(error.stack);
  });

  module.exports = app;
