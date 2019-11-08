var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var logger = require('morgan');
var http = require('http');
var https = require('https');
var auth = require('./utils/auth.js')
var passport = require('passport');
const expressFileUpload = require('express-fileupload');
var fs = require('fs');
var mongoose = require('mongoose');

var IS_PRODUCTION = process.env.IS_PRODUCTION || false;
if (IS_PRODUCTION == "false"){
  IS_PRODUCTION = false;
}

var prodUri = process.env.MONGODB_URI;
const errorHandler = require('errorhandler');

var app = express();

var port = process.env.PORT || 3000;
var corsOptions = {
  origin: '*',
  optionsSuccessStatus:200
};

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
//app.use(cors(corsOptions));
app.use(passport.initialize());
app.use(expressFileUpload());

if(IS_PRODUCTION){
  app.use(cors());
  mongoose.connect(prodUri, {useNewUrlParser: true}).catch(error => console.log(error));
} else {
  mongoose.connect('mongodb://localhost/rpgsheets', {useNewUrlParser: true});
  app.use(cors());
  app.use(errorHandler());
}

exports.app = app;
exports.mongoose = mongoose;

var indexRouter = require('./routes/index');
var sheetsRouter = require('./routes/sheets');

app.use('/', indexRouter);
app.use('/', sheetsRouter);

if(!IS_PRODUCTION) {
  https.createServer({
    key: fs.readFileSync('rpgsheets.key'),
    cert: fs.readFileSync('rpgsheets.crt')
  }, app).listen(port, function (){
    console.log(`Server ready on port ${port} `);
  })
} else {
  //In heroku they supply their own certificate
  app.listen(port);
}

