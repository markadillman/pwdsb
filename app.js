var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var styles = require('stylus');
var SVG = require('svg.js');
var xmlParse = require('xml2js').parseString;
const util = require('util');
var MongoClient = require('mongodb').MongoClient, assert = require('assert');
//database url
var dbUrl = 'mongodb://127.0.0.1:27017/test'

var index = require('./routes/index');
var users = require('./routes/users');

var app = express();

//make process trackable
process.title = "ariesApp";

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const coordinatePairs = {"ul": {"x":-1,"y":-1,"canvasId":"aboveLeftDivCanvas"},//------upper left ("ul")
					     "uc": {"x":0,"y":-1,"canvasId":"aboveDivCanvas"},     //------upper middle ("uc")
					     "ur": {"x":1,"y":-1,"canvasId":"aboveRightDivCanvas"},//------upper right ("ur")
					     "cl": {"x":-1,"y":0,"canvasId":"leftDivCanvas"},      //------center left ("cl")
					     "cm": {"x":0,"y":0,"canvasId":"svgCanvas"},           //------center middle ("cm") <-dummy for index loops
					     "cr": {"x":1,"y":0,"canvasId":"rightDivCanvas"},      //------center right ("cr")
					     "bl": {"x":-1,"y":1,"canvasId":"belowLeftDivCanvas"}, //------bottom left ("bl")
					     "bm": {"x":0,"y":1,"canvasId":"belowDivCanvas"},      //------bottom middle ("bm")
					     "br": {"x":1,"y":1,"canvasId":"belowRightDivCanvas"}  //------bottom right ("br")
					};
					//all coordinates below are actually adjustment factors and not hard coded coords
const initPullPairs = { "-2,-2":{"x":-2,"y":-2},
						"-2,-1":{"x":-2,"y":-1},
						"-2,0":{"x":-2,"y":0},
						"-2,1":{"x":-2,"y":1},
						"-2,2":{"x":-2,"y":2},
						"-1,-2":{"x":-1,"y":-2},
						"-1,-1":{"x":-1,"y":-1},
						"-1,0":{"x":-1,"y":0},
						"-1,1":{"x":-1,"y":1},
						"-1,2":{"x":-1,"y":2},
						"0,-2":{"x":0,"y":-2},
						"0,-1":{"x":0,"y":-1},
						"0,0":{"x":0,"y":0},
						"0,1":{"x":0,"y":1},
						"0,2":{"x":0,"y":2},
						"1,-2":{"x":1,"y":-2},
						"1,-1":{"x":1,"y":-1},
						"1,0":{"x":1,"y":0},
						"1,1":{"x":1,"y":1},
						"1,2":{"x":1,"y":2},
						"2,-2":{"x":2,"y":-2},
						"2,-1":{"x":2,"y":-1},
						"2,0":{"x":2,"y":0},
						"2,1":{"x":2,"y":1},
						"2,2":{"x":2,"y":2},
				};
				//these are used for movement-triggered pulls to maintain a memory buffer in the client
const pullSets = {	"top pull" : {0:{"x":-2,"y":-3},1:{"x":-1,"y":-3},2:{"x":0,"y":-3},3:{"x":1,"y":-3},4:{"x":2,"y":-3}},
					"bottom pull" : {0:{"x":-2,"y":3},1:{"x":-1,"y":3},2:{"x":0,"y":3},3:{"x":1,"y":3},4:{"x":2,"y":3}},
					"left pull" : {0:{"x":-3,"y":-2},1:{"x":-3,"y":-1},2:{"x":-3,"y":0},3:{"x":-3,"y":1},4:{"x":-3,"y":2}},
					"right pull" : {0:{"x":3,"y":-2},1:{"x":3,"y":-1},2:{"x":3,"y":0},3:{"x":3,"y":1},4:{"x":3,"y":2}}
				};

//HELPER FUNCTION FOR SVG VALIDITY
function isValidSvg(svgString){
	//parse and see if there are any errors
	var xmlObject = xmlParse(svgString,function(err,result){
			//this saves from ANY malformed XML, and therefore SVG
			if (err) {
				return false;
			}
			else {
				//if there are an improper number of groups or nested tags incorrect
				if (result.svg.g.length != 2) {
					return false;
				}
				//if those groups have id's other than the valid ones (inserting non-functional groups)
				if (!(result.svg.g[0].$.id === "drawingGroup" && result.svg.g[1].$.id === "platformsGroup")){
					return false;
				}
			}
			//if here, SVG XML is valid
			return true;
	});
	return xmlObject;
}

