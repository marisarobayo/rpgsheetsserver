var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var logger = require('morgan');
var http = require('http');
var https = require('https');
var auth = require('./utils/auth.js')
var passport = require('passport');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/rpgsheets', {useNewUrlParser: true});

const errorHandler = require('errorhandler');

var app = express();

var port = process.env.PORT || 3000;
const isProduction = false;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(passport.initialize());


if(!isProduction) {
  app.use(errorHandler());
}

exports.app = app;
exports.mongoose = mongoose;

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.listen(port, () => console.log(`Example app listening on port ${port}!`))