var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var http = require('http');
var https = require('https');
var passport = require('passport'), LocalStrategy = require('passport-local').Strategy;
const nano = require('nano')('http://admin:admin@localhost:5984');
var crypto = require('crypto');

var app = express();

var port = 3000;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//CORS
app.use((req,res,next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Allow', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
})

// Login strategy with Passport
passport.use(new LocalStrategy(
  function(username, password, done) {
    users = nano.db.use('users');
    users.view('users', 'by_username', {
      'key': username
    }, function(err, user){
      if(err){
        return done(err);
      }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      users.get(user.rows[0].id, function(err, user){
        if(err){
          return done(err);
        }
        if (!validPassword(user, password)) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user); //TODO debe haber un error aquí porque falla al autenticar, quizás es porque user no es un username sino un objeto?
      })
      return done(err);
    })
  }
));

function validPassword(user, password){
  return user.passwordHash == sha512(password, user.passwordSalt)
}

function sha512(password, salt){
  var hash = crypto.createHmac('sha512', salt);
  hash.update(password);
  var value = hash.digest('hex');
  return value;

}

app.use(passport.initialize());

// Initializes the database
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

/*module.exports = function(){
  return {
    app: app,
    sha512: sha512
  }
}*/

exports.app = app;
exports.sha512 = sha512;

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.listen(port, () => console.log(`Example app listening on port ${port}!`))