//handle submitted tile edit requests
app.post('/edit',function(req,res){
	var xcoord = parseInt(req.body.xcoord);
	var ycoord = parseInt(req.body.ycoord);
	var pw = req.body.pw;
	var rawSVG = req.body.svg;
	//if tile coordinates are not a number or out of bounds, reject
	if (!(Number.isInteger(xcoord)&&Number.isInteger(ycoord))){
		res.status(511).send("Tile coordinates invalid or out of bounds.");
		return;
	}
	//if SVG XML is invalid or contains non-functional groups (from perspective of game engine), reject
	if (!isValidSvg(rawSVG)){
		res.status(511).send("Invalid SVG string.");
		return;
	}
	//parse out the groups. precondition verifies this is already well-formed
	//clip out everything prior to first closing xml bracket
	rawSVG = rawSVG.substring(rawSVG.indexOf('>')+1)
	//clip off the closing </svg> by removing last 6 characters from string
	rawSVG = rawSVG.slice(0,(rawSVG.length-6));
	//construct query to send to db
	var insertDoc = {};
	insertDoc['xcoord'] = xcoord;
	insertDoc['ycoord'] = ycoord;
	insertDoc['pw'] = pw;
	insertDoc['svg'] = rawSVG;
	var filter = {};
	filter['xcoord'] = xcoord;
	filter['ycoord'] = ycoord;
	console.log(util.inspect(insertDoc,false,null));
	MongoClient.connect(dbUrl,function(err,db){
		//test for errors, pop out if there are errors present
		assert.equal(null,err);
		console.log("connected succesfully to server");
		insertDocument(db,insertDoc,filter,res,insertCallback);
	});
});

var insertDocument = function(db,insertDoc,filter,res,callback){
	var collection = db.collection('tiles');
	//insert the document
	console.log("About to insert:");
	console.log(util.inspect(insertDoc));
	collection.update(filter,insertDoc,{upsert:true},function(err,result){
		if (err === null){
			console.log("Inserted tile into database");
			console.log(result);
		}
		else {
			console.log(err);
		}
		callback(db,res);
	});
}

var insertCallback = function(db,res){
	console.log("in callback");
	db.close();
	res.sendStatus(200);
}

var findDocument = function(db,query,req,res,callback,initCoords,setname){
	var collection = db.collection('tiles');
	console.log(util.inspect(query));
	collection.find(query).toArray(function(err,docs){
		//if error, pop
		assert.equal(err,null);
		//console.log("Found following records:");
		//console.log(docs);
		//console.log("Size of docs:");
		//console.log(docs.length);
		if (initCoords && setname){
			callback(db,req,res,docs,initCoords,setname);
		}
		else if (initCoords){
			callback(db,req,res,docs,initCoords);
		} else {
			callback(db,req,res,docs);
		}
	});
}

var findCallback = function(db,req,res,docs,initCoords){
	if (docs.length === 1){
		res.setHeader('Content-Type','application/json');
		console.log(docs[0]);
		res.status(200);
		res.status(200).send(JSON.stringify(docs[0]));
	}
	else if (docs.length === 0) {
		res.status(242).send("No coordinate / password matches found.");
	}
	else {
		res.status(566).send("Database error: duplicate entries.");
	}
	db.close();
}


/*this pull takes 8 sets of coordinates. Payload body format, coordinates as integer pairs
-----"ul":{<upper left coords>}
-----"um":{<upper middle coords>}
-----"ur":{<upper right coords>}
-----"cl":{<center left coords>}
-----"cr":{<center right coords>}
-----"bl":{<bottom left coords>}
-----"bm":{<bottom middle coords>}
-----"br":{<bottom right coords>}

RETURN PACKET WILL FOLLOW SAME CONVENTION IN BODY
*/
var readSurroundingsCallback = function(db,req,res,docs,initCoords){
	//initialize response object
	var responseObject = {};
	console.log("init coords");
	console.log(initCoords);
	//outer loop iterates over required response fieldsreturned matches that have been edited and are owned
	for (tile in coordinatePairs){
		console.log("tile");
		console.log(tile);
		console.log("init coords");
		console.log(initCoords);
		//inner loop iterates over returned matches that have been edited and are owned
		for (doc in docs){
			//if there are custom art assets at a given tile, add that document to the response body
			if ((docs[doc]['xcoord'] - initCoords.x == coordinatePairs[tile]['x']) &&
				 docs[doc]['ycoord'] - initCoords.y == coordinatePairs[tile]['y'])
			{
				responseObject[tile] = docs[doc];
				console.log("match found");
			}
		}
	}
	//send response
	res.setHeader('Content-Type','application/json');
	res.status(200);
	console.log("res status:");
	console.log(JSON.stringify(res._headers))
	res.status(200).send(JSON.stringify(responseObject));
}

app.post('/retrieve',function(req,res){
	var query = {};
	query['xcoord'] = req.body.xcoord;
	query['ycoord'] = req.body.ycoord;
	if (req.body.pw){
		query['pw'] = req.body.pw;
	}
	else {
		query['pw']="";
	}
	if (!(Number.isInteger(query['xcoord'])&&Number.isInteger(query['ycoord']))){
		res.status(527).send("Tile coordinates invalid or out of bounds.");
		return;
	}
	MongoClient.connect(dbUrl,function(err,db){
		//test for errors, pop out if there are errors present
		assert.equal(null,err);
		console.log("connected succesfully to server");
		//perform lookup
		findDocument(db,query,req,res,findCallback);
	});
});

