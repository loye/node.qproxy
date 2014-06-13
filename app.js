var net = require('net'),
    io = require('./lib/socket.io_tunnel');

var url = 'http://localhost:1337';
var port = 2000;

net.createServer(function (s) {
    io.connect(url, { forceNew: true }).on('connect', function (t) {
        s.pipe(t).pipe(s);
    });
}).listen(port);

console.log('start listening on port ' + port);
console.log('remote url: ' + url);

process.on('uncaughtException', function (err) {
    console.log('[Error catched by process]' + err);
});
