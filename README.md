node.QProxy
===========

nodejs socks4/5, http proxy based on websocket

1. Deploy server.js to web server with websocket supported.
   include all the below files:
   ./server.js
   ./lib/*
2. Run app.js on local computer. (Change the url in app.js to the web site which deployed server.js.)
   include all the below files:
   ./app.js
   ./lib/ws-stream.js
   ./lib/simple_crypto.js