app.post('/readpull',function(req,res){
	console.log(util.inspect(req.body));
	var query = {};
	var variableArray = new Array();
	//iteratively create variableArray
	var initCoords = {};
	initCoords.x = req.body.cl.x + 1;
	initCoords.y = req.body.cl.y;
	for (key in req.body){
		var tempCoords = {};
		tempCoords['xcoord'] = req.body[key]['x'];
		tempCoords['ycoord'] = req.body[key]['y'];
		variableArray.push(tempCoords);
	}
	console.log(util.inspect(variableArray));
	query['$or'] = variableArray;
	console.log(util.inspect(query));
	MongoClient.connect(dbUrl,function(err,db){
		//test for errors, pop out if there are errors present
		assert.equal(null,err);
		console.log("connected succesfully to server");
		//perform lookup
		findDocument(db,query,req,res,readSurroundingsCallback,initCoords);
	});
	return;
});

//callback function for the initial pull of 25 tile assets
var initPullCallback = function(db,req,res,docs,initCoords){
	//send response
	res.setHeader('Content-Type','application/json');
	res.status(200);
	console.log("res status:");
	console.log(JSON.stringify(res._headers));
	console.log("docs:");
	console.log(util.inspect(docs));
	console.log("response body:");
	console.log(JSON.stringify(docs));
	res.status(200).send(JSON.stringify(docs));
}

/*this pulls a block of 25 tiles surrounding the current tile. Used for origin pull
  at start of game, or when a user enacts teleportation. The data packet is simpy the
  tile cooridnate of the central tile in the 25 tile array.*/
app.post('/initpull',function(req,res){
	//log request body for debug
	console.log(util.inspect(req.body));
	//constuct query argument
	var query = {};
	var variableArray = new Array();
	var initCoords = {};
	initCoords.x = req.body.x;
	initCoords.y = req.body.y;
	for (key in initPullPairs){
		var tempCoords = {};
		//apply adjustment factor for every tile in the 25 tile buffer, then add to query
		tempCoords['xcoord'] = Number.parseInt(initCoords.x) + initPullPairs[key]['x'];
		tempCoords['ycoord'] = Number.parseInt(initCoords.y) + initPullPairs[key]['y'];
		variableArray.push(tempCoords);
	}
	console.log(util.inspect(variableArray));
	query['$or'] = variableArray;
	console.log(util.inspect(query));
	MongoClient.connect(dbUrl,function(err,db){
		//test for errors, pop out if there are errors present
		assert.equal(null,err);
		console.log("connected succesfully to server");
		//perform lookup
		findDocument(db,query,req,res,initPullCallback,initCoords);
	});
	return;
});

//callback function that populates the adjusted coordinates
var dynamicPullCallback = function(db,req,res,docs,initCoords,setname){
	console.log("init coords");
	console.log(initCoords);
	//send response
	res.setHeader('Content-Type','application/json');
	res.status(200);
	console.log("res status:");
	console.log(JSON.stringify(res._headers));
	console.log(JSON.stringify(docs));
	res.status(200).send(JSON.stringify(docs));
};

//helper function that takes a type of pull and init coords as arguments; then pulls the correct set
var pullHelper = function(req,res,setname,initCoords){
	console.log("target set:");
	console.log(util.inspect(pullSets[setname]));
	console.log();
	var query = {};
	var variableArray = new Array();
	for (var i = 0 ; i < 5 ; i += 1){
		var tempCoords = {};
		tempCoords['xcoord'] = Number.parseInt(initCoords.x) + pullSets[setname][i]['x'];
		tempCoords['ycoord'] = Number.parseInt(initCoords.y) + pullSets[setname][i]['y'];
		console.log("temp coords");
		console.log(util.inspect(tempCoords));
		variableArray.push(tempCoords);
	}
	console.log(util.inspect(variableArray));
	query['$or'] = variableArray;
	console.log(util.inspect(query));
	MongoClient.connect(dbUrl,function(err,db){
		//test for errors, pop out if there are errors present
		assert.equal(null,err);
		console.log("connected succesfully to server");
		//perform lookup
		findDocument(db,query,req,res,dynamicPullCallback,initCoords,setname);
	});
};

//multiple routes using helper function.
app.post('/pulltop',function(req,res){
	console.log(req.body);
	console.log(req.body.x);
	console.log(req.body.y);
	var initCoords = {};
	initCoords.x = req.body.x;
	initCoords.y = req.body.y;
	pullHelper(req,res,'top pull',initCoords);
});

app.post('/pullbottom',function(req,res){
	console.log(req.body);
	console.log(req.body.x);
	console.log(req.body.y);
	var initCoords = {};
	initCoords.x = req.body.x;
	initCoords.y = req.body.y;
	pullHelper(req,res,'bottom pull',initCoords);
});

app.post('/pullleft',function(req,res){
	console.log(req.body);
	console.log(req.body.x);
	console.log(req.body.y);
	var initCoords = {};
	initCoords.x = req.body.x;
	initCoords.y = req.body.y;
	pullHelper(req,res,'left pull',initCoords);
});

app.post('/pullright',function(req,res){
	console.log(req.body);
	console.log(req.body.x);
	console.log(req.body.y);
	var initCoords = {};
	initCoords.x = req.body.x;
	initCoords.y = req.body.y;
	pullHelper(req,res,'right pull',initCoords);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
