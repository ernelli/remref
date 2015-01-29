var port = 8087;

var http = require('http');
var url = require('url');
var querystring = require('querystring');

var server = http.createServer(requestHandler);
  
// attach socket IO to webserver.
var io = require("socket.io")(server);

server.listen(port); 

// server is a simple request reply router

var txid = 1;
var clientid = 1;

// map of client id<->socket
var clients = {};

// map of pending requests, txid<->txid
var requests = {};

io.on('connection', function(socket) {
    console.log("client connected");
    socket.on('init', function(params) {
        var id = (params && params.clientid) || (""+clientid++);

        console.log("client sent init, id: " + id);
        clients[id] = socket;
        console.log("emit init response: " + id);
        socket.emit('init', { clientid: id });
    });

    // route request to client socket identified by params.client
    socket.on('request', function(params) {
        //console.log("request: ");
        var client = params.client;

        if(clients[client]) {

            requests[txid] = function(reply) {
                //{ txid: params.txid, socket: socket, timestamp: Date.now() };
                socket.emit('reply', { txid: params.txid, message: reply.message });                
            }

            clients[client].emit('request', { txid: txid, message: params.message});
            txid++;
        } else {
            socket.emit('reply', { txid: params.txid, error: "Invalid target client: " + params.client} );
        }
    });
    
    // route reply back to initiating client through request callback
    socket.on('reply', function(params) {
        var request = requests[params.txid];
        if(request) {
            delete requests[params.txid];
            request(params);
            //request.socket.emit('reply', { txid: request.txid, message: params.message });
        }
    });
              
});

function requestHandler(req, res) {

    req.entity_body = "";
    req.on('data', function(chunk) {
        req.entity_body += chunk;
    });

    req.on('end', function() {
        req.ended = true;
        
        // http://xxxx.dd/request
        var urlparts = url.parse(req.url);
        
        if(urlparts.pathname === "/request") {
            var params;

            try {
                if(req.method === "POST" && req.headers['content-type'] === "application/json") {
                    params = JSON.parse(req.entity_body);
                } else if(req.method === "GET") {
                    var query = querystring.parse(urlparts.query);
                    params = JSON.parse(query.params);
                }
            } catch(e) {
                res.writeHead(400);
                res.end("Invalid request, malformed JSON data");
                return;
            }

            var client = params.client;
            
            if(clients[client]) {
                
                requests[txid] = function(reply) {
                    //res.headers['content-type'] = "application/json";
                    res.writeHead(200, { 'content-type':"application/json" });
                    res.end(JSON.stringify(reply.message));
                }
                
                clients[client].emit('request', { txid: txid, message: params.message});
                txid++;
            } else {
                console.log("bad request: ", params);
                res.writeHead(400);
                res.end("Invalid target client: " + params.client);
            }
        }
    });    
}
