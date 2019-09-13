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

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/rpgsheets', {useNewUrlParser: true});

const errorHandler = require('errorhandler');

var app = express();

var port = process.env.PORT || 3000;
const isProduction = false;
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

if(!isProduction) {
  app.use(errorHandler());
  app.use(cors());
}

exports.app = app;
exports.mongoose = mongoose;

var indexRouter = require('./routes/index');
var sheetsRouter = require('./routes/sheets');

app.use('/', indexRouter);
app.use('/', sheetsRouter);

app.listen(port, () => console.log(`Example app listening on port ${port}!`))