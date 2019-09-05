var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var logger = require('morgan');
var http = require('http');
var https = require('https');
var auth = require('./utils/auth.js')
var passport = require('passport');

const nano = require('nano')('http://admin:admin@localhost:5984');
const errorHandler = require('errorhandler');

var app = express();

var port = 3000;
const isProduction = true;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
//app.use(express.bodyParser());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(passport.initialize());


if(!isProduction) {
  app.use(errorHandler());
}

// Initializes our CouchDB database
async function createDB(){
  await nano.db.create('users');
  await nano.db.create('players');
  users = nano.db.use('users');

  // Design document that can search by username and email
  await users.insert({
    "views": {
      "by_username":
      { "map": function(doc) { emit(doc.username, doc._id)}},
      "by_email":
      { "map": function(doc) { emit(doc.email, doc._id)}}
    }
  },
  '_design/users'); //the _design makes nano understand this is a design document (it assumes they all have the _design/)
}

async function initializeDB(){

  /*if(body.includes('users')){
    await nano.db.destroy('users');
    await nano.db.destroy('players');
  }*/

  let body = await nano.db.list();
  if(!body.includes('users')){
    createDB();
  }
}

initializeDB();

exports.app = app;

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.listen(port, () => console.log(`Example app listening on port ${port}!`))